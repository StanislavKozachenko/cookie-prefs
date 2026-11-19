// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definePrefs, pref } from '../../index';

const clearCookies = () => {
  for (const pair of document.cookie.split('; '))
    if (pair) document.cookie = `${pair.split('=')[0]}=; Max-Age=0; Path=/`;
};

afterEach(() => {
  clearCookies();
  document.documentElement.removeAttribute('data-sidebar');
  vi.unstubAllGlobals();
});

const make = () =>
  definePrefs({
    theme: pref.enum(['light', 'dark']).default('light'),
    sidebar: pref.boolean().default(true).reflect('data-sidebar'),
  });

/** Another tab writing the shared cookie jar. */
const otherTabWrites = (cookie: string) => {
  document.cookie = cookie;
};

/** In-memory BroadcastChannel: delivers to every other open instance, synchronously. */
const fakeChannels = () => {
  const open = new Set<FakeChannel>();
  const created: FakeChannel[] = [];
  class FakeChannel {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    constructor(readonly name: string) {
      open.add(this);
      created.push(this);
    }
    postMessage(data: unknown) {
      for (const c of open) if (c !== this && c.name === this.name) c.onmessage?.({ data });
    }
    close() {
      open.delete(this);
    }
  }
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  return { open, created, Channel: FakeChannel };
};

describe('CookieStore change event', () => {
  const stubStore = () => {
    const store = new EventTarget();
    const add = vi.spyOn(store, 'addEventListener');
    const remove = vi.spyOn(store, 'removeEventListener');
    vi.stubGlobal('cookieStore', store);
    const channels = fakeChannels();
    return { store, add, remove, channels, change: () => store.dispatchEvent(new Event('change')) };
  };

  it('notifies subscribers of changes made by other tabs and reflects them', () => {
    const { change } = stubStore();
    const prefs = make();
    const listener = vi.fn();
    const off = prefs.sidebar.subscribe(listener);
    otherTabWrites('sidebar=false');
    change();
    expect(listener).toHaveBeenCalledWith(false);
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('false');
    off();
  });

  it('ignores the echo of this tab’s own writes and unrelated cookie changes', () => {
    const { change } = stubStore();
    const prefs = make();
    const listener = vi.fn();
    const off = prefs.theme.subscribe(listener);
    prefs.theme.set('dark');
    change(); // the browser fires `change` for our own write too
    otherTabWrites('unrelated=1');
    change();
    expect(listener.mock.calls).toEqual([['dark']]);
    off();
  });

  it('attaches one listener on the first subscribe and detaches it after the last', () => {
    const { add, remove } = stubStore();
    const prefs = make();
    expect(add).not.toHaveBeenCalled();
    const offs = [prefs.theme.subscribe(() => {}), prefs.theme.subscribe(() => {}), prefs.sidebar.subscribe(() => {})];
    expect(add).toHaveBeenCalledTimes(1);
    offs[0]!();
    offs[2]!();
    expect(remove).not.toHaveBeenCalled();
    offs[1]!();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0]![1]).toBe(add.mock.calls[0]![1]);
    prefs.theme.subscribe(() => {})();
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('does not use BroadcastChannel at all', () => {
    const { channels, change } = stubStore();
    const prefs = make();
    const off = prefs.theme.subscribe(() => {});
    prefs.theme.set('dark');
    change();
    expect(channels.created).toHaveLength(0);
    off();
  });

  it('sets no timer: the event comes with the cookie', () => {
    vi.useFakeTimers();
    const { change } = stubStore();
    const prefs = make();
    const listener = vi.fn();
    const off = prefs.theme.subscribe(listener);
    otherTabWrites('theme=dark');
    change();
    expect(listener.mock.calls).toEqual([['dark']]);
    expect(vi.getTimerCount()).toBe(0);
    off();
    vi.useRealTimers();
  });

  it('stops notifying after unsubscribe', () => {
    const { change } = stubStore();
    const prefs = make();
    const listener = vi.fn();
    prefs.theme.subscribe(listener)();
    otherTabWrites('theme=dark');
    change();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('BroadcastChannel fallback', () => {
  it('posts after every write and notifies subscribers in other tabs', () => {
    const { Channel } = fakeChannels();
    const tabA = make();
    const tabB = make(); // same module state stands in for the other tab's own copy
    const listener = vi.fn();
    const off = tabB.sidebar.subscribe(listener);

    // A write from tab A posts; tab B re-reads and sees no change (one cookie jar here).
    tabA.sidebar.set(false);
    expect(listener.mock.calls).toEqual([[false]]);

    // A real other tab: cookie changes, then its post arrives.
    otherTabWrites('sidebar=true');
    new Channel('cookie-prefs').postMessage(0);
    expect(listener.mock.calls).toEqual([[false], [true]]);
    off();
  });

  it('suppresses the echo of this tab’s own writes', () => {
    const { Channel } = fakeChannels();
    const prefs = make();
    const listener = vi.fn();
    const off = prefs.theme.subscribe(listener);
    prefs.theme.set('dark');
    new Channel('cookie-prefs').postMessage(0);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('opens the listening channel lazily and closes it after the last unsubscribe', () => {
    const { open, created } = fakeChannels();
    const prefs = make();
    expect(created).toHaveLength(0);
    const a = prefs.theme.subscribe(() => {});
    const b = prefs.sidebar.subscribe(() => {});
    expect(open.size).toBe(1);
    a();
    expect(open.size).toBe(1);
    b();
    expect(open.size).toBe(0);
  });

  it('closes the posting channel right after each write', () => {
    const { open, created } = fakeChannels();
    const prefs = make();
    prefs.theme.set('dark');
    prefs.theme.reset();
    expect(created).toHaveLength(2);
    expect(open.size).toBe(0);
  });

  it('works with the real BroadcastChannel across instances', async () => {
    const prefs = make();
    const listener = vi.fn();
    const off = prefs.theme.subscribe(listener);
    otherTabWrites('theme=dark');
    const other = new BroadcastChannel('cookie-prefs');
    other.postMessage(0);
    other.close();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith('dark'));
    off();
  });

  it('falls back to no channel where BroadcastChannel cannot be constructed', () => {
    // Chromium in an opaque origin (a sandboxed iframe without allow-same-origin), where
    // CookieStore is missing too
    const Channel = vi.fn(function () {
      throw new DOMException("Can't create BroadcastChannel in an opaque origin", 'SecurityError');
    });
    vi.stubGlobal('BroadcastChannel', Channel);
    const prefs = make();
    const listener = vi.fn();
    let off = () => {};
    expect(() => (off = prefs.theme.subscribe(listener))).not.toThrow();
    expect(() => prefs.theme.set('dark')).not.toThrow();
    expect(listener).toHaveBeenCalledWith('dark');
    expect(Channel).toHaveBeenCalled();
    expect(off).not.toThrow();
  });

  it('still works locally with neither CookieStore nor BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const prefs = make();
    const listener = vi.fn();
    const off = prefs.theme.subscribe(listener);
    prefs.theme.set('dark');
    expect(listener).toHaveBeenCalledWith('dark');
    off();
  });
});

// In a real browser the message can arrive before the written cookie shows in this tab's
// `document.cookie` (Firefox in most runs without CookieStore, Chromium under load).
describe('BroadcastChannel message before the cookie', () => {
  /** The schedule: re-checks 16, 48, 112, 240, 496, 1008, 2032 and 4080 ms after the message. */
  const LAST = 4080;

  const setup = () => {
    vi.useFakeTimers();
    const { Channel } = fakeChannels();
    const prefs = make();
    const message = () => new Channel('cookie-prefs').postMessage(0);
    return { prefs, message };
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('picks up the cookie when it lands after the message, notifying once', () => {
    const { prefs, message } = setup();
    const listener = vi.fn();
    const off = prefs.sidebar.subscribe(listener);
    message(); // the other tab wrote sidebar=false, not visible here yet
    expect(listener).not.toHaveBeenCalled();
    const snapshots = [prefs.sidebar.get()];
    for (let t = 1; t <= LAST + 100; t++) {
      if (t == 30) otherTabWrites('sidebar=false');
      vi.advanceTimersByTime(1);
      snapshots.push(prefs.sidebar.get());
      if (t == 47) expect(listener).not.toHaveBeenCalled();
      if (t == 48) expect(listener.mock.calls).toEqual([[false]]);
    }
    expect(listener.mock.calls).toEqual([[false]]);
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('false');
    // the snapshot goes from the old value to the new one once and never back
    const flip = snapshots.indexOf(false);
    expect(flip).toBe(30);
    expect(snapshots.slice(0, flip).every((v) => v === true)).toBe(true);
    expect(snapshots.slice(flip).every((v) => v === false)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    off();
  });

  it('notifies nothing when nothing changed, and stops after the last re-check', () => {
    const { prefs, message } = setup();
    const listener = vi.fn();
    const off = prefs.theme.subscribe(listener);
    const reads = vi.spyOn(Document.prototype, 'cookie', 'get');
    message();
    vi.advanceTimersByTime(LAST - 1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(reads).toHaveBeenCalledTimes(9); // on the message, then 8 timers
    expect(listener).not.toHaveBeenCalled();
    // a cookie later than that waits for the tab to be shown again
    otherTabWrites('theme=dark');
    vi.runAllTimers();
    expect(listener).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(listener.mock.calls).toEqual([['dark']]);
    off();
  });

  it('starts over on a new message, with one timer at a time', () => {
    const { prefs, message } = setup();
    const listener = vi.fn();
    const off = prefs.theme.subscribe(listener);
    message();
    vi.advanceTimersByTime(1000);
    message();
    message();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(LAST - 1);
    otherTabWrites('theme=dark');
    vi.advanceTimersByTime(1);
    expect(listener.mock.calls).toEqual([['dark']]);
    expect(vi.getTimerCount()).toBe(0);
    off();
  });

  it('still drops the echo of this tab’s own writes', () => {
    const { prefs } = setup();
    const listener = vi.fn();
    const other = make(); // another definePrefs in this tab, same cookie name
    const otherListener = vi.fn();
    const offs = [prefs.theme.subscribe(listener), other.theme.subscribe(otherListener)];
    prefs.theme.set('dark'); // posts; this tab's listening channel gets it too
    vi.runAllTimers();
    expect(listener.mock.calls).toEqual([['dark']]);
    expect(otherListener.mock.calls).toEqual([['dark']]);
    offs.forEach((off) => off());
  });

  it('clears the timer after the last unsubscribe', () => {
    const { prefs, message } = setup();
    const off = prefs.theme.subscribe(() => {});
    message();
    expect(vi.getTimerCount()).toBe(1);
    off();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer when a re-check’s listener unsubscribes the last pref', () => {
    const { prefs, message } = setup();
    const listener = vi.fn(() => off());
    const off = prefs.theme.subscribe(listener);
    message();
    otherTabWrites('theme=dark');
    vi.advanceTimersByTime(16);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sets no timer in a hidden tab, which re-checks when shown', () => {
    const { prefs, message } = setup();
    const listener = vi.fn();
    const off = prefs.theme.subscribe(listener);
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    message();
    expect(vi.getTimerCount()).toBe(0);
    otherTabWrites('theme=dark');
    state.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(listener.mock.calls).toEqual([['dark']]);
    off();
  });

  it('never throws from a re-check, even when reading the cookie throws', () => {
    const { prefs, message } = setup();
    const listener = vi.fn();
    const off = prefs.theme.subscribe(listener);
    vi.spyOn(Document.prototype, 'cookie', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => {
      message();
      vi.runAllTimers();
    }).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
    off();
  });
});

describe('tab shown again', () => {
  const show = (state: DocumentVisibilityState) => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
    document.dispatchEvent(new Event('visibilitychange'));
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('re-checks subscribed prefs for changes nothing announced', () => {
    fakeChannels(); // no CookieStore: a server `Set-Cookie` fires nothing
    const prefs = make();
    const listener = vi.fn();
    const off = prefs.sidebar.subscribe(listener);
    otherTabWrites('sidebar=false'); // or a tab on a sibling subdomain, which posts elsewhere
    show('hidden');
    expect(listener).not.toHaveBeenCalled();
    show('visible');
    expect(listener.mock.calls).toEqual([[false]]);
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('false');
    off();
  });

  it('stops listening after the last unsubscribe', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const prefs = make();
    const listener = vi.fn();
    prefs.theme.subscribe(listener)();
    const added = add.mock.calls.filter((c) => c[0] == 'visibilitychange');
    expect(added).toHaveLength(1);
    expect(remove.mock.calls.filter((c) => c[0] == 'visibilitychange')).toEqual(added);
    otherTabWrites('theme=dark');
    show('visible');
    expect(listener).not.toHaveBeenCalled();
  });
});

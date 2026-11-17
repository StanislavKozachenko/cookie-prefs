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
    new Channel('prefkit').postMessage(0);
    expect(listener.mock.calls).toEqual([[false], [true]]);
    off();
  });

  it('suppresses the echo of this tab’s own writes', () => {
    const { Channel } = fakeChannels();
    const prefs = make();
    const listener = vi.fn();
    const off = prefs.theme.subscribe(listener);
    prefs.theme.set('dark');
    new Channel('prefkit').postMessage(0);
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
    const other = new BroadcastChannel('prefkit');
    other.postMessage(0);
    other.close();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith('dark'));
    off();
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

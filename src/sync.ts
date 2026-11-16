/**
 * Cross-tab sync. Other tabs' writes arrive as a CookieStore `change` event where the
 * API exists, else as a message on a BroadcastChannel posted after each write. Either
 * way every subscribed pref re-reads `document.cookie` and notifies only if its value
 * changed, which also drops the echo of this tab's own writes.
 */

const CHANNEL = 'prefkit';

/** Re-check functions of prefs that have at least one listener. */
const subs = new Set<() => void>();
let off: (() => void) | undefined;

const changed = () => subs.forEach((check) => check());

/** Add or remove a pref's re-check; attaches the listener on the first, detaches on the last. */
export const hub = (check: () => void, on: boolean) => {
  if (on) subs.add(check);
  else subs.delete(check);
  if (!subs.size) {
    off?.();
    off = undefined;
  } else if (!off) {
    const store = globalThis.cookieStore;
    if (store) {
      store.addEventListener('change', changed);
      off = () => store.removeEventListener('change', changed);
    } else if (typeof BroadcastChannel == 'function') {
      const channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = changed;
      off = () => channel.close();
    } else off = () => {};
  }
};

/** Tell other tabs a pref changed, when they cannot learn it from CookieStore. */
export const post = () => {
  if (!globalThis.cookieStore && typeof BroadcastChannel == 'function') {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(0);
    channel.close();
  }
};

/**
 * Cross-tab sync. Other tabs' writes arrive as a CookieStore `change` event where the
 * API exists, else as a message on a BroadcastChannel posted after each write, which can
 * arrive before the cookie and is therefore followed by a few delayed re-checks. Changes
 * nothing announces (a server `Set-Cookie` without CookieStore, a tab on a sibling
 * subdomain) are picked up when the tab becomes visible. Every time, each subscribed
 * pref re-reads `document.cookie` and notifies only if its value changed, which also
 * drops the echo of this tab's own writes.
 */

/**
 * A channel to the other tabs, when they cannot learn about writes from CookieStore.
 * None where `BroadcastChannel` is missing or throws (an opaque origin, e.g. a
 * sandboxed iframe): writes then reach only this tab.
 */
const open = () => {
  try {
    return globalThis.cookieStore ? undefined : new BroadcastChannel('cookie-prefs');
  } catch {
    // no channel
  }
};

/** Re-check functions of prefs that have at least one listener. */
const subs = new Set<() => void>();
/** The listening channel, while `subs` is not empty. */
let channel: BroadcastChannel | undefined;

/** The pending re-check after a channel message, while `subs` is not empty. */
let timer: ReturnType<typeof setTimeout> | undefined;

const changed = () => subs.forEach((check) => check());
/** Re-check on `visibilitychange` once the tab is shown, like `PrefsProvider` re-applies `<html>`. */
const shown = () => document.visibilityState == 'visible' && changed();

/**
 * Re-check on a channel message, then again after 16, 32, ... 2048 ms (4 s in all) while
 * the tab is visible: the message can arrive before the written cookie shows in this
 * tab's `document.cookie` (it travels separately, between processes), and nothing else
 * would announce it. A new message starts over; a hidden tab stops and re-checks when
 * shown. The next timer is set before the re-check, so a listener that unsubscribes the
 * last pref clears it.
 */
const retry = (delay: number) => {
  clearTimeout(timer);
  if (delay < 4096 && document.visibilityState == 'visible') timer = setTimeout(retry, delay, delay * 2);
  changed();
};

/**
 * Add or remove a pref's re-check; attaches the listeners on the first, detaches them
 * after the last. Removing a re-check that is not there changes nothing.
 */
export const hub = (check: () => void, on: boolean) => {
  if (on ? subs.add(check).size == 1 : subs.delete(check) && !subs.size) {
    // the same calls both ways; the channel cannot be re-attached, so it is replaced
    const method = on ? 'addEventListener' : 'removeEventListener';
    globalThis.cookieStore?.[method]('change', changed);
    document[method]('visibilitychange', shown);
    clearTimeout(timer);
    channel?.close();
    channel = on ? open() : undefined;
    if (channel) channel.onmessage = () => retry(16);
  }
};

/**
 * Tell other tabs a pref changed, when they cannot learn it from CookieStore. Through a
 * channel of its own, so this tab's listening channel gets it too and other prefs with
 * the same cookie name (another `definePrefs`, another copy of the core) follow, as
 * CookieStore `change` fires for this tab's writes.
 */
export const post = () => {
  const channel = open();
  channel?.postMessage(0);
  channel?.close();
};

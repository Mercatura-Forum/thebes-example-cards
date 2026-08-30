/**
 * session — the Memphis session, for any site, with or without a framework.
 *
 * `useMemphisConnect` is the React face of this file. This is the one underneath
 * it: plain TypeScript, no React import, usable from a static page, a Vue or
 * Svelte app, a Boosta build, or a script tag. Every Thebes site should hold its
 * session through here rather than reaching into `window.memphis` directly, so
 * there is one implementation to fix when a rule changes.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AS A SHARED MODULE
 * ────────────────────────────────────────────────────────────────────────────
 * Thebes Hosting kept its session per page. `signup.html` held the token in a
 * local variable and never wrote it down, so a person finished the three-factor
 * ceremony, was sent to the panel, and arrived signed out. `panel.html` and
 * `admin.html` each kept their own copy under the same storage key while
 * connecting under DIFFERENT app names, so each one's sign-in logged the other
 * out. No expiry was stored, so a dead session was only discovered by making a
 * call and watching it fail — indistinguishable from the network being down.
 *
 * Every one of those is a bug about session bookkeeping, not about identity, and
 * every site that rolls its own will write them again. Hence this file.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE RULES IT ENFORCES
 * ────────────────────────────────────────────────────────────────────────────
 *   • ONE session per origin. Keyed by origin and app name, so two pages of the
 *     same site always agree and two different sites never collide.
 *   • The expiry travels with the token, and a passed expiry is a local miss —
 *     no round trip, and the person is told their session ended rather than
 *     being silently returned to a sign-in screen.
 *   • A redirect-mode return is collected before anything else, and the URL
 *     fragment is stripped, so a token is never left in the address bar.
 *   • Signing out is local. It forgets the token this site holds; it does not
 *     end the person's Memphis session, which a relying site cannot do and
 *     should not be able to.
 *
 * Requires `memphis-connect.js` loaded as a <script> tag.
 */
export interface ConnectSession {
    /** The app name this credential was minted for. */
    app: string;
    /** The person's Memphis handle. */
    name: string;
    /** 32-byte anchor_id_hash, hex. Never the raw anchor. */
    anchorId: string;
    /** The origin-scoped session token, hex. This is what your contract verifies. */
    token: string;
    /** The web origin this token is valid at, and only at. */
    origin: string;
    /** Local upper bound on validity. The contract remains the authority. */
    expiresAtMs: number;
}
export interface ConnectOptions {
    /** "popup" (default), "redirect", or "auto" to fall back when blocked. */
    mode?: 'popup' | 'redirect' | 'auto';
    /** Prefill for the handle field. Authorises nothing. */
    handle?: string;
    /** Redirect mode only. Must be on this app's own origin. */
    returnTo?: string;
    /** Override the Memphis connect page (tests, staging). */
    connectUrl?: string;
    /** Popup mode only. Default 120000. */
    timeoutMs?: number;
    /** Pass false to force a fresh ceremony even if a live token is held. */
    reuse?: boolean;
}
/**
 * A storage key this site used before adopting this module.
 *
 * Read once and adopted, so shipping the shared store does not sign out
 * everyone who was already signed in. Without this the upgrade itself is an
 * outage for every logged-in customer.
 */
export interface LegacySessionKey {
    key: string;
    /** Map the old stored shape onto a ConnectSession, or null if unreadable. */
    adopt: (raw: string) => Omit<ConnectSession, 'app' | 'origin'> | null;
}
/** True when this session is present and has not passed its local expiry. */
export declare function isLive(s: ConnectSession | null | undefined): s is ConnectSession;
/**
 * The session this site holds, or null.
 *
 * Checks the shared store first, then any legacy key, adopting the first one it
 * can read so an already-signed-in person is carried across rather than logged
 * out. Never returns an expired session.
 */
export declare function getSession(app: string, legacy?: LegacySessionKey[]): ConnectSession | null;
/**
 * Collect a redirect-mode sign-in, if this page load is one.
 *
 * Safe to call on every load and safe when there is nothing to collect. Call it
 * BEFORE `getSession`: it also strips the URL fragment, so a token is never
 * left sitting in the address bar to be copied into a bug report or a shared
 * link.
 */
export declare function resumeFromRedirect(): ConnectSession | null;
/**
 * Sign in, returning an origin-scoped session for this app.
 *
 * MUST be called inside a user gesture — a popup opened outside one is blocked,
 * and a redirect outside one is a navigation the person did not ask for. Do not
 * `await` anything before it: an await ends the gesture, which is the most
 * common way this stops working on iPhone.
 *
 * `mode: 'auto'` is the right default for production. An in-app browser (a link
 * opened from WhatsApp, Instagram or LinkedIn) and iOS Safari outside a gesture
 * both block popups, and without the redirect fallback those visitors cannot
 * sign in at all.
 */
export declare function signIn(app: string, opts?: ConnectOptions): Promise<ConnectSession>;
/**
 * Forget the token this site holds, and any legacy copy of it.
 *
 * Local only. It does not end the person's Memphis session — `end_session` is
 * caller-scoped on Memphis, so only the Memphis origin can do that, which is
 * the correct boundary.
 */
export declare function signOut(app: string, legacy?: LegacySessionKey[]): void;
/**
 * The live session, renewing it silently first if the access token has lapsed.
 *
 * This is the call that keeps someone signed in for weeks. An access token is
 * good for 30 minutes; the refresh credential behind it is good for far longer,
 * and exchanging it needs no window, no gesture and no passkey prompt. Prefer
 * this over `getSession` anywhere an await is possible — `getSession` is the
 * synchronous best-effort view, this is the truthful one.
 *
 * Returns null only when there is genuinely nothing left, at which point the
 * person has to sign in properly.
 *
 * Silent renewal additionally needs `passkey.js` loaded, since it owns the
 * Memphis transport. Without it this degrades to `getSession` rather than
 * failing — sign-in still works, it just stops being durable.
 */
export declare function ensureSession(app: string, legacy?: LegacySessionKey[]): Promise<ConnectSession | null>;
/**
 * Watch for this site's session changing in ANOTHER tab, and react.
 *
 * The `storage` event fires only in other documents of the same origin, which
 * is exactly what is wanted: sign out in one tab and the others notice instead
 * of carrying on with a token that has been forgotten, and sign in in one tab
 * and the others can fill themselves in. Returns an unsubscribe function.
 */
export declare function onSessionChange(app: string, cb: (s: ConnectSession | null) => void): () => void;
//# sourceMappingURL=session.d.ts.map
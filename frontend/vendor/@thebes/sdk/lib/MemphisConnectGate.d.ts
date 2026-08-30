/**
 * MemphisConnectGate — the drop-in sign-in for an app served from ITS OWN domain.
 *
 * The twin of <MemphisGate>. Same shape, same open-demo behaviour: it always
 * renders the app and exposes the session through useConnectAuth(), so visitors
 * roam freely and sign in on demand from the header chip.
 *
 * Use this one whenever your app is not served from the Memphis origin — which
 * is every app with a domain of its own. <MemphisGate> runs the passkey ceremony
 * in the page, and a page may only claim an RP ID that is a registrable-domain
 * suffix of its own origin, so on your domain the browser refuses it outright.
 * This gate opens the ceremony at the Memphis origin instead and receives back a
 * token minted for YOUR origin.
 *
 *     <MemphisConnectGate app="My App">
 *       <App />
 *     </MemphisConnectGate>
 *
 * Then pass `useConnectAuth().token` to your contract, which verifies it with
 * `await* MemphisAuth.verifyWithAudience(gate, session, AUDIENCE)`.
 *
 * Requires `memphis-connect.js` loaded as a <script> tag. Copy it as-is; only
 * the per-app `--color-accent` token tunes the chip to its host app.
 */
import { type ReactNode } from 'react';
import { type MemphisConnectAuth } from './useMemphisConnect.js';
import type { ConnectOptions } from './session.js';
/** The Memphis session + sign-in/out. Throws if used outside the gate. */
export declare function useConnectAuth(): MemphisConnectAuth;
/**
 * Open-demo gate: never blocks the app.
 *
 * @param app  The name shown to the person in the connect window, and the key
 *             this app's session is stored under. Keep it stable across releases
 *             or people are silently signed out.
 */
export declare function MemphisConnectGate({ app, children }: {
    app: string;
    children: ReactNode;
}): import("react").JSX.Element;
/**
 * Header chip. Signed in → "Signed in as <name>" + Sign out. Guest → a single
 * "Sign in" button.
 *
 * There is deliberately no handle input here. The connect window owns that
 * field, and it must: a person types their handle on the Memphis origin, where
 * the address bar shows them who is asking. Collecting it on the app's own page
 * teaches exactly the habit a phishing page needs.
 *
 * `mode` defaults to "auto" — a popup, falling back to a full-page redirect when
 * the browser blocks it. An in-app WebView (Instagram, LinkedIn) and iOS Safari
 * outside a gesture both block popups, and without the fallback those visitors
 * simply cannot sign in.
 */
export declare function ConnectChip({ className, mode }: {
    className?: string;
    mode?: ConnectOptions['mode'];
}): import("react").JSX.Element;
//# sourceMappingURL=MemphisConnectGate.d.ts.map
/**
 * MemphisGate — Memphis passkey sign-in as the app's web auth, open-demo style.
 *
 * Wrap the app's routes in <MemphisGate>. The gate ALWAYS renders the app and
 * exposes the session via useAuth(), so visitors roam freely and sign in on
 * demand from the header chip. Memphis (cid 921) provides the human identity +
 * display name; the on-chain caller stays the boundary's persisted browser key,
 * so reads — and demo writes — work whether or not you have signed in.
 *
 * This file is identical across every Thebes example — copy it as-is. Only the
 * per-app `--color-accent` token (in index.css) tunes the chip to its host app.
 */
import { type ReactNode } from 'react';
import { type MemphisAuth } from './useMemphis.js';
/** The Memphis session + sign-in/out. Throws if used outside the gate. */
export declare function useAuth(): MemphisAuth;
/** Open-demo gate: never blocks the app. `appName`/`tagline` are accepted for
 *  API compatibility with hosted apps but are unused in the open-demo flow. */
export declare function MemphisGate({ children }: {
    appName?: string;
    tagline?: string;
    children: ReactNode;
}): import("react").JSX.Element;
/** Header chip. Signed in → "Signed in as <name>" + Sign out. Guest → a "Sign in"
 *  affordance that expands into a name input + passkey button. Native-looking;
 *  the accent comes from --color-accent. */
export declare function SignOutChip({ className }: {
    className?: string;
}): import("react").JSX.Element;
//# sourceMappingURL=MemphisGate.d.ts.map
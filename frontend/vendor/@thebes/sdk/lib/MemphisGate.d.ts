/**
 * MemphisGate — Memphis passkey sign-in as the app's web auth.
 *
 * Wrap the app's routes in <MemphisGate appName="…">. Until the visitor signs
 * in with a passkey, the gate shows a sign-in card; once signed in, it renders
 * the app and exposes the session via useAuth() so the header can greet the
 * user and offer sign-out. Memphis (cid 921) provides the human identity +
 * display name; the on-chain caller stays the boundary's persisted browser key.
 *
 * This file is identical across every Thebes example — copy it as-is. Only the
 * per-app `--color-accent` token (in index.css) and the appName/tagline props
 * differ, so the gate always looks native to its host app.
 */
import { type ReactNode } from 'react';
import { type MemphisAuth } from './useMemphis.js';
/** The signed-in Memphis session + sign-out. Throws if used outside the gate. */
export declare function useAuth(): MemphisAuth;
export declare function MemphisGate({ appName, tagline, children }: {
    appName: string;
    tagline?: string;
    children: ReactNode;
}): import("react").JSX.Element;
/** Compact "signed in as … · Sign out" chip for app headers. Native-looking;
 *  the accent comes from --color-accent. */
export declare function SignOutChip({ className }: {
    className?: string;
}): import("react").JSX.Element;
//# sourceMappingURL=MemphisGate.d.ts.map
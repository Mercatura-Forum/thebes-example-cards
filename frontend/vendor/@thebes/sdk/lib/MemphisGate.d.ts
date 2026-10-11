/**
 * MemphisGate, Memphis passkey sign-in as the app's web auth, open-demo style.
 *
 * Wrap the app's routes in <MemphisGate>. The gate ALWAYS renders the app and
 * exposes the session via useAuth(), so visitors roam freely and sign in on
 * demand from the header chip. Memphis (cid 921) provides the human identity +
 * display name; the on-chain caller stays the boundary's persisted browser key,
 * so reads, and demo writes, work whether or not you have signed in.
 *
 * IMPORT this from '@thebes/sdk'; do NOT copy it into an app. Five examples
 * (chat, booking, restaurant, crm, cards) kept a local fork of this file, and
 * when the signup ceremony grew its recovery-phrase step those forks silently
 * lost it: they still called the updated useMemphis(), which suspends until
 * confirmPhrase(), but rendered no overlay, so signup hung at "Signing in…"
 * forever. An app that genuinely needs its own gate must render the exported
 * <RecoveryPhrasePanel auth={auth} /> alongside its children.
 *
 * Only the per-app `--color-accent` token (in index.css) tunes the chip to its
 * host app.
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
/** The recovery-phrase step of a new-identity ceremony.
 *
 *  Memphis needs three factors to create an identity (INV-MEM-1): a device
 *  passkey, a second passkey, and this phrase. It is shown BEFORE any passkey
 *  prompt, because it is the one factor a person has to transcribe, and it is
 *  rendered by the gate rather than the chip so that it is a full overlay, not
 *  a dropdown that a short viewport can push Continue out of.
 *
 *  Nothing is created until Continue is pressed: cancelling here leaves no
 *  half-made identity behind.
 *
 *  EXPORTED, and takes `auth` explicitly, because several examples wrap the app
 *  in their OWN gate with their OWN context rather than this one. Such a gate
 *  gets the fixed `useMemphis()`: which suspends the ceremony until
 *  `confirmPhrase()`: but renders no overlay, so signup hangs on a
 *  confirmation the UI never shows. Those gates render this panel directly and
 *  pass their own `auth`; the context fallback keeps <MemphisGate> unchanged. */
export declare function RecoveryPhrasePanel({ auth: authProp }?: {
    auth?: MemphisAuth;
}): import("react").JSX.Element | null;
/** Header chip. Signed in → "Signed in as <name>" + Sign out. Guest → a "Sign in"
 *  affordance that expands into a name input + passkey button. Native-looking;
 *  the accent comes from --color-accent. */
export declare function SignOutChip({ className }: {
    className?: string;
}): import("react").JSX.Element;
//# sourceMappingURL=MemphisGate.d.ts.map
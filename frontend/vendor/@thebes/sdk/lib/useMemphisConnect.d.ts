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
export interface MemphisConnectAuth {
    session: ConnectSession | null;
    signedIn: boolean;
    displayName: string;
    /** The scoped token to pass to your contract, or undefined when signed out. */
    token: string | undefined;
    /** MUST be called from a user gesture — a popup or redirect outside one is blocked. */
    signIn: (opts?: ConnectOptions) => Promise<void>;
    signOut: () => void;
    busy: boolean;
    error: string | undefined;
}
/**
 * @param app  The name shown to the person in the connect window, and the key
 *             this app's session is stored under. Keep it stable.
 */
export declare function useMemphisConnect(app: string): MemphisConnectAuth;
//# sourceMappingURL=useMemphisConnect.d.ts.map
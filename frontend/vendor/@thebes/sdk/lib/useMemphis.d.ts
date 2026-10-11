export interface MemphisSession {
    name: string;
    anchor_id_hex: string;
    session_token_hex: string;
    expires_at_ns: number;
    display_tag: string;
}
export interface MemphisAuth {
    session: MemphisSession | null;
    signedIn: boolean;
    displayName: string;
    signIn: (name: string) => Promise<void>;
    signOut: () => Promise<void>;
    busy: boolean;
    error: string | undefined;
    /** The twelve recovery words, while a signup is waiting for the person to
     *  confirm they have written them down. Null at every other moment. */
    phrase: string | null;
    /** They wrote it down, continue the ceremony. */
    confirmPhrase: () => void;
    /** Abort. Nothing has been created, so nothing needs undoing. */
    cancelPhrase: () => void;
    /** Which factor the ceremony is on, for a UI that wants to say so. */
    progress: string | undefined;
}
export declare function useMemphis(): MemphisAuth;
//# sourceMappingURL=useMemphis.d.ts.map
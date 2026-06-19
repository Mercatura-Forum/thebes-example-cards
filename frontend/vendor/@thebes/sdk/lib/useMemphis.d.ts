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
}
export declare function useMemphis(): MemphisAuth;
//# sourceMappingURL=useMemphis.d.ts.map
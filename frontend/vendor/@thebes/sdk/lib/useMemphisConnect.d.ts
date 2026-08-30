import { type ConnectSession, type ConnectOptions, type LegacySessionKey } from './session.js';
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
 * @param app     The name shown to the person in the connect window, and the key
 *                this app's session is stored under. Keep it stable across
 *                releases or people are silently signed out.
 * @param legacy  Storage keys this site used before adopting the SDK. Read once
 *                and adopted, so shipping this does not log out everyone who was
 *                already signed in.
 */
export declare function useMemphisConnect(app: string, legacy?: LegacySessionKey[]): MemphisConnectAuth;
//# sourceMappingURL=useMemphisConnect.d.ts.map
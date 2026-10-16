/**
 * useMemphis, Memphis passkey sign-in as the app's web auth, over the proven
 * `window.MemphisPasskey` client (vendored passkey.js). This is the reusable
 * pattern for every Thebes example: sign in with a passkey → a session with a
 * stable Memphis identity (anchor + display name) → use the display name (and,
 * where a backend needs the cross-device principal, the session token) in calls.
 *
 * The Memphis contract is cid 921; the session is persisted in localStorage by
 * the client, so a refresh keeps you signed in.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
function pk() {
    const p = window.MemphisPasskey;
    if (!p)
        throw new Error('passkey.js not loaded (window.MemphisPasskey missing)');
    return p;
}
function recovery() {
    const r = window.MemphisRecovery;
    if (!r)
        throw new Error('recovery.js not loaded, so a new identity cannot be created safely (window.MemphisRecovery missing)');
    return r;
}
export function useMemphis() {
    const [session, setSession] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState();
    const [phrase, setPhrase] = useState(null);
    const [progress, setProgress] = useState();
    // Resolves when the person answers the recovery-phrase step.
    const phraseAnswer = useRef(null);
    useEffect(() => {
        try {
            setSession(pk().loadSession());
        }
        catch { /* passkey.js not present yet */ }
    }, []);
    const confirmPhrase = useCallback(() => { phraseAnswer.current?.(true); }, []);
    const cancelPhrase = useCallback(() => { phraseAnswer.current?.(false); }, []);
    // A new identity needs THREE factors (Memphis INV-MEM-1, MIN_FACTORS_AT_SIGNUP
    // = 3): this device's passkey, a second passkey, and a
    // recovery-phrase key. All three sign the SAME registration challenge, so
    // they land as one atomic `register`.
    //
    // The phrase comes first on purpose. It is the only factor a person has to
    // copy out by hand, and generating it before any passkey prompt means a
    // ceremony abandoned at this step leaves no identity behind.
    const runCeremony = useCallback(async (p, name) => {
        const rec = recovery();
        setProgress('A new identity needs three factors, passkey, second passkey, recovery phrase.');
        const words = await rec.generatePhrase();
        const wrote = await new Promise((resolve) => {
            phraseAnswer.current = resolve;
            setPhrase(words);
        });
        phraseAnswer.current = null;
        setPhrase(null);
        if (!wrote) {
            const e = new Error('Registration cancelled, nothing was created.');
            e.code = 'CANCELLED';
            throw e;
        }
        const challenge = await p.beginRegistrationChallenge();
        setProgress('Factor 1 of 3, this device’s passkey…');
        const f1 = await p.buildDeviceFactor(challenge, name);
        setProgress('Factor 2 of 3, a second passkey…');
        const f2 = await p.buildDeviceFactor(challenge, `${name} (backup)`);
        setProgress('Factor 3 of 3, your recovery phrase…');
        const f3 = await p.buildRecoveryFactor(challenge, words);
        setProgress('Creating your identity on-chain…');
        return await p.registerWithFactors(name, [f1, f2, f3]);
    }, []);
    const signIn = useCallback(async (name) => {
        setBusy(true);
        setError(undefined);
        setProgress(undefined);
        try {
            const p = pk();
            // Branch on the anchor lookup, which the canister answers directly.
            // Identity-durability P0: a lookup miss is a QUESTION for the human, not
            // a license to mint, and a sign-in must never fall through into creating
            // a second identity for a name that already exists.
            if (p.onProgress)
                p.onProgress((text) => setProgress(text));
            const existing = await p.lookupAnchor(name);
            if (existing) {
                setSession(await p.signIn(name));
                return;
            }
            // A registration this browser began and the network did not confirm in
            // time is finished here, before a new phrase is generated: the anchor
            // being finished holds the phrase from that attempt, and to the person
            // it is the identity they just created, not one that does not exist.
            if (p.resumePendingRegistration) {
                const resumed = await p.resumePendingRegistration(name);
                if (resumed) {
                    setSession(resumed);
                    return;
                }
            }
            const ok = typeof window !== 'undefined' && typeof window.confirm === 'function' &&
                window.confirm(`No Memphis identity exists for "${name}".\n\n` +
                    'Create a NEW identity with this name? It takes three factors: a passkey on ' +
                    'this device, a second passkey, and a recovery phrase you write down.\n\n' +
                    '(Cancel if you meant to sign into an existing one.)');
            if (!ok) {
                setError('Sign-in cancelled, no identity created.');
                return;
            }
            setSession(await runCeremony(p, name));
        }
        catch (e) {
            const code = e?.code;
            if (code === 'CANCELLED') {
                setError('Registration cancelled, nothing was created.');
                return;
            }
            // Say what the canister said. The earlier client passed the OUTER Result
            // tag to its error decoder, so every failure read "NotAuthenticated" and
            // sent people looking at their passkey instead of at the rule they hit.
            const msg = e instanceof Error ? e.message : String(e);
            const detail = e?.detail;
            setError(detail && detail !== msg ? `${msg}, ${detail}` : msg);
            throw e;
        }
        finally {
            // A ceremony that threw mid-flight must not leave the phrase panel up.
            phraseAnswer.current = null;
            setPhrase(null);
            setProgress(undefined);
            try {
                const p = pk();
                if (p.onProgress)
                    p.onProgress(null);
            }
            catch { /* not loaded */ }
            setBusy(false);
        }
    }, [runCeremony]);
    const signOut = useCallback(async () => {
        setBusy(true);
        try {
            await pk().signOut();
        }
        catch { /* best-effort */ }
        finally {
            setSession(null);
            setBusy(false);
        }
    }, []);
    return {
        session,
        signedIn: !!session,
        displayName: session?.display_tag || session?.name || '',
        signIn,
        signOut,
        busy,
        error,
        phrase,
        confirmPhrase,
        cancelPhrase,
        progress,
    };
}
//# sourceMappingURL=useMemphis.js.map
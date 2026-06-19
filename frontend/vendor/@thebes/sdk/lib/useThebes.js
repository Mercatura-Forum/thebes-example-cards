/**
 * useThebes — React hooks over the typed `thebes` SDK. These are the idiomatic
 * data-access primitives every Thebes example reuses:
 *   • useQuery  — read a contract query, with loading/error/refetch
 *   • useUpdate — run an update call, tracking pending/error
 *   • useMediaUpload — downscale + chunked-upload an image, with progress
 *
 * They follow React best practices: stable callbacks (useCallback), abortable
 * effects, no state updates after unmount, and explicit dependency arrays.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { query, update, uploadMedia, downscaleImage, } from './thebes.js';
/**
 * Read a contract query and map its raw reply with `decode`. Re-runs when any
 * value in `deps` changes; `decode` should be stable (define outside render or
 * memoize). Stale replies from a superseded run are ignored.
 */
export function useQuery(cid, method, argHex, decode, deps = []) {
    const [data, setData] = useState();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState();
    const runId = useRef(0);
    const run = useCallback(() => {
        const id = ++runId.current;
        setLoading(true);
        setError(undefined);
        query(cid, method, argHex)
            .then((r) => {
            if (id !== runId.current)
                return; // superseded
            const hex = r.reply_hex ?? r.reply ?? '';
            setData(decode(hex));
        })
            .catch((e) => {
            if (id !== runId.current)
                return;
            setError(e instanceof Error ? e.message : String(e));
        })
            .finally(() => {
            if (id === runId.current)
                setLoading(false);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cid, method, argHex, ...deps]);
    useEffect(() => {
        run();
        return () => {
            runId.current++; // invalidate in-flight on unmount/dep-change
        };
    }, [run]);
    return { data, loading, error, refetch: run };
}
/** Run update calls, tracking a single in-flight pending flag + last error. */
export function useUpdate() {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState();
    const call = useCallback(async (cid, method, argHex) => {
        setPending(true);
        setError(undefined);
        try {
            return await update(cid, method, argHex);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
            throw e;
        }
        finally {
            setPending(false);
        }
    }, []);
    return { call, pending, error };
}
/**
 * Downscale (client-side, to stay under the class input cap) then chunked-upload
 * an image to the media contract. The contract re-encodes server-side (pass-3),
 * so this is just a courtesy bound on upload size. Returns the stored path.
 */
export function useMediaUpload(mediaCid) {
    const [progress, setProgress] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState();
    const upload = useCallback(async (file, cls) => {
        setBusy(true);
        setError(undefined);
        setProgress(0);
        try {
            // Avatars downscale to 256, photos to 1600 (server then bounds to 1280).
            const maxDim = cls === 'avatar' ? 256 : 1600;
            const { bytes, contentType } = await downscaleImage(file, maxDim);
            return await uploadMedia(mediaCid, cls, contentType, bytes, setProgress);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
            throw e;
        }
        finally {
            setBusy(false);
        }
    }, [mediaCid]);
    return { upload, progress, busy, error };
}
//# sourceMappingURL=useThebes.js.map
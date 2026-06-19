import { type MediaClass, type FinishReply } from './thebes.js';
export interface QueryState<T> {
    data: T | undefined;
    loading: boolean;
    error: string | undefined;
    refetch: () => void;
}
/**
 * Read a contract query and map its raw reply with `decode`. Re-runs when any
 * value in `deps` changes; `decode` should be stable (define outside render or
 * memoize). Stale replies from a superseded run are ignored.
 */
export declare function useQuery<T>(cid: number, method: string, argHex: string | undefined, decode: (replyHex: string) => T, deps?: readonly unknown[]): QueryState<T>;
export interface UpdateState {
    call: (cid: number, method: string, argHex?: string) => Promise<{
        reply_hex?: string;
        reply?: string;
    }>;
    pending: boolean;
    error: string | undefined;
}
/** Run update calls, tracking a single in-flight pending flag + last error. */
export declare function useUpdate(): UpdateState;
export interface MediaUploadState {
    upload: (file: File, cls: MediaClass) => Promise<FinishReply>;
    progress: number;
    busy: boolean;
    error: string | undefined;
}
/**
 * Downscale (client-side, to stay under the class input cap) then chunked-upload
 * an image to the media contract. The contract re-encodes server-side (pass-3),
 * so this is just a courtesy bound on upload size. Returns the stored path.
 */
export declare function useMediaUpload(mediaCid: number): MediaUploadState;
//# sourceMappingURL=useThebes.d.ts.map
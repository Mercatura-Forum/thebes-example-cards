/**
 * thebes.ts — a small TYPED wrapper over the proven `window.EgyptBoundary` SDK
 * (vendored as /boundary.js). It exposes exactly what an app needs:
 *   • query / update calls to a Motoko backend (Candid-encoded args)
 *   • raw-JSON calls to the Rust media contract (its methods take serde_json)
 *   • a chunked media upload that drives start → store_chunk → finish
 *   • the persisted browser identity (a stable per-browser sender principal)
 *
 * Why wrap rather than reimplement: boundary.js is the deployed, battle-tested
 * client (Candid LEB128 + receipt polling + identity). We add types + the media
 * flow on top, so examples stay correct and teachable.
 */
/** Stable per-browser identity (28-byte sender persisted in localStorage). */
export declare function identity(): string;
export declare const EMPTY_ARGS_HEX: () => string;
/** Encode one Candid value to an arg hex string. */
export declare function encodeArg(value: unknown): string;
/** Encode an ordered list of Candid values to an arg hex string. */
export declare function encodeArgs(values: unknown[]): string;
export declare function query(cid: number, method: string, argHex?: string): Promise<{
    status?: string;
    reply_hex?: string;
    reply?: string;
    error?: string;
}>;
export declare function update(cid: number, method: string, argHex?: string): Promise<{
    status: string;
    reply_hex?: string;
    reply?: string;
    error?: string;
}>;
export declare const decodeNat: (r: string | Uint8Array) => bigint;
export declare const decodeBool: (r: string | Uint8Array) => boolean;
export declare const decodeVecRecord: (r: string | Uint8Array, fields: {
    name: string;
    type: "nat" | "int" | "bool" | "text" | "principal";
}[]) => Record<string, unknown>[];
export type MediaClass = 'avatar' | 'photo' | 'document' | 'video';
export interface FinishReply {
    path: string;
    sha256_hex: string;
    size: number;
    content_type: string;
}
/** Public boundary URL to GET a stored media path from a contract. */
export declare function mediaUrl(mediaCid: number, path: string): string;
/**
 * Upload bytes to the media contract via the chunked flow, returning the stored
 * path + metadata. The server transcodes images (pass-3) so the client only
 * needs to keep the upload under the class input cap — the caller can downscale
 * first via `downscaleImage`. `onProgress` reports 0..1 across stored chunks.
 */
export declare function uploadMedia(mediaCid: number, cls: MediaClass, contentType: string, bytes: Uint8Array, onProgress?: (fraction: number) => void): Promise<FinishReply>;
/**
 * Client-side downscale + JPEG encode via <canvas> so the upload stays under the
 * class input cap (the contract also transcodes server-side — this just bounds
 * the bytes we send). Returns JPEG bytes + content type.
 */
export declare function downscaleImage(file: File, maxDim: number, quality?: number): Promise<{
    bytes: Uint8Array;
    contentType: string;
}>;
//# sourceMappingURL=thebes.d.ts.map
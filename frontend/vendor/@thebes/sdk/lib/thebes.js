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
function boundary() {
    const b = window.EgyptBoundary;
    if (!b)
        throw new Error('boundary.js not loaded (window.EgyptBoundary missing)');
    return b;
}
/** Stable per-browser identity (28-byte sender persisted in localStorage). */
export function identity() {
    return boundary().identity();
}
export const EMPTY_ARGS_HEX = () => boundary().EMPTY_ARGS_HEX;
// ── Candid-encoded calls to a Motoko backend ──
/** Encode one Candid value to an arg hex string. */
export function encodeArg(value) {
    const b = boundary();
    return b.bytesToHex(b.encodeArg(value));
}
/** Encode an ordered list of Candid values to an arg hex string. */
export function encodeArgs(values) {
    const b = boundary();
    return b.bytesToHex(b.encodeArgs(values));
}
export function query(cid, method, argHex) {
    return boundary().callQuery(cid, method, argHex ?? boundary().EMPTY_ARGS_HEX);
}
export async function update(cid, method, argHex) {
    const r = await boundary().callUpdate(cid, method, argHex ?? boundary().EMPTY_ARGS_HEX);
    if (r.status === 'error')
        throw new Error(r.error || 'call rejected');
    return r;
}
// Re-export the decoders so app code can shape replies.
export const decodeNat = (r) => boundary().decodeNatReply(r);
export const decodeBool = (r) => boundary().decodeBoolReply(r);
export const decodeVecRecord = (r, fields) => boundary().decodeVecRecord(r, fields);
// ── Media contract (raw-JSON args) ──
const enc = new TextEncoder();
/** The media contract methods take raw JSON, NOT Candid — encode JSON → hex. */
function jsonArgHex(obj) {
    return boundary().bytesToHex(enc.encode(JSON.stringify(obj)));
}
/** Public boundary URL to GET a stored media path from a contract. */
export function mediaUrl(mediaCid, path) {
    const base = boundary().BOUNDARY || '';
    return `${base}/_/raw/${mediaCid}/${path.replace(/^\//, '')}`;
}
const CHUNK_BYTES = 32 * 1024;
function toBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++)
        s += String.fromCharCode(bytes[i]);
    return btoa(s);
}
/**
 * Upload bytes to the media contract via the chunked flow, returning the stored
 * path + metadata. The server transcodes images (pass-3) so the client only
 * needs to keep the upload under the class input cap — the caller can downscale
 * first via `downscaleImage`. `onProgress` reports 0..1 across stored chunks.
 */
export async function uploadMedia(mediaCid, cls, contentType, bytes, onProgress) {
    const uploadId = `${identity()}-${cls}-${bytes.length}-${Math.floor(performance.now())}`;
    const total = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES));
    await update(mediaCid, 'start_media_upload', jsonArgHex({
        upload_id: uploadId,
        media_class: cls,
        content_type: contentType,
        total_chunks: total,
    }));
    for (let i = 0; i < total; i++) {
        const slice = bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
        await update(mediaCid, 'store_chunk', jsonArgHex({
            upload_id: uploadId,
            chunk_index: i,
            body: toBase64(slice),
        }));
        onProgress?.((i + 1) / total);
    }
    const fin = await update(mediaCid, 'finish_media_upload', jsonArgHex({ upload_id: uploadId }));
    const hex = fin.reply_hex ?? fin.reply ?? '';
    const json = new TextDecoder().decode(boundary().hexToBytes(hex));
    return JSON.parse(json);
}
/**
 * Client-side downscale + JPEG encode via <canvas> so the upload stays under the
 * class input cap (the contract also transcodes server-side — this just bounds
 * the bytes we send). Returns JPEG bytes + content type.
 */
export async function downscaleImage(file, maxDim, quality = 0.85) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', quality));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), contentType: 'image/jpeg' };
}
//# sourceMappingURL=thebes.js.map
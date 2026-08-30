import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * MemphisGate — Memphis passkey sign-in as the app's web auth, open-demo style.
 *
 * Wrap the app's routes in <MemphisGate>. The gate ALWAYS renders the app and
 * exposes the session via useAuth(), so visitors roam freely and sign in on
 * demand from the header chip. Memphis (cid 921) provides the human identity +
 * display name; the on-chain caller stays the boundary's persisted browser key,
 * so reads — and demo writes — work whether or not you have signed in.
 *
 * This file is identical across every Thebes example — copy it as-is. Only the
 * per-app `--color-accent` token (in index.css) tunes the chip to its host app.
 */
import { createContext, useContext, useState } from 'react';
import { useMemphis } from './useMemphis.js';
const AuthCtx = createContext(null);
/** The Memphis session + sign-in/out. Throws if used outside the gate. */
export function useAuth() {
    const v = useContext(AuthCtx);
    if (!v)
        throw new Error('useAuth must be used inside <MemphisGate>');
    return v;
}
/** Open-demo gate: never blocks the app. `appName`/`tagline` are accepted for
 *  API compatibility with hosted apps but are unused in the open-demo flow. */
export function MemphisGate({ children }) {
    const auth = useMemphis();
    return _jsx(AuthCtx.Provider, { value: auth, children: children });
}
/** Header chip. Signed in → "Signed in as <name>" + Sign out. Guest → a "Sign in"
 *  affordance that expands into a name input + passkey button. Native-looking;
 *  the accent comes from --color-accent. */
export function SignOutChip({ className = '' }) {
    const auth = useAuth();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    if (auth.signedIn) {
        return (_jsxs("span", { className: `inline-flex items-center gap-2 text-xs ${className}`, children: [_jsxs("span", { className: "opacity-60", children: ["Signed in as ", auth.displayName] }), _jsx("button", { className: "rounded-md px-2 py-1 font-medium opacity-80 hover:opacity-100", style: { color: 'var(--color-accent)' }, onClick: auth.signOut, children: "Sign out" })] }));
    }
    // Memphis handles look like  <stem>.thebes  — we append ".thebes" so a visitor
    // only types the stem (3–32 chars, a–z 0–9 -). No bare fallback: an invalid
    // stem keeps the button disabled instead of failing with a cryptic error.
    const stem = name.trim().toLowerCase().replace(/\.thebes$/, '');
    const stemOk = stem.length >= 3 && stem.length <= 32 && /^[a-z0-9-]+$/.test(stem) && !stem.startsWith('-') && !stem.endsWith('-');
    const handle = `${stem}.thebes`;
    const submit = () => { if (stemOk && !auth.busy)
        auth.signIn(handle).catch(() => { }); };
    if (!open) {
        return (_jsx("span", { className: `inline-flex items-center text-xs ${className}`, children: _jsx("button", { className: "rounded-md px-2 py-1 font-medium opacity-80 hover:opacity-100", style: { color: 'var(--color-accent)' }, onClick: () => setOpen(true), children: "Sign in" }) }));
    }
    return (_jsxs("span", { className: `inline-flex flex-col items-stretch gap-1 text-xs ${className}`, children: [_jsxs("span", { className: "inline-flex items-center gap-2", children: [_jsx("input", { className: "w-28 rounded-md border border-black/10 bg-black/[0.03] px-2 py-1 outline-none focus:border-black/30", placeholder: "yourname", value: name, autoFocus: true, "aria-label": "Thebes handle", onChange: (e) => setName(e.target.value), onKeyDown: (e) => e.key === 'Enter' && submit() }), _jsx("button", { className: "rounded-md px-2 py-1 font-medium text-white disabled:opacity-50", style: { background: 'var(--color-accent)' }, onClick: submit, disabled: auth.busy || !stemOk, children: auth.busy ? 'Signing in…' : 'Sign in with passkey' })] }), _jsxs("span", { style: { fontSize: '11px', opacity: 0.7 }, children: [stem ? _jsxs(_Fragment, { children: ["\u2192 becomes ", _jsx("b", { children: handle })] }) : 'pick a handle — we add .thebes', " \u00B7 3\u201332 \u00B7 a\u2013z 0\u20139 -"] }), auth.error && _jsx("span", { className: "max-w-[10rem] truncate text-red-600", title: auth.error, children: auth.error })] }));
}
//# sourceMappingURL=MemphisGate.js.map
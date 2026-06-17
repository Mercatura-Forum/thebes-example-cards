/**
 * MemphisGate — Memphis passkey sign-in as the app's web auth.
 *
 * Same architecture + API as every other Thebes example (wrap routes in
 * <MemphisGate>, read the session via useAuth(), greet + sign out via
 * SignOutChip). The VISUAL differs from the light-card variant only because
 * Majlis is a dark felt theme — the gate is styled to look native (a felt panel
 * with the card fan) instead of the white card the light-themed apps use. The
 * auth behavior is identical: Memphis (cid 921) provides the human identity +
 * display name; the on-chain caller stays the boundary's persisted browser key.
 */
import { createContext, useContext, useState, type ReactNode } from 'react'
import { useMemphis, type MemphisAuth } from '@thebes/sdk'
import { Button, ErrorNote, Panel } from './ui'
import { Card } from './Card'

const AuthCtx = createContext<MemphisAuth | null>(null)

/** The signed-in Memphis session + sign-out. Throws if used outside the gate. */
export function useAuth(): MemphisAuth {
  const v = useContext(AuthCtx)
  if (!v) throw new Error('useAuth must be used inside <MemphisGate>')
  return v
}

export function MemphisGate({ appName, tagline, children }: { appName: string; tagline?: string; children: ReactNode }) {
  const auth = useMemphis()
  const [name, setName] = useState('')

  if (auth.signedIn) return <AuthCtx.Provider value={auth}>{children}</AuthCtx.Provider>

  const submit = () => { auth.signIn(name.trim() || 'Player').catch(() => { /* surfaced by auth.error */ }) }
  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-5 py-10">
      <header className="mb-8 text-center">
        <h1 className="font-display text-5xl font-bold text-[var(--color-gold)]">{appName}</h1>
        <p className="mt-2 text-ink-soft">{tagline ?? 'Sign in to play.'}</p>
        <div className="mt-4 flex justify-center gap-1">
          {[51, 38, 25, 12].map((c, i) => <div key={c} style={{ marginLeft: i ? -22 : 0, transform: `rotate(${(i - 1.5) * 6}deg)` }}><Card card={c} w={52} /></div>)}
        </div>
      </header>

      <Panel className="mx-auto w-full max-w-sm text-center">
        <h2 className="font-display text-xl">Sign in to play</h2>
        <p className="mt-1 text-sm text-ink-soft">A passkey is your seat at the table — no password.</p>
        <input
          className="mt-4 w-full rounded-lg bg-black/20 px-3 py-2 text-center text-ink ring-1 ring-[var(--color-gold)]/30 outline-none focus:ring-[var(--color-gold)]"
          placeholder="Your name" value={name} autoFocus
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <Button className="mt-3 w-full" onClick={submit} disabled={auth.busy}>{auth.busy ? 'Signing in…' : 'Sign in with passkey'}</Button>
        {auth.error && <div className="mt-3"><ErrorNote message={auth.error} /></div>}
        <p className="mt-4 text-xs text-ink-soft">Powered by Memphis · your passkey is your identity.</p>
      </Panel>
    </div>
  )
}

/** Compact "signed in as … · Sign out" chip for app headers. */
export function SignOutChip({ className = '' }: { className?: string }) {
  const auth = useAuth()
  return (
    <span className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <span className="text-ink-soft">Signed in as <b className="text-ink">{auth.displayName}</b></span>
      <button className="text-[var(--color-gold)] hover:underline" onClick={auth.signOut}>Sign out</button>
    </span>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, SignOutChip } from '../components/MemphisGate'
import { useQuery } from '@thebes/sdk'
import { CARDS_CID, M, decodeOpen, createTable, joinTable, type OpenTable } from '../lib/cards-api'
import { Button, Spinner, ErrorNote, Panel } from '../components/ui'
import { Card } from '../components/Card'

export function Lobby() {
  const auth = useAuth()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const open = useQuery<OpenTable[]>(CARDS_CID, M.open, undefined, decodeOpen)

  async function create(game: 'estimation' | 'tarneeb') {
    setBusy(true); setErr(undefined)
    try { nav(`/t/${(await createTable(game, auth.displayName)).toString()}`) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  async function join(id: bigint) {
    setBusy(true); setErr(undefined)
    try { await joinTable(id, auth.displayName); nav(`/t/${id.toString()}`) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-5 py-10">
      <header className="mb-8 text-center">
        <h1 className="font-display text-5xl font-bold text-[var(--color-gold)]">Majlis</h1>
        <p className="mt-2 text-ink-soft">On-chain <b>Estimation</b> & <b>Tarneeb</b> — four players, one fair deal.</p>
        <div className="mt-4 flex justify-center gap-1">
          {[51, 38, 25, 12].map((c, i) => <div key={c} style={{ marginLeft: i ? -22 : 0, transform: `rotate(${(i - 1.5) * 6}deg)` }}><Card card={c} w={52} /></div>)}
        </div>
      </header>

      <div className="mb-4 flex items-center justify-end">
        <SignOutChip />
      </div>

      <Panel>
        <h2 className="font-display text-lg">Start a table</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Button onClick={() => create('estimation')} disabled={busy}>New Estimation table</Button>
          <Button variant="ghost" onClick={() => create('tarneeb')} disabled={busy}>New Tarneeb table</Button>
        </div>
        {err && <div className="mt-3"><ErrorNote message={err} /></div>}
      </Panel>

      <Panel className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg">Open tables</h2>
          <button className="text-sm text-[var(--color-gold)] hover:underline" onClick={open.refetch}>Refresh</button>
        </div>
        {open.loading ? <div className="mt-3"><Spinner /></div> : (open.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No open tables — start one above.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(open.data ?? []).map((t) => (
              <li key={t.id.toString()} className="flex items-center justify-between rounded-lg bg-black/15 px-3 py-2">
                <span className="capitalize">{t.game} · table #{t.id.toString()} · <span className="nums">{t.seatsTaken.toString()}/4</span> seated</span>
                <Button onClick={() => join(t.id)} disabled={busy || t.seatsTaken >= 4n}>{t.seatsTaken >= 4n ? 'Full' : 'Join'}</Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <footer className="mt-auto pt-10 text-center text-xs text-ink-soft">
        Sign in with Memphis · shuffled by on-chain consensus randomness (raw_rand) · open-table casual play.
      </footer>
    </div>
  )
}

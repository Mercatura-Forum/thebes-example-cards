import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, SignOutChip } from '../components/MemphisGate'
import { useQuery } from '@thebes/sdk'
import {
  CARDS_CID, M, decodeOpen, decodeLeaders, decodeConservation, limitArg,
  createTable, joinTable, playVsHouse,
  type OpenTable, type LeaderRow, type Conservation,
} from '../lib/cards-api'
import { Button, Spinner, ErrorNote, Panel } from '../components/ui'
import { Card } from '../components/Card'

/** The hero deal: an arc of cards springs from the deck on load — the game
 *  showing itself off before a single click. */
const HERO_CARDS = [51, 25, 12, 38, 47, 9] // A♠ A♥ A♦ K♦.. a warm spread
function HeroFan() {
  return (
    <div className="relative mx-auto mt-8 flex h-40 items-end justify-center" aria-hidden>
      {HERO_CARDS.map((c, i) => {
        const rot = (i - (HERO_CARDS.length - 1) / 2) * 13
        return (
          <div
            key={c}
            className="deal-in absolute bottom-0"
            style={{
              // @ts-expect-error CSS var for the keyframe's final rotation
              '--deal-rot': `${rot}deg`,
              transformOrigin: '50% 130%',
              animationDelay: `${i * 90 + 150}ms`,
              zIndex: i,
            }}
          >
            <Card card={c} w={84} />
          </div>
        )
      })}
    </div>
  )
}

export function Lobby() {
  const auth = useAuth()
  const nav = useNavigate()
  const [busy, setBusy] = useState<string>()
  const [err, setErr] = useState<string>()
  const open = useQuery<OpenTable[]>(CARDS_CID, M.open, undefined, decodeOpen)
  const leaders = useQuery<LeaderRow[]>(CARDS_CID, M.leaders, limitArg(8), decodeLeaders)
  const cons = useQuery<Conservation[]>(CARDS_CID, M.conservation, undefined, decodeConservation)
  const seal = cons.data?.[0]

  const name = auth.displayName || 'Player'

  async function run(tag: string, fn: () => Promise<bigint | void>, goto?: (r: bigint) => string) {
    setBusy(tag)
    setErr(undefined)
    try {
      const r = await fn()
      if (goto && typeof r === 'bigint') nav(goto(r))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(undefined)
    }
  }

  const waiting = (open.data ?? []).filter((t) => t.phase === 'seating')
  const playing = (open.data ?? []).filter((t) => t.phase !== 'seating')

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col px-5 py-8">
      <div className="flex items-center justify-between">
        <span className="font-display text-xl font-bold text-[var(--color-gold)]">majlis<span className="text-ink">.</span></span>
        <SignOutChip />
      </div>

      {/* Hero: the game deals itself in, then one button puts you at a live
          table against the house. */}
      <header className="text-center">
        <HeroFan />
        <h1 className="font-display mt-6 text-5xl font-extrabold leading-[0.98] md:text-7xl" style={{ textWrap: 'balance' }}>
          Deal me in<span className="text-[var(--color-gold)]">.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
          Estimation &amp; Tarneeb at an on-chain table — every shuffle drawn from
          consensus randomness, every move checked by the contract. The house
          plays by the same rules, because it runs on the same rails.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button
            className="px-6 py-3 text-base"
            onClick={() => run('house', () => playVsHouse('estimation', name), (id) => `/t/${id}`)}
            disabled={!!busy}
          >
            {busy === 'house' ? 'Seating the house…' : '▶ Play now vs the house'}
          </Button>
          <Button variant="ghost" onClick={() => run('est', () => createTable('estimation', name), (id) => `/t/${id}`)} disabled={!!busy}>
            Open an Estimation table
          </Button>
          <Button variant="ghost" onClick={() => run('tar', () => createTable('tarneeb', name), (id) => `/t/${id}`)} disabled={!!busy}>
            Open a Tarneeb table
          </Button>
        </div>
        {err && <div className="mx-auto mt-4 max-w-md"><ErrorNote message={err} /></div>}
        {seal && (
          <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-black/20 px-3.5 py-1.5 text-xs text-ink-soft">
            <span className={`h-1.5 w-1.5 rounded-full ${seal.violations === 0n ? 'bg-[var(--color-leaf)]' : 'bg-red-400'}`} aria-hidden />
            {seal.liveGames.toString()} live game{seal.liveGames === 1n ? '' : 's'} ·{' '}
            {seal.violations === 0n
              ? 'every deck conserved — 52 cards accounted, audited on-chain'
              : `${seal.violations.toString()} conservation violations (should never happen)`}
          </p>
        )}
      </header>

      <div className="mt-10 grid gap-4 md:grid-cols-[3fr_2fr]">
        <Panel>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Tables</h2>
            <button className="text-sm text-[var(--color-gold)] hover:underline" onClick={open.refetch}>Refresh</button>
          </div>
          {open.loading ? <div className="mt-3"><Spinner /></div> : waiting.length + playing.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">The salon is quiet — open a table, or play the house.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {waiting.map((t) => (
                <li key={t.id.toString()} className="flex items-center justify-between rounded-lg bg-black/15 px-3 py-2">
                  <span className="text-sm capitalize">
                    {t.game} · table #{t.id.toString()} ·{' '}
                    <span className="nums">{t.seatsTaken.toString()}/4</span> seated
                    {t.bots > 0n && <span className="text-ink-soft"> ({t.bots.toString()} house)</span>}
                  </span>
                  <Button
                    onClick={() => run(`j${t.id}`, async () => { await joinTable(t.id, name); return t.id }, (id) => `/t/${id}`)}
                    disabled={!!busy || t.seatsTaken >= 4n}
                  >
                    {t.seatsTaken >= 4n ? 'Full' : 'Join'}
                  </Button>
                </li>
              ))}
              {playing.map((t) => (
                <li key={t.id.toString()} className="flex items-center justify-between rounded-lg bg-black/10 px-3 py-2 text-ink-soft">
                  <span className="text-sm capitalize">
                    {t.game} · table #{t.id.toString()} · hand {t.handNumber.toString()} in play
                  </span>
                  <span className="text-xs uppercase tracking-wide">{t.phase}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <h2 className="font-display text-lg font-bold">The book</h2>
          <p className="mt-1 text-xs text-ink-soft">Lifetime results, kept by the contract.</p>
          {leaders.loading ? <div className="mt-3"><Spinner /></div> : (leaders.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">No names in the book yet — finish a match and yours goes first.</p>
          ) : (
            <ol className="mt-3 space-y-1.5">
              {(leaders.data ?? []).map((l, i) => (
                <li key={l.name + i} className="flex items-baseline justify-between text-sm">
                  <span><span className="mr-2 text-xs text-[var(--color-gold)] nums">{i + 1}</span>{l.name}</span>
                  <span className="text-ink-soft nums">{l.wins.toString()}W · {l.games.toString()}G · {l.points.toString()} pts</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <footer className="mt-auto pt-10 text-center text-xs text-ink-soft">
        Sign in with Memphis · shuffled by on-chain consensus randomness (raw_rand) · open-table casual play.
      </footer>
    </div>
  )
}

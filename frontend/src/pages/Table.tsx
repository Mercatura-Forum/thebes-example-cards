import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { query } from '@thebes/sdk'
import {
  CARDS_CID, M, idArg, pageArg, decodeState, decodeSeats, decodeHand, decodeEvents,
  startHand, bid, passBid, estimate, playCard, closeTable, addBot, rematch, nudge,
  type GameState, type SeatRow, type TableEvent,
} from '../lib/cards-api'
import { SUIT_NAME, SUIT_SYMBOL, suitOf } from '../lib/config'
import { Card } from '../components/Card'
import { Button, Spinner, ErrorNote, Panel, SuitChip } from '../components/ui'

function useTable(id: bigint) {
  const [state, setState] = useState<GameState>()
  const [seats, setSeats] = useState<SeatRow[]>([])
  const [hand, setHand] = useState<number[]>([])
  const [events, setEvents] = useState<TableEvent[]>([])
  const [err, setErr] = useState<string>()
  const refresh = useCallback(async () => {
    try {
      const [s, se, h, ev] = await Promise.all([
        query(CARDS_CID, M.state, idArg(id)),
        query(CARDS_CID, M.seats, idArg(id)),
        query(CARDS_CID, M.hand, idArg(id)),
        query(CARDS_CID, M.events, pageArg(id, 0, 6)),
      ])
      setState(decodeState(s.reply_hex ?? s.reply ?? ''))
      setSeats(decodeSeats(se.reply_hex ?? se.reply ?? ''))
      setHand(decodeHand(h.reply_hex ?? h.reply ?? ''))
      setEvents(decodeEvents(ev.reply_hex ?? ev.reply ?? ''))
      setErr(undefined)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [id])
  useEffect(() => { refresh(); const t = setInterval(refresh, 1600); return () => clearInterval(t) }, [refresh])
  return { state, seats, hand, events, err, refresh }
}

// Where each relative seat sits on screen (used to throw cards from the right
// direction into the trick).
const THROW_FROM = [
  { x: 0, y: 130 },   // 0 me (bottom)
  { x: -170, y: 0 },  // 1 left
  { x: 0, y: -130 },  // 2 top
  { x: 170, y: 0 },   // 3 right
]

export function Table() {
  const { id } = useParams()
  const tableId = BigInt(id ?? '0')
  const { state, seats, hand, events, err, refresh } = useTable(tableId)
  const [actErr, setActErr] = useState<string>()
  const act = async (fn: () => Promise<unknown>) => {
    setActErr(undefined)
    try { await fn(); refresh() } catch (e) { setActErr(e instanceof Error ? e.message : String(e)); refresh() }
  }

  // Idle clock, anchored to chain time (nowNs rides in the state view).
  const [idleFor, setIdleFor] = useState(0)
  useEffect(() => {
    if (!state) return
    const baseIdleS = Number((state.nowNs - state.lastMoveAt) / 1_000_000_000n)
    const loadedAt = Date.now()
    const t = setInterval(() => setIdleFor(baseIdleS + Math.floor((Date.now() - loadedAt) / 1000)), 1000)
    return () => clearInterval(t)
  }, [state])

  if (!state) return <div className="grid min-h-full place-items-center"><Spinner label="Joining the table" /></div>

  const mySeat = Number(state.mySeat)
  const current = Number(state.current)
  const myTurn = mySeat >= 0 && mySeat === current
  const rel = (seat: number) => (mySeat < 0 ? seat : (seat - mySeat + 4) % 4) // 0 me,1 left,2 top,3 right
  const seatAt = (r: number) => seats.find((s) => rel(Number(s.seat)) === r)
  const trumpLabel = SUIT_NAME[Number(state.trump)] ?? '—'
  const inHand = state.phase === 'bidding' || state.phase === 'estimating' || state.phase === 'playing'
  const idleLimitS = Number(state.idleNs / 1_000_000_000n)
  const currentIsHuman = seats.some((s) => Number(s.seat) === current && s.seated && !s.isBot)
  const canNudge = inHand && mySeat >= 0 && !myTurn && currentIsHuman && idleFor >= idleLimitS

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between text-sm">
        <Link to="/" className="text-[var(--color-gold)] hover:underline">← Lobby</Link>
        <div className="flex items-center gap-2">
          <span className="font-display text-lg font-bold capitalize text-[var(--color-gold)]">{state.game}</span>
          {state.handNumber > 0n && (
            <span className="flex items-center gap-1" title={`hand ${state.handNumber} of ${state.matchHands}`}>
              {Array.from({ length: Number(state.matchHands) }, (_, i) => (
                <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < Number(state.handNumber) ? 'bg-[var(--color-gold)]' : 'bg-white/20'}`} />
              ))}
            </span>
          )}
          {inHand && <SuitChip label={`Trump: ${trumpLabel}`} />}
        </div>
        <button className="text-ink-soft hover:text-ink" onClick={() => act(() => closeTable(tableId))}>Close</button>
      </div>

      {/* The felt: seats on the edges, the trick in the middle */}
      <div className="relative grid flex-1 grid-cols-3 grid-rows-3 gap-2 rounded-3xl gold-ring p-3">
        <div /> <Seat s={seatAt(2)} cur={current} state={state} throwFrom={2} onAddBot={() => act(() => addBot(tableId))} /> <div />
        <Seat s={seatAt(1)} cur={current} state={state} throwFrom={1} onAddBot={() => act(() => addBot(tableId))} />
        <Center state={state} seats={seats} onStart={() => act(() => startHand(tableId))} rel={rel} />
        <Seat s={seatAt(3)} cur={current} state={state} throwFrom={3} onAddBot={() => act(() => addBot(tableId))} />
        <div /> <Seat s={seatAt(0)} cur={current} state={state} throwFrom={0} me onAddBot={() => act(() => addBot(tableId))} /> <div />

        {/* Match over: the flourish */}
        <AnimatePresence>
          {state.phase === 'matchover' && (
            <motion.div
              className="absolute inset-0 z-10 grid place-items-center overflow-hidden rounded-3xl bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              {Array.from({ length: 26 }, (_, i) => (
                <span key={i} className="confetti" style={{
                  left: `${(i * 137) % 100}%`,
                  background: i % 3 ? 'var(--color-gold)' : 'var(--color-card)',
                  animationDelay: `${(i % 9) * 0.28}s`,
                }} aria-hidden />
              ))}
              <motion.div
                className="text-center"
                initial={{ scale: 0.7, y: 20 }} animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 16 }}
              >
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-gold)]">the diwan goes to</p>
                <p className="font-display mt-2 text-5xl font-extrabold">
                  {Number(state.winnerSeat) >= 0 ? seats[Number(state.winnerSeat)]?.name : '—'}
                  {state.game === 'tarneeb' && Number(state.winnerSeat) >= 0 && (
                    <span className="text-2xl text-ink-soft"> &amp; {seats[(Number(state.winnerSeat) + 2) % 4]?.name}</span>
                  )}
                </p>
                <div className="mt-4 space-y-1 text-sm text-ink-soft nums">
                  {seats.map((s) => (
                    <p key={s.seat.toString()}>{s.name}: {s.score.toString()} pts</p>
                  ))}
                </div>
                <div className="mt-5 flex justify-center gap-3">
                  <Button onClick={() => act(() => rematch(tableId))}>Rematch</Button>
                  <Link to="/"><Button variant="ghost">Back to the lobby</Button></Link>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Your controls + hand */}
      <div className="mt-3">
        {actErr && <div className="mb-2"><ErrorNote message={actErr} /></div>}
        {err && !state && <ErrorNote message={err} />}
        <Controls state={state} hand={hand} myTurn={myTurn} act={act} tableId={tableId} seats={seats} />
        {canNudge && (
          <p className="mt-2 text-center text-xs text-ink-soft">
            {seats.find((s) => Number(s.seat) === current)?.name} has been away {idleFor}s —{' '}
            <button className="text-[var(--color-gold)] underline" onClick={() => act(() => nudge(tableId))}>
              let the house play their turn
            </button>
          </p>
        )}
      </div>

      {/* The table's story */}
      {events.length > 0 && (
        <div className="mt-3 space-y-0.5 text-center text-[11px] text-ink-soft/80">
          {events.slice(0, 4).map((e, i) => (
            <p key={e.at.toString() + i} className={i === 0 ? 'text-ink-soft' : ''}>{e.detail}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function Seat({ s, cur, state, throwFrom, me = false, onAddBot }: {
  s?: SeatRow; cur: number; state: GameState; throwFrom: number; me?: boolean; onAddBot: () => void
}) {
  const isCurrent = s && Number(s.seat) === cur && state.phase !== 'seating' && state.phase !== 'done' && state.phase !== 'matchover'
  const played = s && Number(s.played) >= 0 ? Number(s.played) : undefined
  const canInvite = state.phase === 'seating' && Number(state.mySeat) >= 0
  return (
    <div className="flex flex-col items-center justify-center gap-1.5">
      {!s?.seated ? (
        canInvite ? (
          <button
            className="rounded-full border border-dashed border-[var(--color-gold)]/40 px-3 py-1 text-xs text-ink-soft transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
            onClick={onAddBot}
          >
            + seat the house
          </button>
        ) : (
          <span className="text-xs text-ink-soft">empty seat</span>
        )
      ) : (
        <>
          <div className={`rounded-full px-3 py-1 text-sm ${isCurrent ? 'turn-glow bg-[var(--color-gold)] font-bold text-[#3a2a08]' : 'bg-black/25 text-ink'}`}>
            {s.isBot && <span aria-hidden>⌂ </span>}
            {s.name || 'Player'}{me ? ' (you)' : ''}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-ink-soft nums">
            {state.phase !== 'seating' && <span>tricks {s.tricksWon.toString()}</span>}
            {(state.phase === 'estimating' || state.phase === 'playing' || state.phase === 'done') && Number(s.estimate) >= 0 && <span>· called {s.estimate.toString()}</span>}
            <span>· {s.score.toString()} pts</span>
          </div>
          {/* their card for this trick, thrown in from their side */}
          <div className="h-16">
            <AnimatePresence>
              {played !== undefined && (
                <motion.div
                  key={played}
                  initial={{ x: THROW_FROM[throwFrom].x * 0.4, y: THROW_FROM[throwFrom].y * 0.4, opacity: 0, rotate: throwFrom % 2 ? -12 : 12 }}
                  animate={{ x: 0, y: 0, opacity: 1, rotate: (throwFrom - 1.5) * 4 }}
                  exit={{ scale: 0.6, opacity: 0, y: -18 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                >
                  <Card card={played} w={46} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  )
}

function Center({ state, seats, onStart, rel }: {
  state: GameState; seats: SeatRow[]; onStart: () => void; rel: (s: number) => number
}) {
  const seatedCount = seats.filter((s) => s.seated).length
  void rel
  return (
    <div className="grid place-items-center">
      {state.phase === 'seating' ? (
        <div className="text-center">
          <p className="text-ink-soft nums">{seatedCount}/4 seated</p>
          {seatedCount === 4
            ? <Button className="mt-2" onClick={onStart}>Deal the first hand</Button>
            : <p className="mt-1 max-w-[180px] text-xs text-ink-soft">share the table number — or seat the house in the empty chairs</p>}
        </div>
      ) : state.phase === 'done' ? (
        <div className="text-center">
          <p className="font-display text-lg font-bold text-[var(--color-gold)]">Hand {state.handNumber.toString()} scored</p>
          <Button className="mt-2" onClick={onStart}>Deal hand {(state.handNumber + 1n).toString()}</Button>
        </div>
      ) : (
        <p className="max-w-[190px] text-center text-xs text-ink-soft">
          {state.phase === 'bidding'
            ? (state.bidNumber > 0n
              ? `standing bid: ${state.bidNumber.toString()} ${SUIT_NAME[Number(state.bidSuitRank)]}`
              : 'the auction opens')
            : state.phase === 'estimating' ? 'calling tricks' : ''}
        </p>
      )}
    </div>
  )
}

function Controls({ state, hand, myTurn, act, tableId, seats }: {
  state: GameState; hand: number[]; myTurn: boolean; act: (fn: () => Promise<unknown>) => void; tableId: bigint; seats: SeatRow[]
}) {
  const [bidNum, setBidNum] = useState(0)
  const [bidSuit, setBidSuit] = useState(4)
  const min = state.game === 'tarneeb' ? 7 : 4
  const leadSuit = Number(state.leadSuit)
  const sorted = useMemo(() => [...hand].sort((a, b) => a - b), [hand])

  // Your hand is always visible during a hand — a real fan, playable on your turn.
  const handFan = (playable: boolean) => {
    const haveLead = leadSuit >= 0 && hand.some((c) => suitOf(c) === leadSuit)
    return (
      <div className="flex items-end justify-center py-3" aria-label="your hand">
        {sorted.map((c, i) => {
          const legal = playable && (leadSuit < 0 || suitOf(c) === leadSuit || !haveLead)
          const rot = (i - (sorted.length - 1) / 2) * 4
          return (
            <div key={c} style={{ transform: `rotate(${rot}deg)`, transformOrigin: '50% 120%', marginLeft: i ? -18 : 0 }}>
              <Card
                card={c} w={62}
                onClick={legal ? () => act(() => playCard(tableId, c)) : undefined}
                disabled={playable && !legal}
                playable={legal}
              />
            </div>
          )
        })}
      </div>
    )
  }

  if (state.phase === 'bidding') {
    if (!myTurn) return handFan(false)
    const n = Math.max(min, bidNum || min)
    return (
      <>
        <Panel className="flex flex-wrap items-center justify-center gap-3">
          <span className="text-sm font-medium">Your bid</span>
          <div className="inline-flex items-center rounded-lg ring-1 ring-[var(--color-gold)]/30">
            <button className="px-3 py-1.5 text-lg" onClick={() => setBidNum(Math.max(min, n - 1))} aria-label="Lower bid">−</button>
            <span className="w-8 text-center nums">{n}</span>
            <button className="px-3 py-1.5 text-lg" onClick={() => setBidNum(Math.min(13, n + 1))} aria-label="Raise bid">+</button>
          </div>
          <div className="flex gap-1">
            {[4, 3, 2, 1, 0].map((sr) => (
              <button key={sr} onClick={() => setBidSuit(sr)}
                className={`rounded-md px-2 py-1 text-sm ${bidSuit === sr ? 'bg-[var(--color-gold)] text-[#3a2a08]' : 'bg-black/20'} ${sr === 1 || sr === 2 ? 'text-[var(--color-card-red)]' : ''}`}>
                {sr === 4 ? 'NT' : SUIT_SYMBOL[sr]}
              </button>
            ))}
          </div>
          <Button onClick={() => act(() => bid(tableId, n, bidSuit))}>Bid</Button>
          <Button variant="ghost" onClick={() => act(() => passBid(tableId))}>Pass</Button>
        </Panel>
        {handFan(false)}
      </>
    )
  }

  if (state.phase === 'estimating') {
    if (!myTurn) return handFan(false)
    const max = Number(state.bidNumber)
    const others = seats.filter((s) => Number(s.estimate) >= 0).reduce((a, s) => a + Number(s.estimate), 0)
    const estimatedCount = seats.filter((s) => Number(s.estimate) >= 0).length
    const isLast = estimatedCount === 3
    return (
      <>
        <Panel className="text-center">
          <p className="text-sm">How many tricks will you take? <span className="text-ink-soft">(0–{max})</span></p>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {Array.from({ length: max + 1 }, (_, v) => {
              const forbidden = isLast && others + v === 13 // Σ ≠ 13
              return <button key={v} disabled={forbidden} onClick={() => act(() => estimate(tableId, v))}
                className="h-9 w-9 rounded-lg bg-black/20 nums hover:bg-[var(--color-gold)] hover:text-[#3a2a08] disabled:opacity-30 disabled:hover:bg-black/20 disabled:hover:text-ink">{v}</button>
            })}
          </div>
          {isLast && <p className="mt-2 text-xs text-ink-soft">The four calls can't total 13 — that number is barred.</p>}
        </Panel>
        {handFan(false)}
      </>
    )
  }

  if (state.phase === 'playing') {
    return (
      <>
        {!myTurn && <p className="text-center text-xs text-ink-soft">waiting for the table…</p>}
        {handFan(myTurn)}
      </>
    )
  }

  return null
}

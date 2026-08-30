import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const inHandPhase = (phase: string) => phase === 'bidding' || phase === 'estimating' || phase === 'playing'

// Where each relative seat sits on screen (used to throw cards from the right
// direction into the trick).
const THROW_FROM = [
  { x: 0, y: 130 },   // 0 me (bottom)
  { x: -170, y: 0 },  // 1 left
  { x: 0, y: -130 },  // 2 top
  { x: 170, y: 0 },   // 3 right
]

const cardName = (c: number) => `${['2','3','4','5','6','7','8','9','10','J','Q','K','A'][c % 13]}${SUIT_SYMBOL[suitOf(c)]}`

// A trick replayed one move at a time. `felt[seat]` is the card showing for each
// seat (-1 none); `winner` glows the seat that just took a trick; `caption`
// narrates the current beat in the centre.
type Stage = { felt: number[]; winner: number | null; caption: string | null }

const reduced = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const SP = reduced ? 0.18 : 1 // replay speed multiplier (fast for reduced-motion)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.round(ms * SP)))

function useTable(id: bigint, pausedRef: React.MutableRefObject<boolean>) {
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
  useEffect(() => {
    refresh()
    const t = setInterval(() => { if (!pausedRef.current) refresh() }, 1600)
    return () => clearInterval(t)
  }, [refresh, pausedRef])
  return { state, seats, hand, events, err, refresh }
}

export function Table() {
  const { id } = useParams()
  const tableId = BigInt(id ?? '0')
  const pausedRef = useRef(false)
  const { state, seats, hand, events, err, refresh } = useTable(tableId, pausedRef)
  const [actErr, setActErr] = useState<string>()
  const [stage, setStage] = useState<Stage | null>(null)

  // Replay everything the contract did inside one move: the bots run — and a
  // trick resolves — in the SAME message as the human's play, so the settled
  // state we'd poll never shows the round being played out. We fetch the events
  // that move produced and step through them on the felt, so you watch each
  // opponent play, the trick complete, and who took it — before it's your turn
  // again. (Card conservation is untouched; this is pure presentation.)
  const replay = useCallback(async (seqBefore: bigint, preFelt: number[], names: string[]) => {
    let after: GameState | undefined
    try {
      const s = await query(CARDS_CID, M.state, idArg(tableId))
      after = decodeState(s.reply_hex ?? s.reply ?? '')
    } catch { /* fall through to a plain refresh */ }
    const seqAfter = after?.eventSeq ?? seqBefore
    const count = Number(seqAfter - seqBefore)
    if (count <= 0) return
    let evs: TableEvent[] = []
    try {
      const ev = await query(CARDS_CID, M.events, pageArg(tableId, 0, count))
      evs = decodeEvents(ev.reply_hex ?? ev.reply ?? '').reverse() // chronological
    } catch { return }
    const felt = [...preFelt]
    const name = (seat: number) => names[seat] || `Seat ${seat}`
    setStage({ felt: [...felt], winner: null, caption: null })
    for (const e of evs) {
      const kind = e.kind
      const seat = Number(e.seat)
      if (kind === 'card.play') {
        felt[seat] = Number(e.card)
        setStage({ felt: [...felt], winner: null, caption: `${name(seat)} plays the ${cardName(Number(e.card))}` })
        await sleep(680)
      } else if (kind === 'trick.won') {
        setStage({ felt: [...felt], winner: seat, caption: `${name(seat)} takes the trick` })
        await sleep(1150)
        for (let i = 0; i < 4; i++) felt[i] = -1
        setStage({ felt: [...felt], winner: null, caption: null })
        await sleep(260)
      } else if (kind.startsWith('bid') || kind === 'estimate.set') {
        setStage({ felt: [...felt], winner: null, caption: e.detail })
        await sleep(760)
      } else if (kind === 'hand.scored' || kind === 'hand.deal' || kind === 'match.won') {
        setStage({ felt: [...felt], winner: null, caption: e.detail })
        await sleep(900)
      }
    }
    setStage(null)
  }, [tableId])

  // Run one move: pause polling, snapshot the pre-move felt, submit, replay what
  // happened, then resume live polling. Errors surface and we refresh to truth.
  const move = useCallback(async (fn: () => Promise<unknown>) => {
    if (pausedRef.current) return
    setActErr(undefined)
    pausedRef.current = true
    const seqBefore = state?.eventSeq ?? 0n
    const preFelt = [0, 1, 2, 3].map((i) => {
      const s = seats.find((r) => Number(r.seat) === i)
      return s && Number(s.played) >= 0 ? Number(s.played) : -1
    })
    const names = [0, 1, 2, 3].map((i) => seats.find((r) => Number(r.seat) === i)?.name ?? '')
    try {
      await fn()
      await replay(seqBefore, preFelt, names)
    } catch (e) {
      setActErr(e instanceof Error ? e.message : String(e))
      setStage(null)
    } finally {
      await refresh()
      pausedRef.current = false
    }
  }, [state, seats, replay, refresh])

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
  const myTurn = mySeat >= 0 && mySeat === current && !stage
  const rel = (seat: number) => (mySeat < 0 ? seat : (seat - mySeat + 4) % 4) // 0 me,1 left,2 top,3 right
  const seatAt = (r: number) => seats.find((s) => rel(Number(s.seat)) === r)
  const trumpLabel = SUIT_NAME[Number(state.trump)] ?? '—'
  const inHand = inHandPhase(state.phase)
  const idleLimitS = Number(state.idleNs / 1_000_000_000n)
  const currentIsHuman = seats.some((s) => Number(s.seat) === current && s.seated && !s.isBot)
  const canNudge = inHand && mySeat >= 0 && !myTurn && !stage && currentIsHuman && idleFor >= idleLimitS

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
        <button className="text-ink-soft hover:text-ink" onClick={() => move(() => closeTable(tableId))}>Close</button>
      </div>

      {/* The felt: seats on the edges, the trick in the middle */}
      <div className="relative grid flex-1 grid-cols-3 grid-rows-3 gap-2 rounded-3xl gold-ring p-3">
        <div /> <Seat s={seatAt(2)} cur={current} state={state} stage={stage} throwFrom={2} onAddBot={() => move(() => addBot(tableId))} /> <div />
        <Seat s={seatAt(1)} cur={current} state={state} stage={stage} throwFrom={1} onAddBot={() => move(() => addBot(tableId))} />
        <Center state={state} seats={seats} stage={stage} onStart={() => move(() => startHand(tableId))} />
        <Seat s={seatAt(3)} cur={current} state={state} stage={stage} throwFrom={3} onAddBot={() => move(() => addBot(tableId))} />
        <div /> <Seat s={seatAt(0)} cur={current} state={state} stage={stage} throwFrom={0} me onAddBot={() => move(() => addBot(tableId))} /> <div />

        {/* Match over: the flourish */}
        <AnimatePresence>
          {state.phase === 'matchover' && !stage && (
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
                  <Button onClick={() => move(() => rematch(tableId))}>Rematch</Button>
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
        {stage
          ? <p className="py-6 text-center text-sm text-ink-soft" role="status">the round plays out…</p>
          : <Controls state={state} hand={hand} myTurn={myTurn} move={move} tableId={tableId} seats={seats} />}
        {canNudge && (
          <p className="mt-2 text-center text-xs text-ink-soft">
            {seats.find((s) => Number(s.seat) === current)?.name} has been away {idleFor}s —{' '}
            <button className="text-[var(--color-gold)] underline" onClick={() => move(() => nudge(tableId))}>
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

function Seat({ s, cur, state, stage, throwFrom, me = false, onAddBot }: {
  s?: SeatRow; cur: number; state: GameState; stage: Stage | null; throwFrom: number; me?: boolean; onAddBot: () => void
}) {
  const seatIdx = s ? Number(s.seat) : -1
  const isCurrent = !stage && s && seatIdx === cur && state.phase !== 'seating' && state.phase !== 'done' && state.phase !== 'matchover'
  const isWinner = !!stage && stage.winner === seatIdx
  // During a replay the felt is driven by the stage; otherwise by the live view.
  const played = stage ? (seatIdx >= 0 ? stage.felt[seatIdx] : -1)
    : (s && Number(s.played) >= 0 ? Number(s.played) : -1)
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
          <div className={`rounded-full px-3 py-1 text-sm ${isCurrent ? 'turn-glow bg-[var(--color-gold)] font-bold text-[#3a2a08]' : isWinner ? 'trick-win bg-[var(--color-gold)] font-bold text-[#3a2a08]' : 'bg-black/25 text-ink'}`}>
            {s.isBot && <span aria-hidden>⌂ </span>}
            {s.name || 'Player'}{me ? ' (you)' : ''}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-ink-soft nums">
            {state.phase !== 'seating' && <span>tricks {s.tricksWon.toString()}</span>}
            {(state.phase === 'estimating' || state.phase === 'playing' || state.phase === 'done') && Number(s.estimate) >= 0 && <span>· called {s.estimate.toString()}</span>}
            <span>· {s.score.toString()} pts</span>
          </div>
          {/* their remaining cards, face down — the table reads as a game at
              a glance (count from the same view the oracle audits) */}
          {!me && inHandPhase(state.phase) && Number(s.cardsLeft) > 0 && (
            <div className="flex" aria-label={`${s.name} holds ${s.cardsLeft} cards`}>
              {Array.from({ length: Number(s.cardsLeft) }, (_, j) => (
                <div key={j} style={{
                  marginLeft: j ? -14 : 0,
                  transform: `rotate(${(j - (Number(s.cardsLeft) - 1) / 2) * 3}deg)`,
                  transformOrigin: '50% 130%',
                }}>
                  <Card back w={22} />
                </div>
              ))}
            </div>
          )}
          {/* their card for this trick, thrown in from their side */}
          <div className="h-16">
            <AnimatePresence>
              {played >= 0 && (
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

function Center({ state, seats, stage, onStart }: {
  state: GameState; seats: SeatRow[]; stage: Stage | null; onStart: () => void
}) {
  const seatedCount = seats.filter((s) => s.seated).length
  if (stage) {
    return (
      <div className="grid place-items-center">
        {stage.caption && (
          <motion.p
            key={stage.caption}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-[200px] text-center text-sm font-medium text-[var(--color-gold)]"
          >{stage.caption}</motion.p>
        )}
      </div>
    )
  }
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

// Suit codes high→low for the bid picker: NT beats spades beats … beats clubs.
const SUIT_PICK = [4, 3, 2, 1, 0]

function Controls({ state, hand, myTurn, move, tableId, seats }: {
  state: GameState; hand: number[]; myTurn: boolean; move: (fn: () => Promise<unknown>) => void; tableId: bigint; seats: SeatRow[]
}) {
  const [pick, setPick] = useState<number | null>(null)   // card selected to play
  const [bidLevel, setBidLevel] = useState<number | null>(null)
  const [bidSuit, setBidSuit] = useState<number | null>(null)
  const [estPick, setEstPick] = useState<number | null>(null)
  const min = state.game === 'tarneeb' ? 7 : 4
  const leadSuit = Number(state.leadSuit)
  const sorted = useMemo(() => [...hand].sort((a, b) => a - b), [hand])

  // Clear any half-made selection whenever it stops being our turn / phase moves.
  useEffect(() => { if (!myTurn) { setPick(null); setBidLevel(null); setBidSuit(null); setEstPick(null) } }, [myTurn, state.phase, state.eventSeq])

  const haveLead = leadSuit >= 0 && hand.some((c) => suitOf(c) === leadSuit)
  const isLegalCard = (c: number) => leadSuit < 0 || !haveLead || suitOf(c) === leadSuit

  // The hand fan. During play you TAP a card to select it (it lifts and rings);
  // an explicit Confirm bar then plays it — no accidental throws.
  const handFan = (selectable: boolean) => (
    <div className="flex items-end justify-center py-3" aria-label="your hand">
      {sorted.map((c, i) => {
        const legal = selectable && isLegalCard(c)
        const rot = (i - (sorted.length - 1) / 2) * 4
        return (
          <div key={c} style={{ transform: `rotate(${rot}deg)`, transformOrigin: '50% 120%', marginLeft: i ? -18 : 0 }}>
            <Card
              card={c} w={62}
              onClick={legal ? () => setPick((p) => (p === c ? null : c)) : undefined}
              disabled={selectable && !legal}
              selected={pick === c}
              playable={legal}
            />
          </div>
        )
      })}
    </div>
  )

  if (state.phase === 'bidding') {
    if (!myTurn) return handFan(false)
    const standingN = Number(state.bidNumber)
    const standingS = Number(state.bidSuitRank)
    const beats = (n: number, s: number) => standingN === 0 || n > standingN || (n === standingN && s > standingS)
    const chosenLegal = bidLevel !== null && bidSuit !== null && beats(bidLevel, bidSuit)
    // A level is offerable only if SOME suit at that level can beat the standing bid.
    const levelOffers = (n: number) => SUIT_PICK.some((s) => beats(n, s))
    return (
      <>
        <Panel className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">Your bid</span>
            {standingN > 0 && <span className="text-xs text-ink-soft">to beat: <b className="text-ink">{standingN} {SUIT_NAME[standingS]}</b></span>}
          </div>
          <div>
            <p className="mb-1 text-xs text-ink-soft">how many tricks you contract</p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 13 - min + 1 }, (_, k) => min + k).map((n) => {
                const offer = levelOffers(n)
                return (
                  <button key={n} disabled={!offer}
                    onClick={() => { setBidLevel(n); if (bidSuit !== null && !beats(n, bidSuit)) setBidSuit(null) }}
                    className={`h-9 w-9 rounded-lg nums transition ${bidLevel === n ? 'bg-[var(--color-gold)] text-[#3a2a08] font-bold' : 'bg-black/20 hover:bg-black/30'} disabled:opacity-25`}>
                    {n}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs text-ink-soft">trump suit</p>
            <div className="flex gap-1.5">
              {SUIT_PICK.map((sr) => {
                const dim = bidLevel !== null && !beats(bidLevel, sr)
                return (
                  <button key={sr} disabled={dim} onClick={() => setBidSuit(sr)}
                    className={`h-9 min-w-9 rounded-lg px-2 text-base transition ${bidSuit === sr ? 'bg-[var(--color-gold)] text-[#3a2a08] font-bold' : 'bg-black/20 hover:bg-black/30'} ${(sr === 1 || sr === 2) && bidSuit !== sr ? 'text-[var(--color-card-red)]' : ''} disabled:opacity-25`}>
                    {sr === 4 ? 'NT' : SUIT_SYMBOL[sr]}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button disabled={!chosenLegal}
              onClick={() => chosenLegal && move(() => bid(tableId, bidLevel!, bidSuit!))}>
              {chosenLegal ? `Confirm bid ${bidLevel} ${SUIT_NAME[bidSuit!]}` : 'Pick a bid'}
            </Button>
            <Button variant="ghost" onClick={() => move(() => passBid(tableId))}>Pass</Button>
          </div>
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
          <p className="text-sm">How many tricks will you take? <span className="text-ink-soft">(tap one, then confirm — 0–{max})</span></p>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {Array.from({ length: max + 1 }, (_, v) => {
              const forbidden = isLast && others + v === 13 // Σ ≠ 13
              return (
                <button key={v} disabled={forbidden} onClick={() => setEstPick((p) => (p === v ? null : v))}
                  className={`h-10 w-10 rounded-lg nums transition ${estPick === v ? 'bg-[var(--color-gold)] text-[#3a2a08] font-bold ring-2 ring-[var(--color-gold)]' : 'bg-black/20 hover:bg-black/30'} disabled:opacity-25 disabled:hover:bg-black/20`}>{v}</button>
              )
            })}
          </div>
          {isLast && <p className="mt-2 text-xs text-ink-soft">The four calls can't total 13 — that number is barred.</p>}
          <div className="mt-3">
            <Button disabled={estPick === null} onClick={() => estPick !== null && move(() => estimate(tableId, estPick))}>
              {estPick === null ? 'Pick your call' : `Confirm — call ${estPick}`}
            </Button>
          </div>
        </Panel>
        {handFan(false)}
      </>
    )
  }

  if (state.phase === 'playing') {
    return (
      <>
        {!myTurn && <p className="text-center text-xs text-ink-soft">waiting for the table…</p>}
        {myTurn && (
          <AnimatePresence>
            {pick !== null && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                className="flex items-center justify-center gap-2"
              >
                <Button onClick={() => move(() => playCard(tableId, pick))}>▶ Play the {cardName(pick)}</Button>
                <Button variant="ghost" onClick={() => setPick(null)}>✕ pick another</Button>
              </motion.div>
            )}
            {pick === null && (
              <p className="text-center text-xs text-ink-soft">your turn — tap a card to play it</p>
            )}
          </AnimatePresence>
        )}
        {handFan(myTurn)}
      </>
    )
  }

  return null
}

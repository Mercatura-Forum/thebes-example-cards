import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { query } from '@thebes/sdk'
import {
  CARDS_CID, M, idArg, decodeState, decodeSeats, decodeHand,
  startHand, bid, passBid, estimate, playCard, closeTable,
  type GameState, type SeatRow,
} from '../lib/cards-api'
import { SUIT_NAME, SUIT_SYMBOL, suitOf } from '../lib/config'
import { Card } from '../components/Card'
import { Button, Spinner, ErrorNote, Panel, SuitChip } from '../components/ui'

function useTable(id: bigint) {
  const [state, setState] = useState<GameState>()
  const [seats, setSeats] = useState<SeatRow[]>([])
  const [hand, setHand] = useState<number[]>([])
  const [err, setErr] = useState<string>()
  const refresh = useCallback(async () => {
    try {
      const [s, se, h] = await Promise.all([
        query(CARDS_CID, M.state, idArg(id)), query(CARDS_CID, M.seats, idArg(id)), query(CARDS_CID, M.hand, idArg(id)),
      ])
      setState(decodeState(s.reply_hex ?? s.reply ?? ''))
      setSeats(decodeSeats(se.reply_hex ?? se.reply ?? ''))
      setHand(decodeHand(h.reply_hex ?? h.reply ?? ''))
      setErr(undefined)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [id])
  useEffect(() => { refresh(); const t = setInterval(refresh, 1800); return () => clearInterval(t) }, [refresh])
  return { state, seats, hand, err, refresh }
}

export function Table() {
  const { id } = useParams()
  const tableId = BigInt(id ?? '0')
  const { state, seats, hand, err, refresh } = useTable(tableId)
  const [actErr, setActErr] = useState<string>()
  const act = async (fn: () => Promise<unknown>) => {
    setActErr(undefined)
    try { await fn(); refresh() } catch (e) { setActErr(e instanceof Error ? e.message : String(e)); refresh() }
  }

  if (!state) return <div className="grid min-h-full place-items-center"><Spinner label="Joining the table" /></div>

  const mySeat = Number(state.mySeat)
  const current = Number(state.current)
  const myTurn = mySeat >= 0 && mySeat === current
  const rel = (seat: number) => (mySeat < 0 ? seat : (seat - mySeat + 4) % 4) // 0 me,1 left,2 top,3 right
  const seatAt = (r: number) => seats.find((s) => rel(Number(s.seat)) === r)
  const trumpLabel = SUIT_NAME[Number(state.trump)] ?? '—'

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between text-sm">
        <Link to="/" className="text-[var(--color-gold)] hover:underline">← Lobby</Link>
        <div className="flex items-center gap-2">
          <span className="font-display text-lg capitalize text-[var(--color-gold)]">{state.game}</span>
          <span className="text-ink-soft nums">hand {state.handNumber.toString()}</span>
          {state.phase !== 'seating' && <SuitChip label={`Trump: ${trumpLabel}`} />}
        </div>
        <button className="text-ink-soft hover:text-ink" onClick={() => act(() => closeTable(tableId))}>Close</button>
      </div>

      {/* The felt table: 3×3 grid, seats on the edges, action in the center */}
      <div className="grid flex-1 grid-cols-3 grid-rows-3 gap-2 rounded-3xl gold-ring p-3">
        <div /> <Seat row={2} s={seatAt(2)} cur={current} state={state} /> <div />
        <Seat row={1} s={seatAt(1)} cur={current} state={state} />
        <Center state={state} seats={seats} myTurn={myTurn} onStart={() => act(() => startHand(tableId))} />
        <Seat row={3} s={seatAt(3)} cur={current} state={state} />
        <div /> <Seat row={0} s={seatAt(0)} cur={current} state={state} /> <div />
      </div>

      {/* Your controls + hand */}
      <div className="mt-3">
        {actErr && <div className="mb-2"><ErrorNote message={actErr} /></div>}
        {err && !state && <ErrorNote message={err} />}
        <Controls state={state} hand={hand} myTurn={myTurn} act={act} tableId={tableId} seats={seats} />
      </div>
    </div>
  )
}

function Seat({ row, s, cur, state }: { row: number; s?: SeatRow; cur: number; state: GameState }) {
  const isCurrent = s && Number(s.seat) === cur
  const me = row === 0
  const played = s && Number(s.played) >= 0 ? Number(s.played) : undefined
  return (
    <div className={`flex flex-col items-center justify-center gap-1 ${me ? 'order-last' : ''}`}>
      {!s?.seated ? (
        <span className="text-xs text-ink-soft">empty seat</span>
      ) : (
        <>
          <div className={`rounded-full px-3 py-1 text-sm ${isCurrent ? 'bg-[var(--color-gold)] text-[#3a2a08] font-bold' : 'bg-black/25 text-ink'}`}>
            {s.name || 'Player'}{me ? ' (you)' : ''}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-ink-soft nums">
            {state.phase !== 'seating' && <span>tricks {s.tricksWon.toString()}</span>}
            {(state.phase === 'estimating' || state.phase === 'playing' || state.phase === 'done') && Number(s.estimate) >= 0 && <span>· est {s.estimate.toString()}</span>}
            <span>· {s.score.toString()} pts</span>
          </div>
          {played !== undefined && <div className="mt-1"><Card card={played} w={44} /></div>}
        </>
      )}
    </div>
  )
}

function Center({ state, seats, myTurn, onStart }: { state: GameState; seats: SeatRow[]; myTurn: boolean; onStart: () => void }) {
  const seatedCount = seats.filter((s) => s.seated).length
  return (
    <div className="grid place-items-center">
      {state.phase === 'seating' ? (
        <div className="text-center">
          <p className="text-ink-soft nums">{seatedCount}/4 seated</p>
          {seatedCount === 4 ? <Button className="mt-2" onClick={onStart}>Deal</Button> : <p className="mt-1 text-xs text-ink-soft">share the table # to fill seats</p>}
        </div>
      ) : state.phase === 'done' ? (
        <div className="text-center">
          <p className="font-display text-lg text-[var(--color-gold)]">Hand over</p>
          {myTurn || true ? <Button className="mt-2" onClick={onStart}>Next hand</Button> : null}
        </div>
      ) : (
        <p className="text-center text-xs text-ink-soft">
          {state.phase === 'bidding' ? `bidding · high ${state.bidNumber.toString()}` : state.phase === 'estimating' ? 'estimating' : 'play a card'}
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

  if (!myTurn) {
    return <p className="text-center text-sm text-ink-soft">{state.phase === 'playing' || state.phase === 'bidding' || state.phase === 'estimating' ? 'Waiting for the other players…' : ''}</p>
  }

  if (state.phase === 'bidding') {
    const n = Math.max(min, bidNum || min)
    return (
      <Panel className="flex flex-wrap items-center justify-center gap-3">
        <span className="text-sm">Your bid:</span>
        <div className="inline-flex items-center rounded-lg ring-1 ring-[var(--color-gold)]/30">
          <button className="px-3 py-1.5 text-lg" onClick={() => setBidNum(Math.max(min, n - 1))}>−</button>
          <span className="w-8 text-center nums">{n}</span>
          <button className="px-3 py-1.5 text-lg" onClick={() => setBidNum(Math.min(13, n + 1))}>+</button>
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
    )
  }

  if (state.phase === 'estimating') {
    const max = Number(state.bidNumber)
    const others = seats.filter((s) => Number(s.estimate) >= 0).reduce((a, s) => a + Number(s.estimate), 0)
    const estimatedCount = seats.filter((s) => Number(s.estimate) >= 0).length
    const isLast = estimatedCount === 3
    return (
      <Panel className="text-center">
        <p className="text-sm">How many tricks will you take? <span className="text-ink-soft">(0–{max})</span></p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {Array.from({ length: max + 1 }, (_, v) => {
            const forbidden = isLast && others + v === 13 // Σ ≠ 13
            return <button key={v} disabled={forbidden} onClick={() => act(() => estimate(tableId, v))}
              className="h-9 w-9 rounded-lg bg-black/20 nums hover:bg-[var(--color-gold)] hover:text-[#3a2a08] disabled:opacity-30 disabled:hover:bg-black/20 disabled:hover:text-ink">{v}</button>
          })}
        </div>
        {isLast && <p className="mt-2 text-xs text-ink-soft">Total can't equal 13 — that value is disabled.</p>}
      </Panel>
    )
  }

  // playing — your hand fan
  if (state.phase === 'playing') {
    const haveLead = leadSuit >= 0 && hand.some((c) => suitOf(c) === leadSuit)
    const sorted = [...hand].sort((a, b) => a - b)
    return (
      <div className="flex flex-wrap items-end justify-center gap-1 py-2">
        {sorted.map((c) => {
          const legal = leadSuit < 0 || suitOf(c) === leadSuit || !haveLead
          return <Card key={c} card={c} w={64} onClick={() => act(() => playCard(tableId, c))} disabled={!legal} />
        })}
      </div>
    )
  }

  return null
}

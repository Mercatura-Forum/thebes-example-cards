/**
 * cards-api.ts — typed reads/writes for the card-game backend. Reads use the flat
 * `*View` queries (gameState 1-row, seats 4-rows, hand N-rows). The game/variant
 * args are passed as TEXT/Nat (the SDK can't encode Candid variants).
 */
import { query, update, encodeArg, encodeArgs, decodeVecRecord, decodeNat } from '@thebes/sdk'
import { CARDS_CID } from './config'

export interface GameState {
  game: string; phase: string; dealer: bigint; current: bigint; trump: bigint
  bidNumber: bigint; bidSuitRank: bigint; declarer: bigint; handNumber: bigint; matchHands: bigint
  mySeat: bigint; leadSuit: bigint; winnerSeat: bigint; version: bigint; eventSeq: bigint
  lastMoveAt: bigint; nowNs: bigint; idleNs: bigint
}
export interface SeatRow {
  seat: bigint; name: string; seated: boolean; isBot: boolean; estimate: bigint
  tricksWon: bigint; score: bigint; played: bigint; cardsLeft: bigint
}
export interface OpenTable { id: bigint; game: string; seatsTaken: bigint; bots: bigint; phase: string; handNumber: bigint }
export interface TableEvent { at: bigint; seat: bigint; kind: string; detail: string; card: bigint }
export interface LeaderRow { name: string; games: bigint; wins: bigint; points: bigint }
export interface Conservation { tablesChecked: bigint; violations: bigint; liveGames: bigint; checkedAt: bigint }
export interface Violation { rule: string; expected: bigint; actual: bigint }

const nat = (name: string) => ({ name, type: 'nat' as const })
const int = (name: string) => ({ name, type: 'int' as const })
const text = (name: string) => ({ name, type: 'text' as const })
const bool = (name: string) => ({ name, type: 'bool' as const })

const STATE_FIELDS = [
  text('game'), text('phase'), nat('dealer'), nat('current'), nat('trump'),
  nat('bidNumber'), nat('bidSuitRank'), nat('declarer'), nat('handNumber'), nat('matchHands'),
  int('mySeat'), int('leadSuit'), int('winnerSeat'), nat('version'), nat('eventSeq'),
  int('lastMoveAt'), int('nowNs'), int('idleNs'),
]
const SEAT_FIELDS = [
  nat('seat'), text('name'), bool('seated'), bool('isBot'), int('estimate'),
  nat('tricksWon'), int('score'), int('played'), nat('cardsLeft'),
]
const HAND_FIELDS = [nat('card')]
const OPEN_FIELDS = [nat('id'), text('game'), nat('seatsTaken'), nat('bots'), text('phase'), nat('handNumber')]
const EVENT_FIELDS = [int('at'), int('seat'), text('kind'), text('detail'), int('card')]
const LEADER_FIELDS = [text('name'), nat('games'), nat('wins'), int('points')]
const CONSERVATION_FIELDS = [nat('tablesChecked'), nat('violations'), nat('liveGames'), int('checkedAt')]
const VIOLATION_FIELDS = [text('rule'), nat('expected'), nat('actual')]

export const decodeState = (h: string) => (decodeVecRecord(h, STATE_FIELDS) as unknown as GameState[])[0]
export const decodeSeats = (h: string) => decodeVecRecord(h, SEAT_FIELDS) as unknown as SeatRow[]
export const decodeHand = (h: string) => (decodeVecRecord(h, HAND_FIELDS) as unknown as { card: bigint }[]).map((r) => Number(r.card))
export const decodeOpen = (h: string) => decodeVecRecord(h, OPEN_FIELDS) as unknown as OpenTable[]
export const decodeEvents = (h: string) => decodeVecRecord(h, EVENT_FIELDS) as unknown as TableEvent[]
export const decodeLeaders = (h: string) => decodeVecRecord(h, LEADER_FIELDS) as unknown as LeaderRow[]
export const decodeConservation = (h: string) => decodeVecRecord(h, CONSERVATION_FIELDS) as unknown as Conservation[]
export const decodeViolations = (h: string) => decodeVecRecord(h, VIOLATION_FIELDS) as unknown as Violation[]

export const M = {
  state: 'gameStateView', seats: 'seatsView', hand: 'myHandView', open: 'openTables',
  events: 'tableEventsView', leaders: 'leaderboardView', conservation: 'conservationView',
  invariants: 'invariantReportView', myStats: 'myStatsView',
} as const
export const idArg = (id: bigint) => encodeArg({ type: 'nat', value: id })
export const pageArg = (id: bigint, offset: number, limit: number) =>
  encodeArgs([{ type: 'nat', value: id }, { type: 'nat', value: BigInt(offset) }, { type: 'nat', value: BigInt(limit) }])
export const limitArg = (limit: number) => encodeArg({ type: 'nat', value: BigInt(limit) })

// ── Writes (trap-on-error) ──
export async function createTable(game: 'estimation' | 'tarneeb', name: string): Promise<bigint> {
  const r = await update(CARDS_CID, 'createTable', encodeArgs([{ type: 'text', value: game }, { type: 'text', value: name }]))
  return decodeNat(r.reply_hex ?? r.reply ?? '')
}
export async function joinTable(id: bigint, name: string): Promise<void> {
  await update(CARDS_CID, 'joinTable', encodeArgs([{ type: 'nat', value: id }, { type: 'text', value: name }]))
}
export const addBot = (id: bigint) => update(CARDS_CID, 'addBot', idArg(id))
export const startHand = (id: bigint) => update(CARDS_CID, 'startHand', idArg(id))
export const rematch = (id: bigint) => update(CARDS_CID, 'rematch', idArg(id))
export const nudge = (id: bigint) => update(CARDS_CID, 'nudge', idArg(id))
export const passBid = (id: bigint) => update(CARDS_CID, 'passBid', idArg(id))
export const closeTable = (id: bigint) => update(CARDS_CID, 'closeTable', idArg(id))
export const bid = (id: bigint, number: number, suitRank: number) =>
  update(CARDS_CID, 'bid', encodeArgs([{ type: 'nat', value: id }, { type: 'nat', value: BigInt(number) }, { type: 'nat', value: BigInt(suitRank) }]))
export const estimate = (id: bigint, value: number) =>
  update(CARDS_CID, 'estimate', encodeArgs([{ type: 'nat', value: id }, { type: 'nat', value: BigInt(value) }]))
export const playCard = (id: bigint, card: number) =>
  update(CARDS_CID, 'playCard', encodeArgs([{ type: 'nat', value: id }, { type: 'nat', value: BigInt(card) }]))

/** One click to a live game: open a table, seat the house in the other three
 *  chairs, and deal the first hand. */
export async function playVsHouse(game: 'estimation' | 'tarneeb', name: string): Promise<bigint> {
  const id = await createTable(game, name)
  await addBot(id)
  await addBot(id)
  await addBot(id)
  await startHand(id)
  return id
}

export { query, CARDS_CID }

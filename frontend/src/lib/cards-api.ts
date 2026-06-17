/**
 * cards-api.ts — typed reads/writes for the card-game backend. Reads use the flat
 * `*View` queries (gameState 1-row, seats 4-rows, hand N-rows). The game/variant
 * args are passed as TEXT/Nat (the SDK can't encode Candid variants).
 */
import { query, update, encodeArg, encodeArgs, decodeVecRecord, decodeNat } from '@thebes/sdk'
import { CARDS_CID } from './config'

export interface GameState {
  game: string; phase: string; dealer: bigint; current: bigint; trump: bigint
  bidNumber: bigint; declarer: bigint; handNumber: bigint; mySeat: bigint; leadSuit: bigint; version: bigint
}
export interface SeatRow {
  seat: bigint; name: string; seated: boolean; estimate: bigint; tricksWon: bigint; score: bigint; played: bigint
}
export interface OpenTable { id: bigint; game: string; seatsTaken: bigint }

const STATE_FIELDS = [
  { name: 'game', type: 'text' as const }, { name: 'phase', type: 'text' as const },
  { name: 'dealer', type: 'nat' as const }, { name: 'current', type: 'nat' as const },
  { name: 'trump', type: 'nat' as const }, { name: 'bidNumber', type: 'nat' as const },
  { name: 'declarer', type: 'nat' as const }, { name: 'handNumber', type: 'nat' as const },
  { name: 'mySeat', type: 'int' as const }, { name: 'leadSuit', type: 'int' as const },
  { name: 'version', type: 'nat' as const },
]
const SEAT_FIELDS = [
  { name: 'seat', type: 'nat' as const }, { name: 'name', type: 'text' as const },
  { name: 'seated', type: 'bool' as const }, { name: 'estimate', type: 'int' as const },
  { name: 'tricksWon', type: 'nat' as const }, { name: 'score', type: 'int' as const },
  { name: 'played', type: 'int' as const },
]
const HAND_FIELDS = [{ name: 'card', type: 'nat' as const }]
const OPEN_FIELDS = [
  { name: 'id', type: 'nat' as const }, { name: 'game', type: 'text' as const }, { name: 'seatsTaken', type: 'nat' as const },
]

export const decodeState = (h: string) => (decodeVecRecord(h, STATE_FIELDS) as unknown as GameState[])[0]
export const decodeSeats = (h: string) => decodeVecRecord(h, SEAT_FIELDS) as unknown as SeatRow[]
export const decodeHand = (h: string) => (decodeVecRecord(h, HAND_FIELDS) as unknown as { card: bigint }[]).map((r) => Number(r.card))
export const decodeOpen = (h: string) => decodeVecRecord(h, OPEN_FIELDS) as unknown as OpenTable[]

export const M = { state: 'gameStateView', seats: 'seatsView', hand: 'myHandView', open: 'openTables' } as const
export const idArg = (id: bigint) => encodeArg({ type: 'nat', value: id })

// ── Writes (trap-on-error) ──
export async function createTable(game: 'estimation' | 'tarneeb', name: string): Promise<bigint> {
  const r = await update(CARDS_CID, 'createTable', encodeArgs([{ type: 'text', value: game }, { type: 'text', value: name }]))
  return decodeNat(r.reply_hex ?? r.reply ?? '')
}
export async function joinTable(id: bigint, name: string): Promise<void> {
  await update(CARDS_CID, 'joinTable', encodeArgs([{ type: 'nat', value: id }, { type: 'text', value: name }]))
}
export const startHand = (id: bigint) => update(CARDS_CID, 'startHand', idArg(id))
export const passBid = (id: bigint) => update(CARDS_CID, 'passBid', idArg(id))
export const closeTable = (id: bigint) => update(CARDS_CID, 'closeTable', idArg(id))
export const bid = (id: bigint, number: number, suitRank: number) =>
  update(CARDS_CID, 'bid', encodeArgs([{ type: 'nat', value: id }, { type: 'nat', value: BigInt(number) }, { type: 'nat', value: BigInt(suitRank) }]))
export const estimate = (id: bigint, value: number) =>
  update(CARDS_CID, 'estimate', encodeArgs([{ type: 'nat', value: id }, { type: 'nat', value: BigInt(value) }]))
export const playCard = (id: bigint, card: number) =>
  update(CARDS_CID, 'playCard', encodeArgs([{ type: 'nat', value: id }, { type: 'nat', value: BigInt(card) }]))

export { query, CARDS_CID }

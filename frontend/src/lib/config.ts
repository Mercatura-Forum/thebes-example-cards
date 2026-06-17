/** Contract id — injected at deploy via window global; fallback 0 until then. */
declare global {
  interface Window {
    CARDS_CID?: number
  }
}
export const CARDS_CID: number = (typeof window !== 'undefined' && window.CARDS_CID) || 0

// Card id 0..51: suit = id/13 (0♣ 1♦ 2♥ 3♠), rank = id%13 (0=2 … 12=A).
export const SUIT_SYMBOL = ['♣', '♦', '♥', '♠'] as const
export const SUIT_RED = [false, true, true, false] as const
export const RANK_LABEL = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const
export const suitOf = (c: number) => Math.floor(c / 13)
export const rankOf = (c: number) => c % 13
// Trump/suit code 0..3 = suit, 4 = No-Trump.
export const SUIT_NAME = ['Clubs', 'Diamonds', 'Hearts', 'Spades', 'No-Trump'] as const

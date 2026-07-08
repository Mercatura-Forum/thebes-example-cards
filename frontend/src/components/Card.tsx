import { SUIT_SYMBOL, SUIT_RED, RANK_LABEL, suitOf, rankOf } from '../lib/config'

/** A CSS-rendered playing card (no asset files). `card` is 0..51; pass nothing
 *  (or back) for a face-down card. Crisp at any width. `playable` lifts the
 *  card on hover and throws it on click. */
export function Card({
  card, back = false, w = 60, onClick, disabled = false, raised = false, playable = false,
}: {
  card?: number; back?: boolean; w?: number; onClick?: () => void; disabled?: boolean; raised?: boolean; playable?: boolean
}) {
  const h = Math.round(w * 1.4)
  const style = { width: w, height: h, fontSize: Math.round(w * 0.26) }
  if (back || card == null) {
    return <div className="pcard back" style={style} aria-hidden />
  }
  const s = suitOf(card)
  const r = rankOf(card)
  const sym = SUIT_SYMBOL[s]
  const interactive = !!onClick
  const cls = `pcard ${SUIT_RED[s] ? 'red' : 'black'} ${playable && interactive && !disabled ? 'playable' : ''} ${raised ? '-translate-y-3' : ''} ${disabled ? 'opacity-40' : ''}`
  const inner = (
    <>
      <span className="corner"><span>{RANK_LABEL[r]}</span><span>{sym}</span></span>
      <span className="mid">{sym}</span>
      <span className="corner br"><span>{RANK_LABEL[r]}</span><span>{sym}</span></span>
    </>
  )
  return interactive ? (
    <button className={cls} style={style} onClick={onClick} disabled={disabled} aria-label={`${RANK_LABEL[r]} of ${['clubs','diamonds','hearts','spades'][s]}`}>{inner}</button>
  ) : (
    <div className={cls} style={style}>{inner}</div>
  )
}

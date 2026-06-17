import type { ButtonHTMLAttributes, ReactNode } from 'react'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'gold' | 'ghost' }
export function Button({ variant = 'gold', className = '', ...props }: BtnProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed'
  const styles: Record<string, string> = {
    gold: 'bg-[var(--color-gold)] text-[#3a2a08] hover:brightness-110 active:brightness-95',
    ghost: 'bg-transparent text-ink ring-1 ring-[var(--color-gold)]/40 hover:bg-white/5',
  }
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-ink-soft text-sm" role="status">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-[var(--color-gold)]" />
      {label}…
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-200 ring-1 ring-red-500/30">{message}</p>
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`felt-panel p-5 ${className}`}>{children}</div>
}

/** Trump/suit chip (gold). */
export function SuitChip({ label }: { label: string }) {
  return <span className="rounded-full bg-[var(--color-gold)]/15 px-2.5 py-0.5 text-xs font-semibold text-[var(--color-gold)] ring-1 ring-[var(--color-gold)]/30">{label}</span>
}

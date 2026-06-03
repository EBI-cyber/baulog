// Getöntes, abgerundetes Plättchen mit Icon — für ein konsistentes, modernes Look&Feel
export default function IconChip({ icon: I, size = 'w-10 h-10', iconClass = 'w-5 h-5', variant = 'tint', className = '' }) {
  const base = 'shrink-0 rounded-xl flex items-center justify-center ' + size + ' '
  const look = variant === 'grad'
    ? 'btn-grad shadow-glow'
    : variant === 'plain'
      ? 'bg-white/[0.06] border border-white/10 text-white/70'
      : 'icon-chip'
  return (
    <div className={base + look + ' ' + className}>
      <I className={iconClass} strokeWidth={1.9} />
    </div>
  )
}

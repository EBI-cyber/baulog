import IconChip from '../ui/IconChip'

export default function Sheet({ titel, icon, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-30" onClick={onClose}>
      <div className="glass bg-[#0b1f2a]/95 w-full max-w-md mx-auto rounded-t-4xl md:rounded-4xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-3 md:m-4 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold flex items-center gap-2.5">
          {icon && <IconChip icon={icon} size="w-9 h-9" iconClass="w-[18px] h-[18px]" />} {titel}
        </div>
        {children}
      </div>
    </div>
  )
}

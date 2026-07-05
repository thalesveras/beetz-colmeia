export default function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  return (
    <div className="w-full">
      {label && <div className="flex justify-between text-xs text-beetz-dark/60 mb-1"><span>{label}</span><span>{percent}%</span></div>}
      <div className="w-full h-2.5 rounded-full bg-beetz-dark/10 overflow-hidden">
        <div
          className="h-full rounded-full honey-gradient transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  )
}

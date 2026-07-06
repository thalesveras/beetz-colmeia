interface FileFieldProps {
  label: string
  value: string | null
  onChange: (dataUrl: string | null) => void
}

export default function FileField({ label, value, onChange }: FileFieldProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onChange(reader.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <label className="text-sm font-medium block mb-1">{label}</label>
      <div className="flex items-center gap-3">
        <label className="flex-1 cursor-pointer border border-beetz-dark/15 rounded-xl px-4 py-2.5 text-sm text-beetz-dark/50 hover:bg-beetz-gray transition-colors truncate">
          {value ? 'Arquivo selecionado ✓' : 'Escolher arquivo...'}
          <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleChange} />
        </label>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-beetz-dark/40 hover:text-beetz-dark">Remover</button>
        )}
      </div>
    </div>
  )
}

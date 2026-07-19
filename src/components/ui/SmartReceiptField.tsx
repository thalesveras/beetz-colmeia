import { useRef, useState } from 'react'
import { ScanLine, Trash2, Upload } from 'lucide-react'

// Campo de comprovante inteligente: recebe a imagem por arrasto, colagem
// (Ctrl/Cmd+V) ou toque, e lê o print com OCR direto no navegador
// (tesseract.js via CDN, baixado só na primeira leitura — nada de chave de
// API nem servidor). Do texto lido saem valor, data e ID/favorecido, que
// voltam pro formulário via onExtracted. A imagem em si vai em onChange
// (base64), redimensionada pra não inchar o banco.

export interface ExtractedReceipt {
  amount: number | null
  date: string | null
  notes: string | null
}

// Extração pura (testável): recebe o texto do OCR, devolve os campos.
export function extractReceiptFields(text: string): ExtractedReceipt {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Valor: o principal do comprovante é o R$ MAIOR (taxas e saldos menores
  // aparecem às vezes). Aceita "R$ 311,10" e "R$ 1.311,10".
  const amounts = Array.from(text.matchAll(/R\$?\s*([\d.]+,\d{2})/g))
    .map((m) => Number(m[1].replace(/\./g, '').replace(',', '.')))
    .filter((n) => n > 0)
  const amount = amounts.length > 0 ? Math.max(...amounts) : null

  // Data: prioriza a linha com "solicitado/pago/realizado/data em"; senão a
  // primeira dd/mm/aaaa que aparecer. Devolve ISO pro input type=date.
  const dateRe = /(\d{2})\/(\d{2})\/(\d{4})/
  let dm: RegExpMatchArray | null = null
  for (const l of lines) {
    if (/solicitad|pago|realizad|efetuad|data/i.test(l)) {
      const m = l.match(dateRe)
      if (m) { dm = m; break }
    }
  }
  if (!dm) dm = text.match(dateRe)
  const date = dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null

  // Observações: ID da transação + favorecido ("Para:"/"Favorecido:").
  const id = text.match(/\bID:?\s*([a-z0-9-]{8,})/i)?.[1] ?? null
  let para: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:para|favorecido):?\s*(.*)$/i)
    if (m) {
      // Valor na mesma linha, ou (layout de duas colunas) na linha seguinte.
      para = m[1].trim() || lines[i + 1]?.trim() || null
      break
    }
  }
  if (!para) para = text.match(/favorecido:?\s*([^\n|]+)/i)?.[1]?.trim() ?? null
  const parts: string[] = []
  if (id) parts.push(`ID ${id}`)
  if (para) parts.push(`Para: ${para.slice(0, 80)}`)
  const notes = parts.length > 0 ? parts.join(' · ') : null

  return { amount, date, notes }
}

// tesseract.js entra por script tag na primeira leitura e fica no window —
// não pesa o bundle de quem nunca usa OCR.
async function loadTesseract(): Promise<any> {
  const w = window as any
  if (w.Tesseract) return w.Tesseract
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Não deu pra carregar o leitor de comprovante — confira a internet.'))
    document.head.appendChild(s)
  })
  return (window as any).Tesseract
}

// Print gigante vira base64 gigante no banco — reduz pra no máx 1600px.
async function fileToDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Não deu pra ler o arquivo.'))
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('O arquivo não parece uma imagem.'))
    i.src = raw
  })
  const MAX = 1600
  if (img.width <= MAX && img.height <= MAX) return raw
  const scale = MAX / Math.max(img.width, img.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

export default function SmartReceiptField({ value, onChange, onExtracted }: {
  value: string | null
  onChange: (dataUrl: string | null) => void
  onExtracted?: (fields: ExtractedReceipt) => void
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [lastExtract, setLastExtract] = useState<ExtractedReceipt | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setLastExtract(null)
    try {
      const dataUrl = await fileToDataUrl(file)
      onChange(dataUrl)
      await runOcr(dataUrl)
    } catch (e: any) {
      setError(e?.message ?? 'Não deu pra processar a imagem.')
    }
  }

  async function runOcr(dataUrl: string) {
    setReading(true)
    setProgress(0)
    setError(null)
    try {
      const T = await loadTesseract()
      const result = await T.recognize(dataUrl, 'por', {
        logger: (m: any) => {
          if (m?.status === 'recognizing text' && typeof m.progress === 'number') {
            setProgress(Math.round(m.progress * 100))
          }
        }
      })
      const fields = extractReceiptFields(result?.data?.text ?? '')
      setLastExtract(fields)
      if (fields.amount == null && fields.date == null && fields.notes == null) {
        setError('Li a imagem mas não achei valor nem data — preencha na mão que o comprovante fica salvo mesmo assim.')
      } else {
        onExtracted?.(fields)
      }
    } catch (e: any) {
      setError(e?.message ?? 'Não deu pra ler o comprovante — preencha os campos na mão.')
    } finally {
      setReading(false)
    }
  }

  function pickPastedImage(e: { clipboardData: DataTransfer; preventDefault: () => void }) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'))
    const file = item?.getAsFile()
    if (file) { e.preventDefault(); handleFile(file) }
  }

  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div>
      <input
        ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
      />
      {value ? (
        <div className="flex items-start gap-3 bg-white border border-beetz-dark/10 rounded-xl p-3">
          <img src={value} alt="Comprovante" className="w-16 h-16 object-cover rounded-lg border border-beetz-dark/10 shrink-0" />
          <div className="flex-1 min-w-0">
            {reading ? (
              <p className="text-xs text-beetz-dark/60">Lendo o comprovante... {progress > 0 ? `${progress}%` : ''}</p>
            ) : lastExtract ? (
              <div className="flex flex-wrap gap-1.5">
                {lastExtract.amount != null && (
                  <span className="text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">{brl(lastExtract.amount)}</span>
                )}
                {lastExtract.date && (
                  <span className="text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                    {new Date(lastExtract.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </span>
                )}
                {lastExtract.notes && (
                  <span className="text-[11px] font-medium bg-beetz-gray text-beetz-dark/70 px-2 py-0.5 rounded-full max-w-full truncate">{lastExtract.notes}</span>
                )}
              </div>
            ) : (
              <p className="text-xs text-beetz-dark/50">Comprovante anexado.</p>
            )}
            {error && <p className="text-[11px] text-amber-700 mt-1">{error}</p>}
            <div className="flex gap-2 mt-2">
              {!reading && (
                <button type="button" onClick={() => runOcr(value)} className="flex items-center gap-1 text-[11px] font-semibold text-beetz-dark/60 hover:text-beetz-dark">
                  <ScanLine size={11} /> Ler de novo
                </button>
              )}
              <button type="button" onClick={() => { onChange(null); setLastExtract(null); setError(null) }} className="flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:text-red-700">
                <Trash2 size={11} /> Remover
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          role="button" tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click() }}
          onPaste={pickPastedImage}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files?.[0]
            if (f) handleFile(f)
          }}
          className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-xl px-4 py-5 cursor-pointer transition-colors text-center ${
            dragOver ? 'border-beetz-yellow bg-beetz-yellow/10' : 'border-beetz-dark/15 bg-white hover:border-beetz-dark/30'
          }`}
        >
          <Upload size={18} className="text-beetz-dark/35" />
          <p className="text-xs font-semibold text-beetz-dark/60">Arraste o comprovante aqui, cole (Ctrl+V) ou toque</p>
          <p className="text-[11px] text-beetz-dark/40">Eu leio o print e preencho valor, data e observações</p>
          {error && <p className="text-[11px] text-amber-700">{error}</p>}
        </div>
      )}
    </div>
  )
}

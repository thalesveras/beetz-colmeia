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

// Fechamento de maquininha: valores por forma de pagamento. Cada linha do
// print que tenha a palavra-chave E um valor R$ soma no campo (crédito à
// vista + parcelado, por exemplo, entram juntos em "crédito").
export interface ExtractedPayments {
  dinheiro: number | null
  debito: number | null
  credito: number | null
  pix: number | null
  total: number | null
}

export function extractPaymentFields(text: string): ExtractedPayments {
  const stripAccents = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  // Exige casa decimal (vírgula OU ponto) pra não confundir valor com
  // ID/quantidade. "1.660,30" e "1660.30" entram; "298" não.
  const parseTok = (t: string): number => {
    if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.')) || 0
    return Number(t.replace(/,/g, '')) || 0
  }
  const moneyIn = (l: string): number | null => {
    const ms = Array.from(l.matchAll(/R?\$?\s*(\d[\d.,]*[.,]\d{2})\b/g)).map((m) => parseTok(m[1]))
    return ms.length > 0 ? ms[ms.length - 1] : null
  }
  const sums: { dinheiro: number | null; debito: number | null; credito: number | null; pix: number | null } = {
    dinheiro: null, debito: null, credito: null, pix: null
  }
  // OCR de papel térmico estropia letra: "débito" vira "d3bito", "pix" vira
  // "p1x". As chaves toleram as trocas comuns sem abraçar o mundo.
  const KEYS: [keyof typeof sums, RegExp][] = [
    ['dinheiro', /d[i1l]nhe[i1l]ro|espec[i1l]e/],
    ['debito', /d[e3]b[i1l]to|\bdeb\b/],
    ['credito', /cr[e3]d[i1l]to|\bcred\b/],
    ['pix', /\bp[i1l]x\b/]
  ]
  let total: number | null = null
  for (const raw of lines) {
    const l = stripAccents(raw)
    const v = moneyIn(raw)
    if (v == null) continue
    let matched = false
    for (const [key, re] of KEYS) {
      if (re.test(l)) {
        sums[key] = (sums[key] ?? 0) + v
        matched = true
        break
      }
    }
    if (!matched && /total/.test(l) && total == null) total = v
  }
  return { ...sums, total }
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

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Não deu pra ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('O arquivo não parece uma imagem.'))
    i.src = src
  })
}

// Duas versões da mesma foto: a que vai pro banco (1600px, leve) e a que vai
// pro OCR (2400px, preto-e-branco com contraste reforçado — papel térmico
// fotografado é cinza sobre cinza, e o leitor melhora muito com o realce).
// O realce é pixel a pixel de propósito: ctx.filter não existe em todo Safari.
function drawScaled(img: HTMLImageElement, maxSide: number, enhanceForOcr: boolean): string {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  if (enhanceForOcr) {
    const data = ctx.getImageData(0, 0, w, h)
    const px = data.data
    const CONTRAST = 1.45
    for (let i = 0; i < px.length; i += 4) {
      const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      const v = Math.max(0, Math.min(255, (g - 128) * CONTRAST + 136))
      px[i] = v; px[i + 1] = v; px[i + 2] = v
    }
    ctx.putImageData(data, 0, 0)
  }
  return canvas.toDataURL('image/jpeg', enhanceForOcr ? 0.9 : 0.85)
}

async function fileToVersions(file: File): Promise<{ store: string; ocr: string }> {
  const raw = await readAsDataUrl(file)
  const img = await loadImage(raw)
  const store = img.width <= 1600 && img.height <= 1600 ? raw : drawScaled(img, 1600, false)
  return { store, ocr: drawScaled(img, 2400, true) }
}

async function prepareForOcr(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl)
  return drawScaled(img, 2400, true)
}

export default function SmartReceiptField({ value, onChange, onExtracted, onExtractedPayments, variant = 'repasse' }: {
  value: string | null
  onChange: (dataUrl: string | null) => void
  onExtracted?: (fields: ExtractedReceipt) => void
  // variant 'pagamentos': em vez de valor/data/ID, o OCR procura os totais
  // por forma de pagamento (fechamento de maquininha) e devolve aqui.
  onExtractedPayments?: (fields: ExtractedPayments) => void
  variant?: 'repasse' | 'pagamentos'
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [lastExtract, setLastExtract] = useState<ExtractedReceipt | null>(null)
  const [lastPayments, setLastPayments] = useState<ExtractedPayments | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setLastExtract(null)
    setLastPayments(null)
    try {
      const { store, ocr } = await fileToVersions(file)
      onChange(store)
      await runOcr(ocr)
    } catch (e: any) {
      setError(e?.message ?? 'Não deu pra processar a imagem.')
    }
  }

  async function rerunOcr(dataUrl: string) {
    try {
      await runOcr(await prepareForOcr(dataUrl))
    } catch (e: any) {
      setError(e?.message ?? 'Não deu pra reler a imagem.')
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
      const text = result?.data?.text ?? ''
      if (variant === 'pagamentos') {
        const pay = extractPaymentFields(text)
        setLastPayments(pay)
        if (pay.dinheiro == null && pay.debito == null && pay.credito == null && pay.pix == null) {
          setError(
            pay.total != null
              ? `Achei só o total — as linhas por forma de pagamento não ficaram legíveis. Tente uma foto de frente, sem inclinação e com boa luz (ou toque em "Ler de novo"), senão preencha na mão.`
              : 'Li a imagem mas não achei os valores por forma de pagamento — preencha na mão que o comprovante fica salvo mesmo assim.'
          )
        } else {
          onExtractedPayments?.(pay)
        }
      } else {
        const fields = extractReceiptFields(text)
        setLastExtract(fields)
        if (fields.amount == null && fields.date == null && fields.notes == null) {
          setError('Li a imagem mas não achei valor nem data — preencha na mão que o comprovante fica salvo mesmo assim.')
        } else {
          onExtracted?.(fields)
        }
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
            ) : lastPayments ? (
              <div className="flex flex-wrap gap-1.5">
                {([['Dinheiro', lastPayments.dinheiro], ['Débito', lastPayments.debito], ['Crédito', lastPayments.credito], ['Pix', lastPayments.pix]] as [string, number | null][])
                  .filter(([, v]) => v != null)
                  .map(([label, v]) => (
                    <span key={label} className="text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                      {label} {brl(v!)}
                    </span>
                  ))}
                {lastPayments.total != null && (
                  <span className="text-[11px] font-medium bg-beetz-gray text-beetz-dark/70 px-2 py-0.5 rounded-full">
                    Total {brl(lastPayments.total)}
                  </span>
                )}
              </div>
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
                <button type="button" onClick={() => rerunOcr(value)} className="flex items-center gap-1 text-[11px] font-semibold text-beetz-dark/60 hover:text-beetz-dark">
                  <ScanLine size={11} /> Ler de novo
                </button>
              )}
              <button type="button" onClick={() => { onChange(null); setLastExtract(null); setLastPayments(null); setError(null) }} className="flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:text-red-700">
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
          <p className="text-[11px] text-beetz-dark/40">
            {variant === 'pagamentos'
              ? 'Eu leio o fechamento e preencho dinheiro, débito, crédito e pix — foto de frente e com luz ajuda'
              : 'Eu leio o print e preencho valor, data e observações'}
          </p>
          {error && <p className="text-[11px] text-amber-700">{error}</p>}
        </div>
      )}
    </div>
  )
}

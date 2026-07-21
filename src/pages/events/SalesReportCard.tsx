import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, Link2, Trash2, Upload } from 'lucide-react'
import {
  createEventSalesImport, deleteEventSalesImport,
  listEventSalesImports, listEventSalesLines, listProducts, mapPosNameToProduct, normalizePosName
} from '../../lib/dataService'
import type { ParsedSalesLine } from '../../lib/dataService'
import type { EventSalesImport, EventSalesLine, Product } from '../../lib/types'
import { useAuth } from '../../contexts/AuthContext'

const inputClass = 'border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// "R$ 4.768,00" → 4768; "298" → 298; "R$ -10,00" → -10.
function money(s: string): number {
  const cleaned = s.replace(/[^\d,.-]/g, '')
  if (!cleaned) return 0
  return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0
}

// O relatório do PDV vem em UTF-16 com BOM e primeira linha "sep=;" —
// detecta o encoding pelos bytes iniciais e o separador pela dica do arquivo.
// Colunas são achadas pelo nome (não pela posição): relatório que mudar a
// ordem continua entrando.
async function parseSalesCsv(file: File): Promise<ParsedSalesLine[]> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let text: string
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le').decode(buf)
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be').decode(buf)
  else text = new TextDecoder('utf-8').decode(buf)

  const rawLines = text.split(/\r?\n/).map((l) => l.replace(/^﻿/, '')).filter((l) => l.trim())
  if (rawLines.length < 2) throw new Error('Arquivo vazio ou fora do formato esperado.')

  let delim = ';'
  let start = 0
  if (rawLines[0].toLowerCase().startsWith('sep=')) {
    delim = rawLines[0].slice(4, 5) || ';'
    start = 1
  }
  const header = rawLines[start].split(delim).map((h) => h.trim().toLowerCase())
  const iProd = header.findIndex((h) => h.startsWith('produto'))
  const iCat = header.findIndex((h) => h.startsWith('categoria'))
  const iUnit = header.findIndex((h) => h.includes('unit'))
  const iFat = header.findIndex((h) => h.includes('faturada'))
  const iBonus = header.findIndex((h) => h.startsWith('qnt') && (h.includes('bônus') || h.includes('bonus')))
  const iQty = header.findIndex((h) => h === 'quantidade')
  const iTotal = header.findIndex((h) => h.includes('total geral'))
  if (iProd < 0) throw new Error('Não achei a coluna "Produto" no arquivo — é o relatório de vendas da máquina?')

  const out: ParsedSalesLine[] = []
  for (const raw of rawLines.slice(start + 1)) {
    const cols = raw.split(delim)
    const name = (cols[iProd] ?? '').trim()
    if (!name || name.toLowerCase() === 'total') continue
    const qtyBilled = iFat >= 0 ? money(cols[iFat] ?? '') : 0
    const qtyBonus = iBonus >= 0 ? money(cols[iBonus] ?? '') : 0
    const quantity = iQty >= 0 ? money(cols[iQty] ?? '') : qtyBilled + qtyBonus
    out.push({
      pos_name: name,
      category: iCat >= 0 ? (cols[iCat] ?? '').trim() || null : null,
      unit_value: iUnit >= 0 ? money(cols[iUnit] ?? '') : null,
      qty_billed: qtyBilled,
      qty_bonus: qtyBonus,
      quantity,
      total_gross: iTotal >= 0 ? money(cols[iTotal] ?? '') : null
    })
  }
  return out
}

// Vendas da máquina DENTRO da aba Produtos: subiu o CSV do dia, o "Vendido"
// de cada produto lançado atualiza sozinho (Σ de todos os dias, idempotente —
// resubir não duplica). Nome novo da máquina pede vínculo UMA vez e fica
// gravado pros próximos relatórios. A sobra vive na "A conta" do Estoque.
export default function SalesReportCard({ eventId, onSynced }: { eventId: string; onSynced?: () => void }) {
  const { userId } = useAuth()
  const [imports, setImports] = useState<EventSalesImport[]>([])
  const [lines, setLines] = useState<EventSalesLine[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10))
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Escolhas de vínculo em edição, por nome normalizado da máquina.
  const [mapProduct, setMapProduct] = useState<Record<string, string>>({})
  const [mapUnits, setMapUnits] = useState<Record<string, string>>({})
  const [mappingKey, setMappingKey] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [imps, lns, prods] = await Promise.all([
      listEventSalesImports(eventId),
      listEventSalesLines(eventId),
      listProducts()
    ])
    setImports(imps)
    setLines(lns)
    setProducts(prods)
    setLoading(false)
  }

  useEffect(() => { load() }, [eventId])

  async function handleFile(file: File) {
    setImporting(true)
    setError(null)
    try {
      const parsed = await parseSalesCsv(file)
      await createEventSalesImport(eventId, { report_date: reportDate || null, file_name: file.name }, parsed, userId)
      await load()
      onSynced?.()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível importar o arquivo.')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDeleteImport(id: string) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return }
    setConfirmDeleteId(null)
    await deleteEventSalesImport(id)
    await load()
    onSynced?.()
  }

  // Nomes da máquina ainda sem produto do estoque — agrupados, com o total
  // vendido pra dar noção de urgência.
  const unmapped = useMemo(() => {
    const byKey = new Map<string, { name: string; qty: number; total: number }>()
    for (const l of lines) {
      if (l.product_id) continue
      const key = normalizePosName(l.pos_name)
      const entry = byKey.get(key) ?? { name: l.pos_name, qty: 0, total: 0 }
      entry.qty += l.quantity
      entry.total += l.total_gross ?? 0
      byKey.set(key, entry)
    }
    return Array.from(byKey.entries()).sort((a, b) => b[1].total - a[1].total)
  }, [lines])

  async function handleMap(key: string, originalName: string) {
    const productId = mapProduct[key]
    const units = Number((mapUnits[key] ?? '1').replace(',', '.'))
    if (!productId || !(units > 0)) return
    setMappingKey(key)
    try {
      await mapPosNameToProduct(eventId, originalName, productId, units)
      await load()
      onSynced?.()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível vincular.')
    } finally {
      setMappingKey(null)
    }
  }

  const totalFaturado = useMemo(() => lines.reduce((s, l) => s + (l.total_gross ?? 0), 0), [lines])
  const unmappedFaturado = useMemo(
    () => lines.filter((l) => !l.product_id).reduce((s, l) => s + (l.total_gross ?? 0), 0),
    [lines]
  )

  return (
    <div className="bg-beetz-dark text-white rounded-2xl p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-beetz-yellow flex items-center gap-1.5 mb-1">
        <BarChart3 size={13} /> Vendas da máquina (PDV)
      </p>
      <p className="text-xs text-white/50 mb-3">
        Suba o relatório do dia e o <span className="font-semibold text-white/80">Vendido</span> de cada produto
        lançado atualiza sozinho — todos os dias somados, sem duplicar se resubir.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)}
          className="rounded-xl border-0 bg-white text-beetz-dark text-sm px-3 py-2"
          aria-label="Dia do relatório"
        />
        <input
          ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="flex items-center gap-1.5 text-sm font-bold honey-gradient text-beetz-dark px-3.5 py-2 rounded-xl disabled:opacity-60"
        >
          <Upload size={15} /> {importing ? 'Importando...' : 'Subir relatório do dia'}
        </button>
        {totalFaturado > 0 && (
          <span className="text-sm font-bold ml-auto">{currency(totalFaturado)} <span className="font-medium text-white/40 text-xs">faturados</span></span>
        )}
      </div>

      {error && <p className="text-sm text-red-300 bg-red-500/20 border border-red-400/30 rounded-xl px-3 py-2 mt-3">{error}</p>}

      {imports.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {imports.map((imp) => (
            <span key={imp.id} className="flex items-center gap-1.5 text-[11px] font-medium bg-white/10 px-2.5 py-1.5 rounded-full">
              {imp.report_date ? new Date(imp.report_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
              {imp.total_gross != null ? ` · ${currency(imp.total_gross)}` : ''}
              <button
                onClick={() => handleDeleteImport(imp.id)}
                className={`p-0.5 rounded ${confirmDeleteId === imp.id ? 'text-white bg-red-600' : 'text-white/40 hover:text-red-400'}`}
                title={confirmDeleteId === imp.id ? 'Toque de novo pra excluir' : 'Excluir importação'}
              >
                <Trash2 size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Mapeamento: cada nome vinculado fica gravado — o upload de amanhã já
          chega ligado. Un/venda traduz venda em unidade de estoque. */}
      {!loading && unmapped.length > 0 && (
        <div className="bg-white/10 rounded-xl p-3 mt-3">
          <p className="text-xs font-bold text-beetz-yellow flex items-center gap-1.5 mb-1">
            <Link2 size={12} /> {unmapped.length} nome(s) da máquina sem produto
            {unmappedFaturado > 0 ? ` · ${currency(unmappedFaturado)} fora da conta` : ''}
          </p>
          <p className="text-[11px] text-white/50 mb-2">
            Vincule uma vez e fica gravado. "Un/venda" = unidades de estoque por venda (lata = 1 · dose de garrafa de 12 = 0,08).
          </p>
          <div className="space-y-1.5">
            {unmapped.map(([key, u]) => (
              <div key={key} className="flex flex-wrap items-center gap-2 bg-white rounded-xl px-3 py-2 text-beetz-dark">
                <div className="flex-1 min-w-[140px]">
                  <p className="text-sm font-semibold truncate">{u.name}</p>
                  <p className="text-[11px] text-beetz-dark/45">{u.qty} venda(s) · {currency(u.total)}</p>
                </div>
                <select
                  value={mapProduct[key] ?? ''}
                  onChange={(e) => setMapProduct((prev) => ({ ...prev, [key]: e.target.value }))}
                  className={`${inputClass} max-w-[170px]`}
                >
                  <option value="">Produto do estoque...</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input
                  type="text" inputMode="decimal"
                  value={mapUnits[key] ?? '1'}
                  onChange={(e) => setMapUnits((prev) => ({ ...prev, [key]: e.target.value }))}
                  className={`${inputClass} w-20`}
                  title="Unidades de estoque por venda"
                />
                <button
                  onClick={() => handleMap(key, u.name)}
                  disabled={!mapProduct[key] || mappingKey === key}
                  className="text-xs font-bold honey-gradient text-beetz-dark px-3 py-2 rounded-lg disabled:opacity-50"
                >
                  {mappingKey === key ? '...' : 'Vincular'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

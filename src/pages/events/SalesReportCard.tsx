import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, Link2, Sparkles, Trash2, Upload } from 'lucide-react'
import {
  createEventSalesImport, deleteEventSalesImport, dexListEvents, dexProductsReport, getEventById,
  listEventSalesImports, listEventSalesLines, listProducts, mapPosNameToProduct, normalizePosName
} from '../../lib/dataService'
import type { DexEventOption, ParsedSalesLine } from '../../lib/dataService'
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
  // Vendas traz "Total Geral"; o relatório de Produção chama a mesma coluna
  // de "Receita". Mesmo número, nomes diferentes.
  const iTotal = header.findIndex((h) => h.includes('total geral') || h.startsWith('receita'))
  // A COLUNA CERTA da receita: "Total faturado" = venda SEM a taxa de serviço
  // (os 10% dos garçons, que o cliente paga por fora). "Total geral" soma a
  // taxa — servia pro faturado aparecer maior do que a casa de fato vendeu.
  const iNet = header.findIndex((h) => h.includes('total faturado'))
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
      total_gross: iTotal >= 0 ? money(cols[iTotal] ?? '') : null,
      total_net: iNet >= 0 ? money(cols[iNet] ?? '') : null
    })
  }
  return out
}

// ---------- "IA" de vínculo: nome da máquina → produto do estoque ----------
// Pontua cada produto contra o nome de venda: normaliza acento/caixa, compara
// contenção sem espaços ("Redbull" ↔ "RED BULL"), sobreposição de palavras
// (embalagem tipo garrafa/combo/lata não conta — a MARCA é o sinal) e tokens
// quase-iguais por prefixo ("Buchanan's" ↔ "BUCHANAS'S"). Sugere só acima da
// régua de 60%: "Mesa" casa com o produto MESA, mas "Agua de Coco" NÃO casa
// com AGUA — melhor ficar sem sugestão que sugerir errado. Testado contra o
// catálogo real (13/13).
function normMatch(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}
const MATCH_STOP = new Set(['garrafa', 'combo', 'lata', 'long', 'neck', 'dose', 'copo', 'balde', 'cerveja', 'tradicional', 'de', 'da', 'do', 'e', 'und', 'un', 'unid'])
function matchTokens(s: string): string[] {
  return normMatch(s).split(' ').filter((t) => !MATCH_STOP.has(t) && t.length > 1)
}
function tokenEq(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 6 || b.length < 6) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i >= Math.min(a.length, b.length) - 2 && i >= 5
}
function scoreMatch(saleName: string, productName: string): number {
  const a = normMatch(saleName)
  const b = normMatch(productName)
  if (!a || !b) return 0
  if (a === b) return 1
  const aFlat = a.replace(/\s/g, '')
  const bFlat = b.replace(/\s/g, '')
  let score = 0
  if (bFlat.length >= 6 && (aFlat.includes(bFlat) || bFlat.includes(aFlat))) score = 0.92
  const at = matchTokens(saleName)
  const bt = matchTokens(productName)
  if (at.length > 0 && bt.length > 0) {
    const hits = at.filter((t) => bt.some((u) => tokenEq(t, u))).length
    const ratio = hits / Math.max(at.length, bt.length)
    score = Math.max(score, ratio >= 1 ? 0.85 : ratio * 0.7)
    if (bFlat.length >= 6 && bt.every((t) => aFlat.includes(t))) score = Math.max(score, 0.8)
  }
  return score
}
function bestProductFor(saleName: string, products: Product[]): { product: Product; score: number } | null {
  let best: Product | null = null
  let bestScore = 0
  for (const p of products) {
    const s = scoreMatch(saleName, p.name)
    // Empate = ganha o nome mais específico: "Coca Cola Zero" casa 92% com
    // COCA-COLA e COCA-COLA ZERO — a Zero é a certa.
    if (s > bestScore || (s === bestScore && best && p.name.length > best.name.length)) { bestScore = s; best = p }
  }
  return best && bestScore >= 0.6 ? { product: best, score: bestScore } : null
}

// Vendas da máquina DENTRO da aba Produtos: subiu o CSV do dia, o "Vendido"
// de cada produto lançado atualiza sozinho (Σ de todos os dias, idempotente —
// resubir não duplica). Nome novo da máquina pede vínculo UMA vez e fica
// gravado pros próximos relatórios. A sobra vive na "A conta" do Estoque.
//
// O MESMO card também serve o relatório de PRODUÇÃO (kind='producao'): igual
// em tudo — parser, aliases, sugestões, regra do oficial — só muda o destino
// da soma: consumo da produção em vez do Vendido.
interface SalesReportCardProps {
  eventId: string
  kind?: 'vendas' | 'producao'
  onSynced?: () => void
}

export default function SalesReportCard({ eventId, kind = 'vendas', onSynced }: SalesReportCardProps) {
  const { userId } = useAuth()
  const [imports, setImports] = useState<EventSalesImport[]>([])
  const [lines, setLines] = useState<EventSalesLine[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Escolhas de vínculo em edição, por nome normalizado da máquina.
  const [mapProduct, setMapProduct] = useState<Record<string, string>>({})
  const [mapUnits, setMapUnits] = useState<Record<string, string>>({})
  const [mappingKey, setMappingKey] = useState<string | null>(null)
  // Sugestões da IA (score por nome) — preenchem os selects pra revisão; nada
  // é gravado sem o toque em Vincular / Vincular todas.
  const [suggested, setSuggested] = useState<Record<string, number>>({})
  const [applyingAll, setApplyingAll] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [imps, lns, prods] = await Promise.all([
      listEventSalesImports(eventId),
      listEventSalesLines(eventId),
      listProducts()
    ])
    // Cada card cuida do SEU tipo de relatório (vendas × produção) — as
    // linhas seguem junto porque filtram por pertencer aos imports daqui.
    setImports(imps.filter((i) => (i.kind ?? 'vendas') === kind))
    setLines(lns)
    setProducts(prods)
    setLoading(false)
  }

  useEffect(() => { load() }, [eventId, kind])

  async function handleFile(file: File) {
    setImporting(true)
    setError(null)
    try {
      const parsed = await parseSalesCsv(file)
      // Data do upload automática: o relatório é sempre DESTE evento e a
      // regra do oficial resolve versões — escolher dia era um campo a mais
      // pra errar.
      const imp = await createEventSalesImport(eventId, { report_date: new Date().toISOString().slice(0, 10), file_name: file.name }, parsed, userId, kind)
      // Se este upload cobriu anteriores (relatório cumulativo mais completo),
      // avisa que ele virou o oficial.
      const imps = await listEventSalesImports(eventId)
      const cobertos = imps.filter((i) => i.superseded_by === imp.id).length
      setInfo(cobertos > 0
        ? `Este upload é o oficial agora: cobre e substitui ${cobertos} anterior${cobertos > 1 ? 'es' : ''} — a conta usa só o mais completo.`
        : null)
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

  // Só linhas de uploads OFICIAIS (não substituídos por um mais completo)
  // entram nos números da tela — mesmo critério da soma do Vendido.
  const activeLines = useMemo(() => {
    const oficiais = new Set(imports.filter((i) => !i.superseded_by).map((i) => i.id))
    return lines.filter((l) => oficiais.has(l.import_id))
  }, [lines, imports])

  // Nomes da máquina ainda sem produto do estoque — agrupados, com o total
  // vendido pra dar noção de urgência.
  const unmapped = useMemo(() => {
    const byKey = new Map<string, { name: string; qty: number; total: number }>()
    for (const l of activeLines) {
      if (l.product_id) continue
      const key = normalizePosName(l.pos_name)
      const entry = byKey.get(key) ?? { name: l.pos_name, qty: 0, total: 0 }
      entry.qty += l.quantity
      entry.total += l.total_gross ?? 0
      byKey.set(key, entry)
    }
    return Array.from(byKey.entries()).sort((a, b) => b[1].total - a[1].total)
  }, [activeLines])

  // Sugerir vínculos: melhor produto por nome (régua 60%), un/venda inferido
  // de "5 Und" no nome. Não pisa em escolha manual já feita.
  function suggestLinks() {
    const nextP = { ...mapProduct }
    const nextU = { ...mapUnits }
    const scores: Record<string, number> = {}
    for (const [key, u] of unmapped) {
      if (nextP[key]) continue
      const hit = bestProductFor(u.name, products)
      if (!hit) continue
      nextP[key] = hit.product.id
      scores[key] = hit.score
      const um = u.name.match(/(\d+)\s*und?\b/i)
      if (um && (nextU[key] ?? '1') === '1') nextU[key] = um[1]
    }
    setMapProduct(nextP)
    setMapUnits(nextU)
    setSuggested(scores)
    if (Object.keys(scores).length === 0) setInfo('Nenhuma sugestão confiável — vincule na mão os que faltam.')
  }

  // Aplica todas as sugestões revisadas de uma vez (sequencial: cada vínculo
  // grava o alias e re-sincroniza o Vendido).
  async function applyAllSuggestions() {
    setApplyingAll(true)
    setError(null)
    try {
      for (const [key, u] of unmapped) {
        if (suggested[key] == null) continue
        const productId = mapProduct[key]
        if (!productId) continue
        const units = Number((mapUnits[key] ?? '1').replace(',', '.')) || 1
        await mapPosNameToProduct(eventId, u.name, productId, units)
      }
      setSuggested({})
      await load()
      onSynced?.()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível aplicar as sugestões.')
    } finally {
      setApplyingAll(false)
    }
  }

  async function handleMap(key: string, originalName: string) {
    const productId = mapProduct[key]
    const units = Number((mapUnits[key] ?? '1').replace(',', '.'))
    if (!productId || !(units > 0)) return
    setMappingKey(key)
    try {
      await mapPosNameToProduct(eventId, originalName, productId, units)
      // Sai da lista de sugestões pendentes — o contador do "Vincular todas"
      // fica honesto.
      setSuggested((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      await load()
      onSynced?.()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível vincular.')
    } finally {
      setMappingKey(null)
    }
  }

  // Dinheiro sempre pela coluna SEM taxa de serviço (uploads antigos, de
  // antes da coluna, caem no total cheio — resubir o relatório corrige).
  const lineValue = (l: EventSalesLine) => l.total_net ?? l.total_gross ?? 0
  // ---------- Integração Dex: o relatório vem DIRETO da API, sem CSV ----------
  // O Bearer que o usuário cola fica SÓ neste navegador (sessionStorage da
  // aba — morre ao fechar) e viaja pela edge function dex-proxy, que não
  // grava nem loga o token. Ninguém além do navegador dele vê a credencial.
  const [dexToken, setDexToken] = useState(sessionStorage.getItem('beetz-dex-token') ?? '')
  const [dexCompany, setDexCompany] = useState(sessionStorage.getItem('beetz-dex-company') ?? '')
  const [dexTokenDraft, setDexTokenDraft] = useState('')
  const [dexCompanyDraft, setDexCompanyDraft] = useState('')
  const [dexOpen, setDexOpen] = useState(false)
  const [dexEvents, setDexEvents] = useState<DexEventOption[]>([])
  const [dexEventId, setDexEventId] = useState('')
  const [dexBusy, setDexBusy] = useState(false)
  const dexConectada = !!(dexToken.trim() && dexCompany.trim())

  // Com a Dex conectada, ao abrir o evento já buscamos os eventos de lá e
  // CASAMOS pelo nome com o evento da Colmeia (normalizado, contenção nos
  // dois sentidos). Sem lista (endpoint indisponível), o campo manual assume.
  useEffect(() => {
    if (!dexConectada) return
    let vivo = true
    ;(async () => {
      try {
        const [evs, evento] = await Promise.all([dexListEvents(dexToken, dexCompany), getEventById(eventId)])
        if (!vivo) return
        setDexEvents(evs)
        if (evs.length > 0 && evento?.name) {
          const alvo = normMatch(evento.name)
          const casado = evs.find((e) => {
            const n = normMatch(e.name)
            return !!n && !!alvo && (n === alvo || n.includes(alvo) || alvo.includes(n))
          })
          if (casado) setDexEventId((cur) => cur || casado.id)
        }
      } catch { /* sem lista: o campo manual de eventId assume */ }
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dexConectada, eventId])

  function conectarDex() {
    const t = dexTokenDraft.trim()
    const c = dexCompanyDraft.trim()
    if (!t || !c) return
    sessionStorage.setItem('beetz-dex-token', t)
    sessionStorage.setItem('beetz-dex-company', c)
    setDexToken(t); setDexCompany(c)
    setDexTokenDraft(''); setDexCompanyDraft(''); setDexOpen(false)
  }

  function esquecerDex() {
    sessionStorage.removeItem('beetz-dex-token')
    sessionStorage.removeItem('beetz-dex-company')
    setDexToken(''); setDexCompany(''); setDexEvents([]); setDexEventId('')
  }

  async function importarDaDex() {
    if (!dexConectada || !dexEventId.trim()) return
    setDexBusy(true)
    setError(null)
    try {
      const rows = await dexProductsReport(dexToken, dexCompany, dexEventId.trim())
      if (rows.length === 0) throw new Error('A Dex devolveu zero produtos pra esse evento — confere o evento escolhido.')
      // Mesmo trilho do CSV: "value" = faturado SEM a taxa (a coluna certa)
      // e "commission" é a taxa separada — gross = value + commission.
      const parsed: ParsedSalesLine[] = rows
        .map((r) => ({
          pos_name: (r.productName ?? '').trim(),
          category: r.categoryName?.trim() || null,
          unit_value: r.price ?? null,
          qty_billed: r.count ?? 0,
          qty_bonus: r.bonusCount ?? 0,
          quantity: (r.count ?? 0) + (r.bonusCount ?? 0),
          total_gross: Math.round(((r.value ?? 0) + (r.commission ?? 0)) * 100) / 100,
          total_net: r.value ?? 0
        }))
        .filter((l) => l.pos_name)
      const d = new Date()
      const hojeLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const nomeDex = dexEvents.find((e) => e.id === dexEventId)?.name
      const imp = await createEventSalesImport(
        eventId,
        { report_date: hojeLocal, file_name: `Dex API${nomeDex ? ` — ${nomeDex}` : ''}` },
        parsed, userId, kind
      )
      const imps = await listEventSalesImports(eventId)
      const cobertos = imps.filter((i) => i.superseded_by === imp.id).length
      setInfo(cobertos > 0
        ? `Importado da Dex e virou o oficial: cobre e substitui ${cobertos} anterior${cobertos > 1 ? 'es' : ''}.`
        : `Importado da Dex: ${parsed.length} produto${parsed.length > 1 ? 's' : ''}.`)
      await load()
      onSynced?.()
    } catch (e: any) {
      setError(e?.message ?? 'Não deu pra importar da Dex.')
    } finally {
      setDexBusy(false)
    }
  }

  const totalFaturado = useMemo(() => activeLines.reduce((s, l) => s + lineValue(l), 0), [activeLines])
  const unmappedFaturado = useMemo(
    () => activeLines.filter((l) => !l.product_id).reduce((s, l) => s + lineValue(l), 0),
    [activeLines]
  )

  return (
    <div className="bg-beetz-dark text-white rounded-2xl p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-beetz-yellow flex items-center gap-1.5 mb-1">
        <BarChart3 size={13} /> {kind === 'producao' ? 'Produção da máquina (PDV)' : 'Vendas da máquina (PDV)'}
      </p>
      <p className="text-xs text-white/50 mb-3">
        {kind === 'producao' ? (
          <>Suba o relatório de Produção e o <span className="font-semibold text-white/80">Consumo da produção</span> atualiza
          sozinho, pelos valores da máquina — é o que desconta do produtor no fechamento. Upload mais novo que cubra um
          antigo vira o <span className="font-semibold text-white/80">oficial</span>, nada duplica.</>
        ) : (
          <>Suba o relatório do dia e o <span className="font-semibold text-white/80">Vendido</span> atualiza sozinho.
          Upload mais novo que cubra um antigo (mesmo relatório, mais vendas) vira o
          <span className="font-semibold text-white/80"> oficial</span> — o antigo sai da conta, nada duplica.</>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="flex items-center gap-1.5 text-sm font-bold honey-gradient text-beetz-dark px-3.5 py-2 rounded-xl disabled:opacity-60"
        >
          <Upload size={15} /> {importing ? 'Importando...' : (kind === 'producao' ? 'Subir relatório de Produção' : 'Subir relatório do dia')}
        </button>
        {totalFaturado > 0 && (
          <span className="text-sm font-bold ml-auto">{currency(totalFaturado)} <span className="font-medium text-white/40 text-xs">faturados</span></span>
        )}
      </div>

      {/* ---- 🔌 Integração Dex: importa direto da API, sem baixar CSV ---- */}
      <div className="mt-3 border border-white/10 rounded-xl p-3">
        {!dexConectada && !dexOpen && (
          <button onClick={() => setDexOpen(true)} className="text-sm font-bold text-beetz-yellow hover:underline">
            🔌 Conectar com a Dex — importar direto, sem CSV
          </button>
        )}

        {!dexConectada && dexOpen && (
          <div className="space-y-2">
            <p className="text-xs text-white/50">
              Cole o <strong className="text-white/80">Bearer token</strong> e o <strong className="text-white/80">Company ID</strong> (o
              código da empresa na URL do painel da Dex). Ficam <strong className="text-white/80">só neste navegador</strong>, até
              fechar a aba — nada vai pro banco.
            </p>
            <input
              type="password" autoComplete="off" placeholder="Bearer token da Dex"
              className="w-full rounded-xl border-0 bg-white/10 text-white placeholder-white/40 text-sm px-3 py-2"
              value={dexTokenDraft} onChange={(e) => setDexTokenDraft(e.target.value)}
            />
            <input
              placeholder="Company ID (ex: 6a6f8a72...)" autoComplete="off"
              className="w-full rounded-xl border-0 bg-white/10 text-white placeholder-white/40 text-sm px-3 py-2"
              value={dexCompanyDraft} onChange={(e) => setDexCompanyDraft(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={conectarDex}
                disabled={!dexTokenDraft.trim() || !dexCompanyDraft.trim()}
                className="text-sm font-bold honey-gradient text-beetz-dark px-3.5 py-2 rounded-xl disabled:opacity-50"
              >
                Conectar
              </button>
              <button onClick={() => setDexOpen(false)} className="text-xs font-semibold text-white/50 hover:text-white px-2">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {dexConectada && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-bold text-beetz-yellow">🔌 Dex conectada</span>
              <span className="text-white/40">token só neste navegador</span>
              <button onClick={esquecerDex} className="text-white/50 hover:text-white underline">esquecer token</button>
            </div>
            {dexEvents.length > 0 ? (
              <select
                value={dexEventId}
                onChange={(e) => setDexEventId(e.target.value)}
                className="w-full rounded-xl border-0 bg-white/10 text-white text-sm px-3 py-2"
              >
                <option value="" className="text-beetz-dark">Escolher o evento na Dex...</option>
                {dexEvents.map((e) => <option key={e.id} value={e.id} className="text-beetz-dark">{e.name}</option>)}
              </select>
            ) : (
              <input
                placeholder="Event ID da Dex (copie da URL do painel deles)"
                className="w-full rounded-xl border-0 bg-white/10 text-white placeholder-white/40 text-sm px-3 py-2"
                value={dexEventId} onChange={(e) => setDexEventId(e.target.value)}
              />
            )}
            <button
              onClick={importarDaDex}
              disabled={dexBusy || !dexEventId.trim()}
              className="flex items-center gap-1.5 text-sm font-bold honey-gradient text-beetz-dark px-3.5 py-2 rounded-xl disabled:opacity-60"
            >
              <Upload size={15} /> {dexBusy ? 'Buscando na Dex...' : (kind === 'producao' ? 'Importar Produção da Dex' : 'Importar vendas da Dex')}
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-300 bg-red-500/20 border border-red-400/30 rounded-xl px-3 py-2 mt-3">{error}</p>}
      {info && <p className="text-sm text-beetz-yellow bg-beetz-yellow/10 border border-beetz-yellow/30 rounded-xl px-3 py-2 mt-3">{info}</p>}

      {imports.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {/* Substituído fica visível mas apagado: dá pra ver o histórico e
              excluir; se o oficial for excluído, ele volta pra conta sozinho. */}
          {imports.map((imp) => (
            <span
              key={imp.id}
              className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-full ${
                imp.superseded_by ? 'bg-white/5 text-white/35' : 'bg-white/10'
              }`}
              title={imp.superseded_by ? 'Substituído por um upload mais completo — fora da conta' : undefined}
            >
              {imp.report_date ? new Date(imp.report_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
              {imp.total_gross != null ? ` · ${currency(imp.total_gross)}` : ''}
              {imp.superseded_by ? ' · substituído' : ''}
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
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <p className="text-xs font-bold text-beetz-yellow flex items-center gap-1.5 flex-1 min-w-[180px]">
              <Link2 size={12} /> {unmapped.length} nome(s) da máquina sem produto
              {unmappedFaturado > 0 ? ` · ${currency(unmappedFaturado)} fora da conta` : ''}
            </p>
            <button
              onClick={suggestLinks}
              className="flex items-center gap-1 text-[11px] font-bold bg-white/15 text-white px-2.5 py-1.5 rounded-lg hover:bg-white/25"
            >
              <Sparkles size={12} /> Sugerir vínculos
            </button>
            {Object.keys(suggested).length > 0 && (
              <button
                onClick={applyAllSuggestions}
                disabled={applyingAll}
                className="flex items-center gap-1 text-[11px] font-bold honey-gradient text-beetz-dark px-2.5 py-1.5 rounded-lg disabled:opacity-60"
              >
                {applyingAll ? 'Vinculando...' : `Vincular todas (${Object.keys(suggested).length})`}
              </button>
            )}
          </div>
          <p className="text-[11px] text-white/50 mb-2">
            Vincule uma vez e fica gravado. "Un/venda" = unidades de estoque por venda (lata = 1 · dose de garrafa de 12 = 0,08).
            A sugestão preenche, você confere — nada é gravado sem o Vincular.
          </p>
          <div className="space-y-1.5">
            {unmapped.map(([key, u]) => (
              <div key={key} className="flex flex-wrap items-center gap-2 bg-white rounded-xl px-3 py-2 text-beetz-dark">
                <div className="flex-1 min-w-[140px]">
                  <p className="text-sm font-semibold truncate">{u.name}</p>
                  <p className="text-[11px] text-beetz-dark/45">
                    {u.qty} venda(s) · {currency(u.total)}
                    {suggested[key] != null && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                        <Sparkles size={9} /> sugestão {Math.round(suggested[key] * 100)}%
                      </span>
                    )}
                  </p>
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

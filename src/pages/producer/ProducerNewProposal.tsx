import { useEffect, useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { useProducerAuth } from '../../contexts/ProducerAuthContext'
import {
  createEventAsProducer, createEventModality, createEventStaffingRequirement,
  getAppSettings, listServiceModalities, requestContractSignature
} from '../../lib/dataService'
import { supabase } from '../../lib/supabaseClient'
import type { AppSettings, ServiceModality } from '../../lib/types'

// Proposta do produtor — formulário ENXUTO em 3 passos:
//   1. O evento (só o essencial; o flyer preenche por OCR)
//   2. Serviços (vitrine com preço; cada serviço abre só as SUAS perguntas)
//   3. Condições & envio (todas as condições comerciais às claras + assinar)
// As condições (sociedade 60/40, cláusula de meta, taxas e aluguéis) ficam
// SEMPRE visíveis num quadro fixo — nada de surpresa na hora de assinar.

const STEPS = ['O evento', 'Serviços', 'Condições e envio']
const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const ROTULO = 'text-sm font-semibold block mb-1.5'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ---- Leitor de flyer (tesseract.js via CDN, mesmo do comprovante) ----
async function loadTesseract(): Promise<any> {
  const w = window as any
  if (w.Tesseract) return w.Tesseract
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Não deu pra carregar o leitor de imagem.'))
    document.head.appendChild(s)
  })
  return (window as any).Tesseract
}

async function encolherFlyer(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const escala = Math.min(1, 1100 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * escala)
  c.height = Math.round(bmp.height * escala)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
}

function dataFlyerParaISO(dd: number, mm: number, yy?: number): string | null {
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null
  const hoje = new Date()
  let ano = yy ? (yy < 100 ? 2000 + yy : yy) : hoje.getFullYear()
  if (!yy) {
    const tentativa = new Date(ano, mm - 1, dd)
    if (tentativa.getTime() < hoje.getTime() - 30 * 86400000) ano++
  }
  return `${ano}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

interface FlyerExtraido { name?: string; eventDate?: string; city?: string; location?: string }

function extrairDoFlyer(texto: string): FlyerExtraido {
  const out: FlyerExtraido = {}
  const linhas = texto.split('\n').map((l) => l.trim()).filter((l) => l.length > 1)
  const plano = texto.toLowerCase()
  const dNum = texto.match(/(\d{1,2})[\/\.](\d{1,2})(?:[\/\.](\d{2,4}))?/)
  const dExt = plano.match(/(\d{1,2})\s*(?:de\s+)?(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/)
  if (dNum) {
    const iso = dataFlyerParaISO(Number(dNum[1]), Number(dNum[2]), dNum[3] ? Number(dNum[3]) : undefined)
    if (iso) out.eventDate = iso
  } else if (dExt) {
    const chave = dExt[2].normalize('NFD').replace(/[̀-ͯ]/g, '')
    const iso = dataFlyerParaISO(Number(dExt[1]), MESES[chave] ?? 0)
    if (iso) out.eventDate = iso
  }
  const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
  for (const l of linhas) {
    const m = l.match(/^(.{3,40})\s*[-–\/]\s*([A-Z]{2})\s*$/)
    if (m && UFS.includes(m[2])) { out.city = m[1].trim(); break }
  }
  const vetadas = /ingresso|open\s*bar|lote|vip|presen[cç]a|atra[cç][aã]o|www\.|@|https?:|r\$|\d{1,2}[\/\.]\d{1,2}/i
  let melhor = ''
  let melhorScore = 0
  for (const l of linhas.slice(0, 12)) {
    if (l.length < 4 || l.length > 48 || vetadas.test(l)) continue
    const letras = l.replace(/[^A-Za-zÀ-ú]/g, '')
    if (letras.length < 4) continue
    const upper = letras.replace(/[^A-ZÀ-Ú]/g, '').length / letras.length
    const score = upper * Math.min(l.length, 30)
    if (score > melhorScore) { melhorScore = score; melhor = l }
  }
  if (melhor) out.name = melhor.replace(/\s{2,}/g, ' ').trim()
  return out
}

const ehMaquina = (m: ServiceModality) => /m[áa]quin|totem|autoatend|cart[ãa]o/i.test(m.name)
const FUNCOES_COMUNS = ['Garçom', 'Caixa', 'Barman', 'Líder de bar', 'Segurança']
const PRODUTOS_TIPOS = ['Cerveja', 'Drinks', 'Destilados', 'Energético', 'Refrigerante & Água', 'Vinho/Espumante']

interface StaffRow { role_label: string; quantity: number }

// Par Sim/Não compacto.
function SimNao({ valor, onPick }: { valor: boolean | null; onPick: (v: boolean) => void }) {
  return (
    <div className="flex gap-2">
      {[{ v: false, r: 'Não' }, { v: true, r: 'Sim' }].map(({ v, r }) => (
        <button
          type="button" key={r} onClick={() => onPick(v)}
          className={`text-sm font-semibold px-5 py-2 rounded-xl border transition-colors ${
            valor === v ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark' : 'border-beetz-dark/15 text-beetz-dark/60 hover:bg-beetz-gray'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

function Stepper({ valor, onChange, min = 0 }: { valor: number; onChange: (n: number) => void; min?: number }) {
  return (
    <div className="flex items-center gap-1 bg-white border border-beetz-dark/15 rounded-xl p-1">
      <button type="button" onClick={() => onChange(Math.max(min, valor - 1))} className="w-9 h-9 rounded-lg font-extrabold text-lg text-beetz-dark/60 hover:bg-beetz-gray">−</button>
      <span className="w-10 text-center font-extrabold text-sm">{valor}</span>
      <button type="button" onClick={() => onChange(valor + 1)} className="w-9 h-9 rounded-lg font-extrabold text-lg text-beetz-dark/60 hover:bg-beetz-gray">+</button>
    </div>
  )
}

export default function ProducerNewProposal() {
  const { producerId } = useProducerAuth()
  const [step, setStep] = useState(0)
  const [erro, setErro] = useState<string | null>(null)

  // Config da casa
  const [modalities, setModalities] = useState<ServiceModality[]>([])
  const [cfg, setCfg] = useState<AppSettings | null>(null)
  const [propostasAbertas, setPropostasAbertas] = useState(true)
  const mf = cfg?.machine_fees ?? null
  const percentProdutor = Number(cfg?.proposal_producer_percent ?? 40)
  const goalTh = Number(cfg?.proposal_goal_threshold ?? 70)
  const goalPen = Number(cfg?.proposal_goal_penalty ?? 10)

  useEffect(() => {
    Promise.all([listServiceModalities().catch(() => [] as ServiceModality[]), getAppSettings().catch(() => null)])
      .then(([mods, c]) => {
        setModalities(mods)
        setCfg(c)
        setPropostasAbertas(c?.proposals_open ?? true)
      })
  }, [])

  // Passo 1 — o evento (só o essencial)
  const [flyerData, setFlyerData] = useState<string | null>(null)
  const [flyerBusy, setFlyerBusy] = useState(false)
  const [flyerInfo, setFlyerInfo] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location, setLocation] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')

  // Passo 2 — serviços e suas perguntas
  const [escolhidas, setEscolhidas] = useState<string[]>([])
  const [qts, setQts] = useState<Record<string, number>>({})
  const [totensQtd, setTotensQtd] = useState(0)
  const [cupom, setCupom] = useState('')
  const [cupomAplicado, setCupomAplicado] = useState(false)
  const [cupomMsg, setCupomMsg] = useState<string | null>(null)
  const [tiposProdutos, setTiposProdutos] = useState<string[]>([])
  const [produtosOutros, setProdutosOutros] = useState('')
  const [hasOtherBars, setHasOtherBars] = useState<boolean | null>(null)
  const [otherBarsNotes, setOtherBarsNotes] = useState('')
  const [staffRows, setStaffRows] = useState<StaffRow[]>([])
  const [novaFuncao, setNovaFuncao] = useState('')
  const [minSalesTarget, setMinSalesTarget] = useState(0)
  const [hasOtherPartners, setHasOtherPartners] = useState<boolean | null>(null)
  const [partnersNotes, setPartnersNotes] = useState('')
  const [hasOfficialBeer, setHasOfficialBeer] = useState<boolean | null>(null)
  const [officialBeerBrand, setOfficialBeerBrand] = useState('')

  // Envio
  const [submitting, setSubmitting] = useState(false)
  const [signUrl, setSignUrl] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const temOperacao = escolhidas.some((id) => modalities.find((m) => m.id === id)?.price_type === 'percent')
  const temMaquinas = escolhidas.some((id) => { const m = modalities.find((x) => x.id === id); return m ? ehMaquina(m) : false })
  const fixasEscolhidas = escolhidas
    .map((id) => modalities.find((m) => m.id === id))
    .filter((m): m is ServiceModality => !!m && m.price_type !== 'percent')
  const totalFixo = fixasEscolhidas.reduce((s, m) => s + (m.default_price != null ? (qts[m.id] ?? 1) * m.default_price : 0), 0)
  const feesAtivas = mf ? (cupomAplicado ? mf.coupon : mf.standard) : null

  async function handleFlyer(file: File) {
    setFlyerBusy(true)
    setFlyerInfo(null)
    try {
      const dataUrl = await encolherFlyer(file)
      setFlyerData(dataUrl)
      const T = await loadTesseract()
      const result = await T.recognize(dataUrl, 'por', {})
      const ex = extrairDoFlyer(String(result?.data?.text ?? ''))
      let n = 0
      if (ex.name && !name.trim()) { setName(ex.name); n++ }
      if (ex.eventDate && !eventDate) { setEventDate(ex.eventDate); n++ }
      if (ex.city && !city.trim()) { setCity(ex.city); n++ }
      if (ex.location && !location.trim()) { setLocation(ex.location); n++ }
      setFlyerInfo(n > 0 ? `✨ Li o flyer e preenchi ${n} campo${n > 1 ? 's' : ''} — confere abaixo.` : 'Flyer anexado — ele vai junto na proposta.')
    } catch {
      setFlyerInfo('Flyer anexado — ele vai junto na proposta.')
    } finally {
      setFlyerBusy(false)
    }
  }

  function aplicarCupom() {
    const codigo = cupom.trim().toUpperCase()
    if (!codigo) { setCupomAplicado(false); setCupomMsg(null); return }
    if (mf && mf.coupon_code && codigo === mf.coupon_code.toUpperCase()) {
      setCupomAplicado(true)
      setCupomMsg(`🎉 Cupom aplicado — taxas com desconto (veja nas condições).`)
    } else {
      setCupomAplicado(false)
      setCupomMsg('Cupom não confere — as taxas seguem as padrão.')
    }
  }

  function addFuncao(rotulo?: string) {
    const r = (rotulo ?? novaFuncao).trim()
    if (!r) return
    setStaffRows((prev) => {
      const ex = prev.find((x) => x.role_label.toLowerCase() === r.toLowerCase())
      if (ex) return prev.map((x) => (x === ex ? { ...x, quantity: x.quantity + 1 } : x))
      return [...prev, { role_label: r, quantity: 1 }]
    })
    setNovaFuncao('')
  }

  function validar(): string | null {
    if (step === 0) {
      if (!name.trim() || !eventDate || !location.trim() || !city.trim()) return 'Preencha nome, data, local e cidade.'
    }
    if (step === 1) {
      if (escolhidas.length === 0) return 'Escolha ao menos um serviço.'
      if (temOperacao) {
        if (tiposProdutos.length === 0 && !produtosOutros.trim()) return 'Operação de bar: marque os produtos desejados.'
        if (hasOtherBars === null) return 'Operação de bar: responda se há outras operações no evento.'
        if (hasOtherBars && !otherBarsNotes.trim()) return 'Conte quais outras operações.'
        if (staffRows.length === 0) return 'Operação de bar: adicione as funções da equipe.'
        if (!minSalesTarget || minSalesTarget <= 0) return 'Operação de bar: informe a meta de vendas.'
        if (hasOtherPartners === null) return 'Responda se há outros parceiros de bebida.'
        if (hasOtherPartners && !partnersNotes.trim()) return 'Conte quais parceiros.'
        if (hasOfficialBeer === null) return 'Responda se há cerveja oficial.'
        if (hasOfficialBeer && !officialBeerBrand.trim()) return 'Informe a marca da cerveja oficial.'
      }
    }
    return null
  }

  function avancar() {
    const e = validar()
    if (e) { setErro(e); return }
    setErro(null)
    setStep((s) => Math.min(2, s + 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function voltar() {
    setErro(null)
    setStep((s) => Math.max(0, s - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function enviar() {
    if (!producerId) return
    setSubmitting(true)
    setErro(null)
    try {
      let flyerUrl: string | null = null
      if (flyerData) {
        try {
          const blob = await (await fetch(flyerData)).blob()
          const path = `${producerId}/flyer-${Date.now()}.jpg`
          const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
          if (!upErr) flyerUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
        } catch { /* segue sem flyer */ }
      }

      const feesAplicadas = temMaquinas && mf
        ? { mode: cupomAplicado ? 'coupon' : 'standard', fees: cupomAplicado ? mf.coupon : mf.standard, machine_rent: mf.machine_rent, totem_rent: mf.totem_rent, coupon: cupomAplicado ? mf.coupon_code : null }
        : null
      const produtosTexto = [...tiposProdutos, produtosOutros.trim()].filter(Boolean).join(', ')

      const event = await createEventAsProducer(producerId, {
        name, event_date: eventDate, location, city, status: 'Planejado', leader_id: null,
        address: address.trim() || null, flyer_url: flyerUrl,
        sales_amount: 0,
        commission_percentage: temOperacao ? percentProdutor : 0,
        min_sales_target: temOperacao ? minSalesTarget || null : null,
        has_other_beverage_partners: temOperacao ? hasOtherPartners : null,
        beverage_partners_notes: temOperacao && hasOtherPartners ? partnersNotes.trim() || null : null,
        has_official_beer: temOperacao ? hasOfficialBeer : null,
        official_beer_brand: temOperacao && hasOfficialBeer ? officialBeerBrand.trim() || null : null,
        proposal_fees: feesAplicadas,
        proposal_products: temOperacao ? produtosTexto || null : null,
        proposal_totems: temMaquinas ? totensQtd : null,
        proposal_coupon: cupomAplicado && mf ? mf.coupon_code : null,
        has_other_bar_operations: temOperacao ? hasOtherBars : null,
        other_bar_operations_notes: temOperacao && hasOtherBars ? otherBarsNotes.trim() || null : null,
        goal_threshold_percent: temOperacao ? goalTh : null,
        goal_penalty_percent: temOperacao ? goalPen : null
      })

      // Daqui pra baixo a proposta JÁ EXISTE: qualquer tropeço não pode
      // derrubar o envio (senão um "tentar de novo" duplicaria o evento).
      try {
        for (const id of escolhidas) {
          const m = modalities.find((x) => x.id === id)
          if (!m) continue
          await createEventModality({
            event_id: event.id, modality_id: id,
            quantity: m.price_type === 'percent' ? 1 : (qts[id] ?? 1),
            unit_price: m.default_price ?? 0, notes: null
          })
        }
        for (const row of staffRows) {
          await createEventStaffingRequirement({
            event_id: event.id, role_id: null, role_label: row.role_label, quantity: row.quantity,
            unit_cost: null, notes: null
          })
        }
        const result = await requestContractSignature(event.id)
        setSignUrl(result.sign_url)
      } catch { /* assinatura chega por e-mail; a Beetz completa o resto */ }
      setDone(true)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar. Nada foi perdido — tente de novo.')
    } finally {
      setSubmitting(false)
    }
  }

  // ---- O quadro de CONDIÇÕES — sempre às claras, atualiza com as escolhas ----
  const condicoes: string[] = []
  if (temOperacao) {
    condicoes.push(`Sociedade na operação de bar: ${100 - percentProdutor}% Beetz / ${percentProdutor}% produtor, sobre as vendas.`)
    condicoes.push(minSalesTarget > 0
      ? `Meta de vendas: ${currency(minSalesTarget)}. Abaixo de ${goalTh}% dela (${currency(minSalesTarget * goalTh / 100)}), o repasse do produtor cai ${goalPen} pontos (${percentProdutor}% → ${Math.max(0, percentProdutor - goalPen)}%).`
      : `Cláusula de meta: o evento deve atingir ao menos ${goalTh}% da meta declarada — abaixo disso o repasse cai ${goalPen} pontos.`)
  }
  if (temMaquinas && mf && feesAtivas) {
    condicoes.push(`Taxas${cupomAplicado ? ` (cupom ${mf.coupon_code})` : ' padrão'}: ${feesAtivas.debit_pix}% débito/pix · ${feesAtivas.credit}% crédito · ${feesAtivas.cash}% dinheiro · ${feesAtivas.management}% gestão.`)
    // Máquina é cobrada pelo preço do catálogo (R$/máquina, já no total) —
    // só o totem tem aluguel mensal como condição à parte.
    if (totensQtd > 0) condicoes.push(`Aluguel mensal do totem: ${currency(mf.totem_rent)} cada.`)
  }
  if (fixasEscolhidas.some((m) => m.default_price == null)) {
    condicoes.push('Itens "sob consulta" têm o valor confirmado pela Beetz na aprovação.')
  }

  if (!propostasAbertas) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center space-y-3">
        <p className="text-4xl">⏸️</p>
        <h1 className="text-xl font-extrabold">Propostas pausadas</h1>
        <p className="text-sm text-beetz-dark/60">A Beetz não está recebendo novas propostas neste momento.</p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto"><Check size={28} /></div>
        <h1 className="text-xl font-extrabold">Proposta enviada!</h1>
        {signUrl ? (
          <>
            <p className="text-sm text-beetz-dark/60">Falta só a assinatura — seu e-mail já foi validado pelo login.</p>
            <a href={signUrl} target="_blank" rel="noreferrer" className="inline-block honey-gradient text-beetz-dark font-bold px-6 py-3 rounded-xl">
              🖊️ Assinar a proposta
            </a>
          </>
        ) : (
          <p className="text-sm text-beetz-dark/60">O link de assinatura chega no seu e-mail em instantes.</p>
        )}
        <p className="text-xs text-beetz-dark/45">A Beetz analisa e responde por aqui e por e-mail.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Nova proposta</h1>
        <div className="flex items-center gap-2 mt-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${i === step ? 'bg-beetz-dark text-white' : i < step ? 'bg-beetz-yellow text-beetz-dark' : 'bg-beetz-gray text-beetz-dark/40'}`}>
                {i + 1}. {s}
              </span>
              {i < STEPS.length - 1 && <span className="text-beetz-dark/20">—</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-soft border border-beetz-dark/5 p-5 md:p-7 space-y-5">
        {/* ============ PASSO 1 — O EVENTO (só o essencial) ============ */}
        {step === 0 && (
          <>
            <label className={`block border-2 border-dashed rounded-2xl p-4 cursor-pointer transition-colors ${
              flyerData ? 'border-beetz-yellow bg-beetz-yellow/10' : 'border-beetz-dark/15 hover:border-beetz-yellow'
            } ${flyerBusy ? 'opacity-70 pointer-events-none' : ''}`}>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFlyer(f) }} />
              <div className="flex items-center gap-3">
                {flyerData
                  ? <img src={flyerData} alt="Flyer" className="w-12 h-16 rounded-lg object-cover border border-beetz-dark/10 shrink-0" />
                  : <span className="text-2xl shrink-0">📸</span>}
                <div className="min-w-0">
                  <p className="font-bold text-sm">{flyerBusy ? 'Lendo o flyer...' : flyerData ? 'Flyer anexado — toque pra trocar' : 'Envie o flyer e os dados entram sozinhos'}</p>
                  {flyerInfo && !flyerBusy && <p className="text-xs text-beetz-dark/55 mt-0.5">{flyerInfo}</p>}
                </div>
              </div>
            </label>

            <div>
              <label className={ROTULO}>Nome do evento *</label>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={ROTULO}>Data *</label>
                <input type="date" className={inputClass} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </div>
              <div>
                <label className={ROTULO}>Cidade *</label>
                <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={ROTULO}>Local/espaço *</label>
              <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div>
              <label className={ROTULO}>Endereço <span className="font-normal text-beetz-dark/40">(opcional)</span></label>
              <input className={inputClass} placeholder="Rua, número, bairro" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </>
        )}

        {/* ============ PASSO 2 — SERVIÇOS (cada um com as suas perguntas) ============ */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-beetz-dark/60">Marque o que você precisa — os preços são os da Beetz.</p>
            {modalities.map((m) => {
              const on = escolhidas.includes(m.id)
              const percent = m.price_type === 'percent'
              const maquina = ehMaquina(m)
              const rotuloPreco = percent
                ? `${100 - percentProdutor}/${percentProdutor}`
                : m.default_price != null ? `${currency(m.default_price)} / ${m.unit_label}` : 'Sob consulta'
              return (
                <div key={m.id} className={`border rounded-2xl transition-colors overflow-hidden ${on ? 'border-beetz-yellow bg-beetz-yellow/10' : 'border-beetz-dark/10 hover:border-beetz-dark/25'}`}>
                  <label className="flex items-start gap-3 cursor-pointer p-4">
                    <input type="checkbox" className="mt-1" checked={on} onChange={() => setEscolhidas((prev) => (on ? prev.filter((x) => x !== m.id) : [...prev, m.id]))} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm">{m.name}</p>
                      {m.description && <p className="text-xs text-beetz-dark/50 mt-0.5">{m.description}</p>}
                    </div>
                    <span className={`shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-full ${m.default_price != null || percent ? 'bg-beetz-yellow/40 text-beetz-dark' : 'bg-beetz-gray text-beetz-dark/50'}`}>
                      {rotuloPreco}
                    </span>
                  </label>

                  {/* Perguntas SÓ do serviço marcado — nada além do necessário. */}
                  {on && !percent && (
                    <div className="px-4 pb-4 pl-11 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <Stepper valor={qts[m.id] ?? 1} onChange={(n) => setQts((prev) => ({ ...prev, [m.id]: Math.max(1, n) }))} min={1} />
                        <span className="text-xs text-beetz-dark/50 font-medium">{m.unit_label}{(qts[m.id] ?? 1) > 1 ? 's' : ''}</span>
                        {m.default_price != null
                          ? <span className="ml-auto text-sm font-extrabold">{currency((qts[m.id] ?? 1) * m.default_price)}</span>
                          : <span className="ml-auto text-xs font-semibold text-beetz-dark/45">valor confirmado na aprovação</span>}
                      </div>
                      {maquina && (
                        <>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-xs font-semibold text-beetz-dark/60 w-28">Totens:</span>
                            <Stepper valor={totensQtd} onChange={setTotensQtd} min={0} />
                            {mf && totensQtd > 0 && <span className="text-xs text-beetz-dark/50">{currency(mf.totem_rent)}/mês por totem</span>}
                          </div>
                          <div className="flex gap-2">
                            <input
                              className={`${inputClass} uppercase`} placeholder="Cupom de desconto (opcional)"
                              autoCapitalize="characters" value={cupom}
                              onChange={(e) => setCupom(e.target.value.toUpperCase())}
                              onBlur={aplicarCupom}
                              onKeyDown={(e) => { if (e.key === 'Enter') aplicarCupom() }}
                            />
                          </div>
                          {cupomMsg && <p className={`text-xs font-semibold ${cupomAplicado ? 'text-green-700' : 'text-amber-700'}`}>{cupomMsg}</p>}
                        </>
                      )}
                    </div>
                  )}

                  {on && percent && (
                    <div className="px-4 pb-4 pl-11 space-y-4">
                      <div>
                        <label className={ROTULO}>Produtos desejados *</label>
                        <div className="flex flex-wrap gap-1.5">
                          {PRODUTOS_TIPOS.map((t) => {
                            const sel = tiposProdutos.includes(t)
                            return (
                              <button key={t} type="button"
                                onClick={() => setTiposProdutos((prev) => (sel ? prev.filter((x) => x !== t) : [...prev, t]))}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${sel ? 'bg-beetz-yellow border-beetz-yellow' : 'bg-white border-beetz-dark/15 text-beetz-dark/60'}`}>
                                {t}
                              </button>
                            )
                          })}
                        </div>
                        <input className={`${inputClass} mt-2`} placeholder="Outros (opcional)" value={produtosOutros} onChange={(e) => setProdutosOutros(e.target.value)} />
                      </div>
                      <div>
                        <label className={ROTULO}>Há outras operações de bar no evento? *</label>
                        <SimNao valor={hasOtherBars} onPick={(v) => { setHasOtherBars(v); if (!v) setOtherBarsNotes('') }} />
                        {hasOtherBars && <input className={`${inputClass} mt-2`} placeholder="Quais?" value={otherBarsNotes} onChange={(e) => setOtherBarsNotes(e.target.value)} />}
                      </div>
                      <div>
                        <label className={ROTULO}>Equipe necessária *</label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {FUNCOES_COMUNS.map((f) => (
                            <button key={f} type="button" onClick={() => addFuncao(f)} className="text-xs font-semibold border border-dashed border-beetz-dark/25 text-beetz-dark/60 px-3 py-1.5 rounded-full hover:bg-beetz-yellow/20">
                              + {f}
                            </button>
                          ))}
                        </div>
                        {staffRows.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {staffRows.map((s) => (
                              <span key={s.role_label} className="flex items-center gap-1.5 text-xs font-bold bg-white border border-beetz-dark/10 px-3 py-1.5 rounded-full">
                                {s.quantity}× {s.role_label}
                                <button type="button" onClick={() => addFuncao(s.role_label)} className="text-beetz-dark/40 hover:text-beetz-dark font-extrabold">+</button>
                                <button type="button" onClick={() => setStaffRows((prev) => prev.filter((x) => x !== s))} className="text-beetz-dark/40 hover:text-red-600"><Trash2 size={12} /></button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input className={inputClass} placeholder="Outra função..." value={novaFuncao} onChange={(e) => setNovaFuncao(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFuncao() } }} />
                          <button type="button" onClick={() => addFuncao()} className="bg-beetz-dark text-white px-4 rounded-xl shrink-0"><Plus size={16} /></button>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <label className={ROTULO}>Meta de vendas (R$) *</label>
                          <input type="number" min={0} step="0.01" inputMode="decimal" className={inputClass} value={minSalesTarget || ''} onChange={(e) => setMinSalesTarget(Number(e.target.value))} />
                        </div>
                        <div>
                          <label className={ROTULO}>Cerveja oficial? *</label>
                          <SimNao valor={hasOfficialBeer} onPick={(v) => { setHasOfficialBeer(v); if (!v) setOfficialBeerBrand('') }} />
                          {hasOfficialBeer && <input className={`${inputClass} mt-2`} placeholder="Qual marca?" value={officialBeerBrand} onChange={(e) => setOfficialBeerBrand(e.target.value)} />}
                        </div>
                      </div>
                      <div>
                        <label className={ROTULO}>Outros parceiros de bebida? *</label>
                        <SimNao valor={hasOtherPartners} onPick={(v) => { setHasOtherPartners(v); if (!v) setPartnersNotes('') }} />
                        {hasOtherPartners && <input className={`${inputClass} mt-2`} placeholder="Quais?" value={partnersNotes} onChange={(e) => setPartnersNotes(e.target.value)} />}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ============ PASSO 3 — CONDIÇÕES ÀS CLARAS + ENVIO ============ */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <p className="font-extrabold">{name}</p>
              <p className="text-sm text-beetz-dark/55">
                {eventDate ? new Date(eventDate + 'T12:00:00').toLocaleDateString('pt-BR') : ''} · {location} · {city}
              </p>
            </div>

            <div className="border border-beetz-dark/8 rounded-2xl divide-y divide-beetz-dark/5">
              {escolhidas.map((id) => {
                const m = modalities.find((x) => x.id === id)
                if (!m) return null
                const q = qts[id] ?? 1
                return (
                  <div key={id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="font-semibold">{m.name}{m.price_type !== 'percent' ? ` — ${q} ${m.unit_label}${q > 1 ? 's' : ''}` : ''}</span>
                    <span className="font-bold shrink-0">
                      {m.price_type === 'percent' ? `${100 - percentProdutor}/${percentProdutor}` : m.default_price != null ? currency(q * m.default_price) : 'sob consulta'}
                    </span>
                  </div>
                )
              })}
              {temMaquinas && totensQtd > 0 && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="font-semibold">Totem de autoatendimento — {totensQtd}</span>
                  <span className="font-bold shrink-0">{mf ? `${currency(mf.totem_rent)}/mês cada` : ''}</span>
                </div>
              )}
              {totalFixo > 0 && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm bg-beetz-gray/40">
                  <span className="font-bold">Total dos serviços de valor fixo</span>
                  <span className="font-extrabold">{currency(totalFixo)}</span>
                </div>
              )}
            </div>

            {temOperacao && (
              <p className="text-sm text-beetz-dark/60">
                Operação de bar: {[...tiposProdutos, produtosOutros.trim()].filter(Boolean).join(', ')} ·
                equipe {staffRows.map((s) => `${s.quantity}× ${s.role_label}`).join(', ')} ·
                outras operações: {hasOtherBars ? otherBarsNotes : 'não'} ·
                parceiros: {hasOtherPartners ? partnersNotes : 'não'} ·
                cerveja oficial: {hasOfficialBeer ? officialBeerBrand : 'não'}
              </p>
            )}
          </div>
        )}

        {/* ============ CONDIÇÕES DA BEETZ — sempre às claras ============ */}
        {condicoes.length > 0 && step >= 1 && (
          <div className="bg-beetz-dark text-white rounded-2xl p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-beetz-yellow mb-2.5">Condições da Beetz</p>
            <ul className="space-y-1.5">
              {condicoes.map((c, i) => (
                <li key={i} className="text-sm leading-relaxed flex gap-2">
                  <span className="text-beetz-yellow shrink-0">•</span>
                  <span className="text-white/85">{c}</span>
                </li>
              ))}
            </ul>
            {step === 2 && (
              <p className="text-[11px] text-white/50 mt-3 pt-2.5 border-t border-white/10">
                Ao enviar e assinar, você concorda com as condições acima — elas ficam registradas na proposta.
              </p>
            )}
          </div>
        )}

        {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{erro}</p>}

        <div className="flex items-center justify-between pt-2 border-t border-beetz-dark/5">
          <button type="button" onClick={voltar} disabled={step === 0} className="px-4 py-2.5 rounded-xl font-semibold text-sm text-beetz-dark/60 disabled:opacity-0">
            ← Voltar
          </button>
          {step < 2 ? (
            <button type="button" onClick={avancar} className="honey-gradient text-beetz-dark font-bold px-6 py-3 rounded-xl active:scale-[0.99] transition-transform">
              Avançar →
            </button>
          ) : (
            <button type="button" onClick={enviar} disabled={submitting} className="honey-gradient text-beetz-dark font-bold px-6 py-3 rounded-xl disabled:opacity-60 active:scale-[0.99] transition-transform">
              {submitting ? 'Enviando...' : '🖊️ Enviar e assinar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

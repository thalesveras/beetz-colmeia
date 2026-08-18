import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus, Trash2 } from 'lucide-react'
import { useProducerAuth } from '../../contexts/ProducerAuthContext'
import {
  createEventAsProducer, createEventModality, createEventStaffingRequirement,
  getAppSettings, listServiceModalities, requestContractSignature
} from '../../lib/dataService'
import { supabase } from '../../lib/supabaseClient'
import type { ServiceModality } from '../../lib/types'

// ---- Leitor de flyer: sobe a arte e o OCR preenche o formulário ----
// tesseract.js entra por script tag na primeira leitura (mesma engrenagem do
// comprovante inteligente) — nada de chave de API, roda no navegador.
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

// Encolhe o flyer (máx. 1100px, JPEG 85%) — bom pro OCR e leve pro Storage.
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
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
}
const ESTILOS = ['samba', 'pagode', 'pagodão', 'sertanejo', 'forró', 'piseiro', 'arrocha', 'funk', 'eletrônica', 'techno', 'house', 'rock', 'reggae', 'axé', 'mpb', 'rap', 'trap', 'brega', 'piano']
const LOCAL_DICAS = ['espaço', 'arena', 'clube', 'praça', 'camarote', 'convento', 'chácara', 'sítio', 'casa', 'deck', 'estádio', 'quadra', 'iate', 'lounge', 'hall']
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

// Data digitada/impressa vira ISO; sem ano, assume o atual (ou o próximo, se
// já passou faz tempo — flyer é sempre de evento FUTURO).
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

interface FlyerExtraido {
  name?: string; eventDate?: string; startTime?: string
  city?: string; location?: string; musicStyle?: string
}

function extrairDoFlyer(texto: string): FlyerExtraido {
  const out: FlyerExtraido = {}
  const linhas = texto.split('\n').map((l) => l.trim()).filter((l) => l.length > 1)
  const plano = texto.toLowerCase()

  // Data: numérica (26/07[/2026]) ou por extenso (26 de julho)
  const dNum = texto.match(/(\d{1,2})[\/\.](\d{1,2})(?:[\/\.](\d{2,4}))?/)
  const dExt = plano.match(/(\d{1,2})\s*(?:de\s+)?(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/)
  if (dNum) {
    const iso = dataFlyerParaISO(Number(dNum[1]), Number(dNum[2]), dNum[3] ? Number(dNum[3]) : undefined)
    if (iso) out.eventDate = iso
  } else if (dExt) {
    const iso = dataFlyerParaISO(Number(dExt[1]), MESES[dExt[2].normalize('NFD').replace(/[̀-ͯ]/g, '')] ?? MESES[dExt[2]])
    if (iso) out.eventDate = iso
  }

  // Hora de início: "22h", "22:00", "22H30"
  const hora = texto.match(/(?:a partir d[ae]s?|às|as)?\s*(\d{1,2})\s*[hH:]\s*(\d{2})?/)
  if (hora) {
    const h = Number(hora[1])
    if (h >= 0 && h <= 23) out.startTime = `${String(h).padStart(2, '0')}:${hora[2] ?? '00'}`
  }

  // Estilo musical: primeira palavra do dicionário que aparecer
  const estilo = ESTILOS.find((e) => plano.includes(e))
  if (estilo) out.musicStyle = estilo.charAt(0).toUpperCase() + estilo.slice(1)

  // Cidade: linha terminando em " - UF" ou "/UF"
  for (const l of linhas) {
    const m = l.match(/^(.{3,40})\s*[-–\/]\s*([A-Z]{2})\s*$/)
    if (m && UFS.includes(m[2])) { out.city = m[1].trim(); break }
  }

  // Local: linha com palavra típica de espaço de evento
  const localLinha = linhas.find((l) => {
    const low = l.toLowerCase()
    return LOCAL_DICAS.some((d) => low.includes(d)) && l.length <= 60
  })
  if (localLinha) out.location = localLinha.replace(/^[^A-Za-zÀ-ú0-9]+/, '').trim()

  // Nome do evento: a linha mais "gritada" (maiúsculas, tamanho bom), fora
  // datas, preços e chamadas de venda.
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

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const STEPS = ['Resumo do evento', 'Modalidades', 'Faturamento e bebidas', 'Equipe necessária', 'Revisão e assinatura']

// Par de botões Sim/Não do padrão da casa (null = não respondeu ainda).
function SimNao({ valor, onPick }: { valor: boolean | null; onPick: (v: boolean) => void }) {
  return (
    <div className="flex gap-2">
      {[{ v: false, r: 'Não' }, { v: true, r: 'Sim' }].map(({ v, r }) => (
        <button
          type="button" key={r} onClick={() => onPick(v)}
          className={`text-sm font-medium px-5 py-2.5 rounded-xl border transition-colors ${
            valor === v ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark' : 'border-beetz-dark/15 text-beetz-dark/70 hover:bg-beetz-gray'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

interface ModalitySelection { quantity: number; unit_price: number; notes: string }
interface StaffingRow { role_label: string; quantity: number; unit_cost: number }

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ProducerNewProposal() {
  const { producerId } = useProducerAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Passo 1 — resumo do evento
  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location, setLocation] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [musicStyle, setMusicStyle] = useState('')
  const [link, setLink] = useState('')

  // Passo 2 — modalidades
  const [modalities, setModalities] = useState<ServiceModality[]>([])
  const [selected, setSelected] = useState<Record<string, ModalitySelection>>({})

  // Passo 3 — faturamento
  const [salesAmount, setSalesAmount] = useState(0)
  // O percentual do produtor NÃO é negociado no formulário: vem da regra da
  // casa (admin → Propostas; hoje 40%). O produtor vê, não edita.
  const [commissionPercentage, setCommissionPercentage] = useState(40)
  // Perguntas comerciais que a Diretoria precisa antes de aprovar.
  const [minSalesTarget, setMinSalesTarget] = useState(0)
  const [hasOtherPartners, setHasOtherPartners] = useState<boolean | null>(null)
  const [partnersNotes, setPartnersNotes] = useState('')
  const [hasOfficialBeer, setHasOfficialBeer] = useState<boolean | null>(null)
  const [officialBeerBrand, setOfficialBeerBrand] = useState('')

  // Passo 4 — equipe necessária
  const [staffing, setStaffing] = useState<StaffingRow[]>([])
  const [newRole, setNewRole] = useState('')
  const [newQty, setNewQty] = useState(1)
  const [newCost, setNewCost] = useState(0)

  // Passo 5 — envio
  const [submitting, setSubmitting] = useState(false)
  const [signUrl, setSignUrl] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Flyer: sobe a arte, o OCR lê e preenche o que estiver vazio — o produtor
  // só revisa. A imagem vira o flyer oficial do evento no envio.
  const [flyerData, setFlyerData] = useState<string | null>(null)
  const [flyerBusy, setFlyerBusy] = useState(false)
  const [flyerInfo, setFlyerInfo] = useState<string | null>(null)

  async function handleFlyer(file: File) {
    setFlyerBusy(true)
    setFlyerInfo(null)
    try {
      const dataUrl = await encolherFlyer(file)
      setFlyerData(dataUrl)
      const T = await loadTesseract()
      const result = await T.recognize(dataUrl, 'por', {})
      const extraido = extrairDoFlyer(String(result?.data?.text ?? ''))
      // Preenche SÓ o que está vazio — nunca por cima do que foi digitado.
      let n = 0
      if (extraido.name && !name.trim()) { setName(extraido.name); n++ }
      if (extraido.eventDate && !eventDate) { setEventDate(extraido.eventDate); n++ }
      if (extraido.startTime && !startTime) { setStartTime(extraido.startTime); n++ }
      if (extraido.city && !city.trim()) { setCity(extraido.city); n++ }
      if (extraido.location && !location.trim()) { setLocation(extraido.location); n++ }
      if (extraido.musicStyle && !musicStyle.trim()) { setMusicStyle(extraido.musicStyle); n++ }
      setFlyerInfo(n > 0
        ? `✨ Li o flyer e preenchi ${n} campo${n > 1 ? 's' : ''} — confere se acertei e ajusta o que faltar.`
        : 'Flyer anexado! Não consegui ler os dados da arte — preenche os campos que ele vai junto na proposta.')
    } catch {
      setFlyerInfo('Flyer anexado! Não deu pra ler a arte agora — preenche os campos que ele vai junto na proposta.')
    } finally {
      setFlyerBusy(false)
    }
  }

  useEffect(() => { listServiceModalities().then(setModalities) }, [])

  // Interruptor da Diretoria (admin → Propostas): fechado, o formulário avisa
  // e não deixa enviar. Se a leitura falhar, assume aberto — configuração
  // nunca derruba o painel.
  const [propostasAbertas, setPropostasAbertas] = useState(true)
  // Taxas da operação (débito/pix, crédito, gestão) — regra da casa, aceitas
  // junto com a proposta e congeladas no evento (snapshot).
  const [fees, setFees] = useState({ debit_pix: 0, credit: 0, management: 0 })
  useEffect(() => {
    getAppSettings().then((cfg) => {
      setPropostasAbertas(cfg?.proposals_open ?? true)
      // Percentual oficial da casa — o formulário exige este valor.
      if (cfg?.proposal_producer_percent != null) setCommissionPercentage(Number(cfg.proposal_producer_percent))
      setFees({
        debit_pix: Number(cfg?.proposal_fee_debit_pix ?? 0),
        credit: Number(cfg?.proposal_fee_credit ?? 0),
        management: Number(cfg?.proposal_fee_management ?? 0)
      })
    }).catch(() => {})
  }, [])

  const needsStaffing = Object.keys(selected).some((id) => modalities.find((m) => m.id === id)?.requires_staffing)
  const totalModalidades = Object.entries(selected).reduce((sum, [, cfg]) => sum + cfg.quantity * cfg.unit_price, 0)
  // Itens sem preço da casa entram como "sob consulta" — a Beetz confirma o
  // valor na aprovação. O produtor nunca digita preço.
  const itensSobConsulta = Object.keys(selected).filter((id) => (modalities.find((m) => m.id === id)?.default_price ?? null) == null).length

  function toggleModality(m: ServiceModality) {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[m.id]) delete next[m.id]
      // Preço padrão da casa já entra preenchido — o produtor aceita.
      else next[m.id] = { quantity: 1, unit_price: m.default_price ?? 0, notes: '' }
      return next
    })
  }

  function updateModalitySel(id: string, patch: Partial<ModalitySelection>) {
    setSelected((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function addStaffingRow() {
    if (!newRole.trim()) return
    setStaffing((prev) => [...prev, { role_label: newRole.trim(), quantity: newQty, unit_cost: newCost }])
    setNewRole(''); setNewQty(1); setNewCost(0)
  }

  function removeStaffingRow(idx: number) {
    setStaffing((prev) => prev.filter((_, i) => i !== idx))
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (!name.trim() || !eventDate || !location.trim() || !city.trim() || !address.trim()) {
        return 'Preencha nome, data, local, cidade e endereço do evento.'
      }
    }
    if (step === 1) {
      if (Object.keys(selected).length === 0) return 'Escolha ao menos uma modalidade de serviço.'
    }
    if (step === 2) {
      if (!minSalesTarget || minSalesTarget <= 0) return 'Informe o mínimo necessário de vendas do evento.'
      if (hasOtherPartners === null) return 'Responda se vão ter outros parceiros de bebida.'
      if (hasOtherPartners && !partnersNotes.trim()) return 'Conte quais são os outros parceiros de bebida.'
      if (hasOfficialBeer === null) return 'Responda se o evento tem cerveja oficial.'
      if (hasOfficialBeer && !officialBeerBrand.trim()) return 'Informe qual é a cerveja oficial.'
    }
    if (step === 3 && needsStaffing) {
      if (staffing.length === 0) return 'Adicione ao menos uma função de equipe (obrigatório para a(s) modalidade(s) escolhida(s)).'
    }
    return null
  }

  function goNext() {
    const err = validateStep()
    if (err) { setError(err); return }
    setError(null)
    // Pula o passo de equipe se nenhuma modalidade selecionada exigir pessoal.
    if (step === 2 && !needsStaffing) setStep(4)
    else setStep((s) => s + 1)
  }

  function goBack() {
    setError(null)
    if (step === 4 && !needsStaffing) setStep(2)
    else setStep((s) => Math.max(0, s - 1))
  }

  async function handleSubmit() {
    if (!producerId) return
    if (!propostasAbertas) {
      setError('As propostas estão pausadas no momento — fale com a equipe da Beetz.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      // O flyer vira o oficial do evento: sobe pro Storage (pasta do próprio
      // login — a mesma regra dos avatares) e entra como URL. Se o upload
      // falhar, a proposta segue sem flyer — imagem nunca trava o envio.
      let flyerUrl: string | null = null
      if (flyerData) {
        try {
          const blob = await (await fetch(flyerData)).blob()
          const path = `${producerId}/flyer-${Date.now()}.jpg`
          const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
          if (!upErr) {
            const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
            flyerUrl = pub.publicUrl
          }
        } catch { /* segue sem flyer */ }
      }

      const event = await createEventAsProducer(producerId, {
        name, event_date: eventDate, location, city, status: 'Planejado', leader_id: null,
        address, start_time: startTime || null, end_date: endDate || null, end_time: endTime || null,
        music_style: musicStyle || null, link: link || null, flyer_url: flyerUrl,
        sales_amount: salesAmount, commission_percentage: commissionPercentage,
        min_sales_target: minSalesTarget || null,
        has_other_beverage_partners: hasOtherPartners,
        beverage_partners_notes: hasOtherPartners ? partnersNotes.trim() || null : null,
        has_official_beer: hasOfficialBeer,
        official_beer_brand: hasOfficialBeer ? officialBeerBrand.trim() || null : null,
        // Snapshot das taxas aceitas — o combinado de hoje não muda amanhã.
        proposal_fees: fees
      })

      for (const [modalityId, cfg] of Object.entries(selected)) {
        await createEventModality({
          event_id: event.id, modality_id: modalityId, quantity: cfg.quantity,
          unit_price: cfg.unit_price, notes: cfg.notes || null
        })
      }

      for (const row of staffing) {
        await createEventStaffingRequirement({
          event_id: event.id, role_id: null, role_label: row.role_label, quantity: row.quantity,
          unit_cost: row.unit_cost || null, notes: null
        })
      }

      const result = await requestContractSignature(event.id)
      setSignUrl(result.sign_url)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar sua proposta. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto"><Check size={28} /></div>
        <h1 className="text-xl font-extrabold">Proposta enviada!</h1>
        <p className="text-sm text-beetz-dark/60">
          Falta só assinar o contrato pra confirmar tudo. {signUrl ? 'Clique abaixo pra assinar agora.' : ''}
        </p>
        {signUrl && (
          <a href={signUrl} target="_blank" rel="noreferrer" className="honey-gradient text-beetz-dark font-bold px-5 py-3 rounded-xl inline-block">
            Assinar contrato
          </a>
        )}
        <button onClick={() => navigate('/produtor')} className="block mx-auto text-sm text-beetz-dark/50 underline mt-2">
          Ver minhas propostas
        </button>
      </div>
    )
  }

  if (!propostasAbertas) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center space-y-3">
        <p className="text-4xl">⏸️</p>
        <h1 className="text-xl font-extrabold">Propostas pausadas</h1>
        <p className="text-sm text-beetz-dark/60">
          A Beetz não está recebendo novas propostas neste momento. Suas propostas já enviadas continuam valendo — e assim que reabrir, é só voltar aqui.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Nova proposta</h1>
        <p className="text-beetz-dark/60 mt-1">Passo {step + 1} de {STEPS.length}: {STEPS[step]}</p>
        <div className="flex gap-1.5 mt-3">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-beetz-yellow' : 'bg-beetz-dark/10'}`} />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5 space-y-4">
        {step === 0 && (
          <>
            <div>
              {/* Atalho esperto: sobe o flyer e o leitor preenche os campos
                  vazios — o produtor só confere. A arte ainda vira o flyer
                  oficial do evento no envio. */}
              <label className={`block border-2 border-dashed rounded-2xl p-4 mb-4 cursor-pointer transition-colors ${
                flyerData ? 'border-beetz-yellow bg-beetz-yellow/10' : 'border-beetz-dark/15 hover:border-beetz-yellow hover:bg-beetz-yellow/5'
              } ${flyerBusy ? 'opacity-70 pointer-events-none' : ''}`}>
                <input
                  type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFlyer(f) }}
                />
                <div className="flex items-center gap-3">
                  {flyerData ? (
                    <img src={flyerData} alt="Flyer" className="w-14 h-[4.5rem] rounded-lg object-cover border border-beetz-dark/10 shrink-0" />
                  ) : (
                    <span className="text-2xl shrink-0">📸</span>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-sm">
                      {flyerBusy ? 'Lendo o flyer...' : flyerData ? 'Flyer anexado — toque pra trocar' : 'Suba o flyer e eu preencho pra você'}
                    </p>
                    <p className="text-xs text-beetz-dark/50 mt-0.5">
                      {flyerBusy ? 'Um instante — extraindo nome, data e horário da arte.' : 'A arte vira o flyer oficial do evento e os dados entram sozinhos nos campos vazios.'}
                    </p>
                  </div>
                </div>
                {flyerInfo && !flyerBusy && (
                  <p className="text-xs font-semibold text-beetz-dark/70 bg-white border border-beetz-dark/8 rounded-xl px-3 py-2 mt-3">{flyerInfo}</p>
                )}
              </label>

              <label className="text-sm font-medium block mb-1">Nome do evento *</label>
              <input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Data *</label>
                <input type="date" required className={inputClass} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Data final (se houver)</label>
                <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Horário de início</label>
                <input type="time" className={inputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Horário de término</label>
                <input type="time" className={inputClass} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Local/espaço *</label>
                <input required className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Cidade *</label>
                <input required className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Endereço completo *</label>
              <input required className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Estilo musical</label>
                <input className={inputClass} value={musicStyle} onChange={(e) => setMusicStyle(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Link (evento/ingressos)</label>
                <input className={inputClass} value={link} onChange={(e) => setLink(e.target.value)} />
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-beetz-dark/60">Escolha uma ou mais modalidades — pode combinar várias no mesmo evento. Os preços são os da Beetz.</p>
            {/* Vitrine de marketplace: o PREÇO aparece no card antes mesmo de
                marcar — ninguém escolhe serviço sem ver quanto custa. O
                produtor NUNCA digita preço: com preço da casa, aceita; sem,
                vira "sob consulta" e a Beetz confirma na aprovação. */}
            {modalities.map((m) => {
              const isSelected = !!selected[m.id]
              const temPreco = m.default_price != null
              return (
                <div key={m.id} className={`border rounded-2xl transition-colors overflow-hidden ${isSelected ? 'border-beetz-yellow bg-beetz-yellow/10' : 'border-beetz-dark/10 hover:border-beetz-dark/25'}`}>
                  <label className="flex items-start gap-3 cursor-pointer p-4">
                    <input type="checkbox" className="mt-1" checked={isSelected} onChange={() => toggleModality(m)} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm">{m.name}</p>
                      {m.description && <p className="text-xs text-beetz-dark/50 mt-0.5">{m.description}</p>}
                    </div>
                    <span className={`shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-full ${temPreco ? 'bg-beetz-yellow/40 text-beetz-dark' : 'bg-beetz-gray text-beetz-dark/50'}`}>
                      {temPreco ? `${currency(m.default_price!)} / ${m.unit_label}` : 'Sob consulta'}
                    </span>
                  </label>

                  {isSelected && (
                    <div className="px-4 pb-4 pl-11 space-y-3">
                      {/* Quantidade com stepper do tamanho do polegar. */}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1 bg-white border border-beetz-dark/15 rounded-xl p-1">
                          <button
                            type="button"
                            onClick={() => updateModalitySel(m.id, { quantity: Math.max(1, selected[m.id].quantity - 1) })}
                            className="w-9 h-9 rounded-lg font-extrabold text-lg text-beetz-dark/60 hover:bg-beetz-gray"
                          >
                            −
                          </button>
                          <input
                            type="number" min={1} step={1}
                            className="w-14 text-center font-bold text-sm focus:outline-none bg-transparent"
                            value={selected[m.id].quantity}
                            onChange={(e) => updateModalitySel(m.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                          />
                          <button
                            type="button"
                            onClick={() => updateModalitySel(m.id, { quantity: selected[m.id].quantity + 1 })}
                            className="w-9 h-9 rounded-lg font-extrabold text-lg text-beetz-dark/60 hover:bg-beetz-gray"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-xs text-beetz-dark/50 font-medium">{m.unit_label}{selected[m.id].quantity > 1 ? 's' : ''}</span>
                        {/* Subtotal da linha, ao vivo — a conta na cara. */}
                        {temPreco ? (
                          <span className="ml-auto text-sm font-extrabold">
                            {selected[m.id].quantity} × {currency(m.default_price!)} = {currency(selected[m.id].quantity * selected[m.id].unit_price)}
                          </span>
                        ) : (
                          <span className="ml-auto text-xs font-semibold text-beetz-dark/45">A Beetz confirma o valor na aprovação</span>
                        )}
                      </div>
                      <input
                        className={inputClass}
                        placeholder="Observações (opcional) — ex.: horário de montagem, ponto de energia..."
                        value={selected[m.id].notes}
                        onChange={(e) => updateModalitySel(m.id, { notes: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              )
            })}

            {Object.keys(selected).length > 0 && (
              <div className="bg-beetz-dark text-white rounded-2xl px-5 py-4 flex flex-wrap justify-between items-center gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Total das modalidades</p>
                  {itensSobConsulta > 0 && (
                    <p className="text-[11px] text-amber-300 mt-0.5">
                      + {itensSobConsulta} {itensSobConsulta === 1 ? 'item' : 'itens'} sob consulta (fora da soma)
                    </p>
                  )}
                </div>
                <span className="text-2xl font-extrabold text-beetz-yellow">
                  {totalModalidades > 0 ? currency(totalModalidades) : itensSobConsulta > 0 ? 'Sob consulta' : currency(0)}
                </span>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <>
            <p className="text-sm text-beetz-dark/60">Estimativas de faturamento do evento — sujeitas à confirmação da Beetz.</p>

            {/* O percentual é REGRA DA CASA (admin → Propostas) — aparece
                claro, mas não se negocia no formulário. */}
            <div className="bg-beetz-dark text-white rounded-2xl px-5 py-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Repasse ao produtor</p>
                <p className="text-2xl font-extrabold text-beetz-yellow">{commissionPercentage}% das vendas</p>
              </div>
              <p className="text-[11px] text-white/50 max-w-[180px] text-right">Percentual padrão da Beetz — o restante cobre estrutura, equipe e operação.</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Vendas estimadas (R$)</label>
                <input type="number" min={0} step="0.01" className={inputClass} value={salesAmount} onChange={(e) => setSalesAmount(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Mínimo necessário de vendas (R$) *</label>
                <input
                  type="number" min={0} step="0.01" className={inputClass} value={minSalesTarget}
                  onChange={(e) => setMinSalesTarget(Number(e.target.value))}
                  title="Abaixo de quanto o evento não se sustenta pra você?"
                />
              </div>
            </div>
            <div className="bg-beetz-gray rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-medium text-beetz-dark/60">Repasse estimado ao produtor ({commissionPercentage}%)</span>
              <span className="font-bold">{currency(salesAmount * (commissionPercentage / 100))}</span>
            </div>

            {/* Taxas da operação — transparentes ANTES de enviar; o aceite
                fica congelado na proposta. */}
            {(fees.debit_pix > 0 || fees.credit > 0 || fees.management > 0) && (
              <div className="bg-white border border-beetz-dark/10 rounded-2xl p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-2">Taxas da operação</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-beetz-gray rounded-xl py-2.5">
                    <p className="font-extrabold">{fees.debit_pix}%</p>
                    <p className="text-[11px] text-beetz-dark/50">Débito/Pix</p>
                  </div>
                  <div className="bg-beetz-gray rounded-xl py-2.5">
                    <p className="font-extrabold">{fees.credit}%</p>
                    <p className="text-[11px] text-beetz-dark/50">Crédito</p>
                  </div>
                  <div className="bg-beetz-gray rounded-xl py-2.5">
                    <p className="font-extrabold">{fees.management}%</p>
                    <p className="text-[11px] text-beetz-dark/50">Gestão</p>
                  </div>
                </div>
                <p className="text-[11px] text-beetz-dark/45 mt-2">Ao enviar a proposta, você concorda com as taxas acima — elas ficam registradas no combinado.</p>
              </div>
            )}

            {/* Perguntas comerciais — a Diretoria decide com isso na mesa. */}
            <div className="border-t border-beetz-dark/10 pt-4 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">Vão ter outros parceiros de bebida no evento? *</label>
                <SimNao valor={hasOtherPartners} onPick={(v) => { setHasOtherPartners(v); if (!v) setPartnersNotes('') }} />
                {hasOtherPartners === true && (
                  <input
                    className={`${inputClass} mt-2`}
                    placeholder="Quais? Ex.: gin oficial, energético, água..."
                    value={partnersNotes}
                    onChange={(e) => setPartnersNotes(e.target.value)}
                  />
                )}
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">O evento tem cerveja oficial? *</label>
                <SimNao valor={hasOfficialBeer} onPick={(v) => { setHasOfficialBeer(v); if (!v) setOfficialBeerBrand('') }} />
                {hasOfficialBeer === true && (
                  <input
                    className={`${inputClass} mt-2`}
                    placeholder="Qual marca?"
                    value={officialBeerBrand}
                    onChange={(e) => setOfficialBeerBrand(e.target.value)}
                  />
                )}
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-beetz-dark/60">Quantas pessoas por função você precisa pra esse evento?</p>
            {staffing.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-beetz-gray rounded-xl px-3 py-2">
                <span className="flex-1 text-sm font-medium">{row.quantity}x {row.role_label}</span>
                {row.unit_cost > 0 && <span className="text-xs text-beetz-dark/50">{currency(row.unit_cost)}/pessoa</span>}
                <button onClick={() => removeStaffingRow(idx)} className="text-beetz-dark/40 hover:text-red-600 p-1"><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
              <div className="col-span-2 sm:col-span-2">
                <label className="text-xs font-medium block mb-1">Função</label>
                <input className={inputClass} placeholder="Ex: Garçom" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Qtd.</label>
                <input type="number" min={1} className={inputClass} value={newQty} onChange={(e) => setNewQty(Number(e.target.value))} />
              </div>
              <div className="flex gap-1">
                <input type="number" min={0} step="0.01" placeholder="Custo (opcional)" className={inputClass} value={newCost} onChange={(e) => setNewCost(Number(e.target.value))} />
                <button onClick={addStaffingRow} className="bg-beetz-dark text-white p-2.5 rounded-xl shrink-0"><Plus size={16} /></button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-1">Evento</h3>
              <p className="text-sm">{name} — {eventDate ? new Date(eventDate + 'T00:00:00').toLocaleDateString('pt-BR') : ''}</p>
              <p className="text-sm text-beetz-dark/60">{location}, {city}</p>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-1">Modalidades</h3>
              {Object.entries(selected).map(([id, cfg]) => (
                <p key={id} className="text-sm">{modalities.find((m) => m.id === id)?.name}: {cfg.quantity} x {currency(cfg.unit_price)}</p>
              ))}
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-1">Faturamento e bebidas</h3>
              <p className="text-sm">Vendas estimadas: {currency(salesAmount)} · Mínimo necessário: {currency(minSalesTarget)} · Repasse ao produtor: {commissionPercentage}%</p>
              <p className="text-sm text-beetz-dark/60 mt-0.5">
                Outros parceiros de bebida: {hasOtherPartners ? `Sim — ${partnersNotes}` : 'Não'} · Cerveja oficial: {hasOfficialBeer ? `Sim — ${officialBeerBrand}` : 'Não'}
              </p>
            </div>
            {staffing.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-1">Equipe necessária</h3>
                {staffing.map((r, i) => <p key={i} className="text-sm">{r.quantity}x {r.role_label}</p>)}
              </div>
            )}
            <p className="text-xs text-beetz-dark/50 pt-2 border-t border-beetz-dark/5">
              Ao confirmar, geramos o contrato e enviamos pra você assinar eletronicamente via ZapSign.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-between pt-2">
          <button
            type="button" onClick={goBack} disabled={step === 0}
            className="text-sm font-semibold text-beetz-dark/50 px-4 py-2 disabled:opacity-0"
          >
            Voltar
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={goNext} className="honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm">
              Avançar
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={submitting} className="honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-60">
              {submitting ? 'Enviando...' : 'Confirmar e ir para assinatura'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

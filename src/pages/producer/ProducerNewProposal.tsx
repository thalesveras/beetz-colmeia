import { useEffect, useRef, useState } from 'react'
import { Check, Plus, Send, Trash2 } from 'lucide-react'
import { useProducerAuth } from '../../contexts/ProducerAuthContext'
import {
  createEventAsProducer, createEventModality, createEventStaffingRequirement,
  getAppSettings, listServiceModalities, requestContractSignature
} from '../../lib/dataService'
import { supabase } from '../../lib/supabaseClient'
import type { AppSettings, ServiceModality } from '../../lib/types'

// A proposta agora é uma CONVERSA com a Beetz — um roteiro guiado em formato
// de chat, não um formulário. A Beetz pergunta, o produtor responde com
// chips e campos simples, e cada serviço só puxa as perguntas que ele exige:
//   · Aluguel (grade, mesa...): só a quantidade — preço da casa no admin.
//   · Máquinas/Totem: quantidades + cupom de desconto (taxas do admin).
//   · Operação de bares: produtos desejados + funções da equipe + o 60/40
//     (a Beetz é sócia da operação) + perguntas de bebida.
// No final: resumo, envio e assinatura (o e-mail já chegou validado pelo
// link mágico do login).

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
// Input do CHAT: 16px no mínimo — abaixo disso o iOS dá zoom na tela toda
// quando o campo ganha foco (a praga clássica do formulário no iPhone).
const inputChat = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

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

// ---- O roteiro da conversa ----
type Etapa =
  | 'flyer' | 'nome' | 'data' | 'local' | 'cidade' | 'endereco'
  | 'servicos' | 'qtd_fixa' | 'maquinas' | 'totens' | 'cupom'
  | 'produtos' | 'funcoes' | 'minimo' | 'parceiros' | 'cerveja'
  | 'resumo' | 'enviando' | 'fim'

interface Msg { de: 'b' | 'p'; texto: string }
interface StaffRow { role_label: string; quantity: number }

const ehMaquina = (m: ServiceModality) => /m[áa]quin|totem|autoatend|cart[ãa]o/i.test(m.name)
const FUNCOES_COMUNS = ['Garçom', 'Caixa', 'Barman', 'Líder de bar', 'Repositor', 'Segurança']

export default function ProducerNewProposal() {
  const { producerId } = useProducerAuth()

  const [msgs, setMsgs] = useState<Msg[]>([])
  const [etapa, setEtapa] = useState<Etapa>('flyer')
  const fimRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs, etapa])

  // TECLADO SEMPRE PRONTO: quando a Beetz pergunta algo de digitar, o campo
  // já ganha foco — no celular o teclado abre sozinho (e entre perguntas de
  // texto seguidas ele nem fecha, porque o input é o mesmo e nunca desmonta).
  // O pequeno atraso deixa o input montar; o segundo scroll compensa o
  // teclado que acabou de subir e cobriu a última mensagem.
  const entradaRef = useRef<HTMLInputElement | null>(null)
  const [hasOtherPartnersFoco, setHasOtherPartnersFoco] = useState(0) // gatilho de refoco pros inputs condicionais
  useEffect(() => {
    const t1 = setTimeout(() => entradaRef.current?.focus(), 80)
    const t2 = setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 350)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [etapa, hasOtherPartnersFoco])

  // Botões da barra de resposta NÃO roubam o foco do input (mousedown com
  // preventDefault): sem isso, cada toque em "Confirmar" fecha o teclado.
  const naoRoubaFoco = (e: { preventDefault: () => void }) => e.preventDefault()

  // Config da casa
  const [modalities, setModalities] = useState<ServiceModality[]>([])
  const [cfg, setCfg] = useState<AppSettings | null>(null)
  const [propostasAbertas, setPropostasAbertas] = useState(true)

  // Dados coletados
  const [flyerData, setFlyerData] = useState<string | null>(null)
  const [flyerBusy, setFlyerBusy] = useState(false)
  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location, setLocation] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [escolhidas, setEscolhidas] = useState<string[]>([])
  const [qts, setQts] = useState<Record<string, number>>({})
  const [filaFixas, setFilaFixas] = useState<string[]>([])
  const [maquinasQtd, setMaquinasQtd] = useState(1)
  const [totensQtd, setTotensQtd] = useState(0)
  const [cupom, setCupom] = useState('')
  const [cupomAplicado, setCupomAplicado] = useState(false)
  const [produtosDesejados, setProdutosDesejados] = useState('')
  const [staffRows, setStaffRows] = useState<StaffRow[]>([])
  const [novaFuncao, setNovaFuncao] = useState('')
  const [novaQtd, setNovaQtd] = useState(1)
  const [minSalesTarget, setMinSalesTarget] = useState(0)
  const [hasOtherPartners, setHasOtherPartners] = useState<boolean | null>(null)
  const [partnersNotes, setPartnersNotes] = useState('')
  const [hasOfficialBeer, setHasOfficialBeer] = useState<boolean | null>(null)
  const [officialBeerBrand, setOfficialBeerBrand] = useState('')

  const [campo, setCampo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [signUrl, setSignUrl] = useState<string | null>(null)

  const mf = cfg?.machine_fees ?? null
  const percentProdutor = Number(cfg?.proposal_producer_percent ?? 40)

  useEffect(() => {
    Promise.all([listServiceModalities().catch(() => [] as ServiceModality[]), getAppSettings().catch(() => null)])
      .then(([mods, c]) => {
        setModalities(mods)
        setCfg(c)
        setPropostasAbertas(c?.proposals_open ?? true)
      })
    setMsgs([
      { de: 'b', texto: 'Oi! 🐝 Eu sou a Beetz. Vamos montar sua proposta de evento juntos — é rapidinho.' },
      { de: 'b', texto: 'Se você já tem o flyer do evento, me manda que eu leio e adianto os dados. Se não tiver, é só pular.' }
    ])
  }, [])

  function fala(texto: string) {
    setMsgs((prev) => [...prev, { de: 'b', texto }])
  }
  function respondo(texto: string) {
    setMsgs((prev) => [...prev, { de: 'p', texto }])
  }

  const temOperacao = escolhidas.some((id) => modalities.find((m) => m.id === id)?.price_type === 'percent')
  const temMaquinas = escolhidas.some((id) => { const m = modalities.find((x) => x.id === id); return m ? ehMaquina(m) : false })

  // ---- Transições do roteiro ----
  function irPara(prox: Etapa) {
    setErro(null)
    setCampo('')
    if (prox === 'nome') fala('Qual o nome do evento?')
    if (prox === 'data') fala('Que dia vai ser?')
    if (prox === 'local') fala('Em qual local/espaço?')
    if (prox === 'cidade') fala('Em qual cidade?')
    if (prox === 'endereco') fala('Me passa o endereço completo do local.')
    if (prox === 'servicos') fala('O que você precisa da Beetz? Pode marcar mais de um. 👇')
    if (prox === 'maquinas') fala('Quantas máquinas de cartão você precisa?')
    if (prox === 'totens') fala('E totens de autoatendimento — quantos?')
    if (prox === 'cupom') fala('Você tem cupom de desconto nas taxas? Se tiver, digita ele aqui — se não, é só pular.')
    if (prox === 'produtos') fala('Sobre a operação de bares: quais produtos você quer no evento? (ex.: cerveja, drinks, energético, água...)')
    if (prox === 'funcoes') fala('E de equipe, o que a operação precisa? Adiciona as funções e quantidades. 👇')
    if (prox === 'minimo') fala('Qual o mínimo de vendas (R$) que o evento precisa fazer pra valer a pena pra você?')
    if (prox === 'parceiros') fala('Vão ter outros parceiros de bebida no evento?')
    if (prox === 'cerveja') fala('O evento tem cerveja oficial?')
    if (prox === 'resumo') fala('Fechou! Dá uma conferida no resumo antes de enviar. 👇')
    setEtapa(prox)
  }

  // Depois dos serviços: fila de quantidades das modalidades FIXAS
  // (não-máquina), depois máquinas → totem → cupom, depois operação.
  function proximoDepoisServicos(fila: string[]) {
    if (fila.length > 0) {
      const m = modalities.find((x) => x.id === fila[0])!
      fala(`Quant${m.unit_label === 'grade' ? 'as grades' : `os(as) ${m.unit_label}s`} de "${m.name}" você precisa?`)
      setFilaFixas(fila)
      setEtapa('qtd_fixa')
      setErro(null)
      return
    }
    if (temMaquinas) { irPara('maquinas'); return }
    if (temOperacao) { irPara('produtos'); return }
    irPara('resumo')
  }

  function depoisDasMaquinas() {
    if (temOperacao) irPara('produtos')
    else irPara('resumo')
  }

  // ---- Handlers por etapa ----
  async function handleFlyer(file: File) {
    setFlyerBusy(true)
    try {
      const dataUrl = await encolherFlyer(file)
      setFlyerData(dataUrl)
      respondo('📸 (flyer enviado)')
      fala('Recebi! Deixa eu ler a arte... 🔎')
      const T = await loadTesseract()
      const result = await T.recognize(dataUrl, 'por', {})
      const ex = extrairDoFlyer(String(result?.data?.text ?? ''))
      let n = 0
      if (ex.name) { setName(ex.name); n++ }
      if (ex.eventDate) { setEventDate(ex.eventDate); n++ }
      if (ex.city) { setCity(ex.city); n++ }
      if (ex.location) { setLocation(ex.location); n++ }
      fala(n > 0 ? `Consegui adiantar ${n} dado${n > 1 ? 's' : ''} da arte — confirma comigo nos próximos passos. ✨` : 'A arte tá linda, mas não consegui ler os dados — me conta você. 😄')
    } catch {
      fala('Não consegui ler a arte agora — sem problema, o flyer vai junto na proposta. Me conta os dados:')
    } finally {
      setFlyerBusy(false)
      irPara('nome')
    }
  }

  function enviarTexto() {
    const v = campo.trim()
    if (etapa === 'nome') {
      const valor = v || name
      if (!valor) { setErro('Me diz o nome do evento. 🙂'); return }
      setName(valor)
      respondo(valor)
      irPara('data')
      return
    }
    if (etapa === 'local') {
      const valor = v || location
      if (!valor) { setErro('Preciso do local/espaço.'); return }
      setLocation(valor)
      respondo(valor)
      irPara('cidade')
      return
    }
    if (etapa === 'cidade') {
      const valor = v || city
      if (!valor) { setErro('Preciso da cidade.'); return }
      setCity(valor)
      respondo(valor)
      irPara('endereco')
      return
    }
    if (etapa === 'endereco') {
      if (!v) { setErro('Preciso do endereço completo.'); return }
      setAddress(v)
      respondo(v)
      irPara('servicos')
      return
    }
    if (etapa === 'produtos') {
      if (!v) { setErro('Me conta ao menos os principais produtos. 🍻'); return }
      setProdutosDesejados(v)
      respondo(v)
      irPara('funcoes')
      return
    }
  }

  function confirmarData() {
    if (!eventDate) { setErro('Escolhe a data do evento.'); return }
    respondo(new Date(eventDate + 'T12:00:00').toLocaleDateString('pt-BR'))
    irPara('local')
  }

  function confirmarServicos() {
    if (escolhidas.length === 0) { setErro('Marca pelo menos um serviço. 🙂'); return }
    const nomes = escolhidas.map((id) => modalities.find((m) => m.id === id)?.name ?? '').filter(Boolean)
    respondo(nomes.join(' + '))
    // Fila de quantidade: só as fixas que NÃO são máquina (máquina tem bloco próprio).
    const fila = escolhidas.filter((id) => {
      const m = modalities.find((x) => x.id === id)
      return m && m.price_type !== 'percent' && !ehMaquina(m)
    })
    proximoDepoisServicos(fila)
  }

  function confirmarQtdFixa() {
    const id = filaFixas[0]
    const m = modalities.find((x) => x.id === id)!
    const q = qts[id] ?? 1
    respondo(`${q} ${m.unit_label}${q > 1 ? 's' : ''}`)
    const resto = filaFixas.slice(1)
    proximoDepoisServicos(resto)
  }

  function confirmarMaquinas() {
    respondo(`${maquinasQtd} máquina${maquinasQtd > 1 ? 's' : ''}`)
    irPara('totens')
  }

  function confirmarTotens() {
    respondo(totensQtd > 0 ? `${totensQtd} totem${totensQtd > 1 ? 's' : ''}` : 'Sem totem')
    irPara('cupom')
  }

  function aplicarCupom(pular: boolean) {
    if (pular || !cupom.trim()) {
      respondo('Sem cupom')
      setCupomAplicado(false)
      if (mf) fala(`Fechado! Taxas padrão da casa: ${mf.standard.debit_pix}% débito/pix, ${mf.standard.credit}% crédito, ${mf.standard.cash}% dinheiro — sem taxa de gestão. Aluguel mensal: máquina ${currency(mf.machine_rent)} · totem ${currency(mf.totem_rent)}.`)
      depoisDasMaquinas()
      return
    }
    const codigo = cupom.trim().toUpperCase()
    respondo(codigo)
    if (mf && codigo === (mf.coupon_code ?? '').toUpperCase() && mf.coupon_code) {
      setCupomAplicado(true)
      fala(`🎉 Cupom válido! Suas taxas: ${mf.coupon.debit_pix}% débito e pix, ${mf.coupon.credit}% crédito e ${mf.coupon.management}% de gestão. Aluguel mensal: máquina ${currency(mf.machine_rent)} · totem ${currency(mf.totem_rent)}.`)
      depoisDasMaquinas()
    } else {
      setCupomAplicado(false)
      setErro('Esse cupom não confere — tenta de novo ou pula.')
    }
  }

  function addFuncao(rotulo?: string) {
    const r = (rotulo ?? novaFuncao).trim()
    if (!r) return
    setStaffRows((prev) => {
      const existente = prev.find((x) => x.role_label.toLowerCase() === r.toLowerCase())
      if (existente) return prev.map((x) => (x === existente ? { ...x, quantity: x.quantity + (rotulo ? 1 : novaQtd) } : x))
      return [...prev, { role_label: r, quantity: rotulo ? 1 : novaQtd }]
    })
    setNovaFuncao('')
    setNovaQtd(1)
  }

  function confirmarFuncoes() {
    if (staffRows.length === 0) { setErro('Adiciona ao menos uma função — a operação precisa de gente. 🐝'); return }
    respondo(staffRows.map((s) => `${s.quantity}× ${s.role_label}`).join(', '))
    fala(`Sobre a sociedade: nessa operação a Beetz entra como sócia do bar — ${100 - percentProdutor}% Beetz / ${percentProdutor}% você, sobre as vendas. A estrutura, equipe e insumos são por nossa conta. 🤝`)
    irPara('minimo')
  }

  function confirmarMinimo() {
    if (!minSalesTarget || minSalesTarget <= 0) { setErro('Me diz um valor mínimo de vendas.'); return }
    respondo(currency(minSalesTarget))
    irPara('parceiros')
  }

  function respostaParceiros(v: boolean) {
    setHasOtherPartners(v)
    if (!v) {
      respondo('Não')
      setPartnersNotes('')
      irPara('cerveja')
    } else {
      respondo('Sim')
      fala('Quais parceiros?')
      setHasOtherPartnersFoco((n) => n + 1) // o campo que acabou de aparecer já vem com o teclado
    }
  }

  function confirmarParceirosNotas() {
    if (!partnersNotes.trim()) { setErro('Me conta quais parceiros. 🙂'); return }
    respondo(partnersNotes)
    irPara('cerveja')
  }

  function respostaCerveja(v: boolean) {
    setHasOfficialBeer(v)
    if (!v) {
      respondo('Não')
      setOfficialBeerBrand('')
      irPara('resumo')
    } else {
      respondo('Sim')
      fala('Qual a marca?')
      setHasOtherPartnersFoco((n) => n + 1)
    }
  }

  function confirmarCervejaMarca() {
    if (!officialBeerBrand.trim()) { setErro('Qual a marca? 🍺'); return }
    respondo(officialBeerBrand)
    irPara('resumo')
  }

  // ---- Envio ----
  async function enviarProposta() {
    if (!producerId) return
    setEtapa('enviando')
    fala('Enviando sua proposta... 🐝')
    try {
      let flyerUrl: string | null = null
      if (flyerData) {
        try {
          const blob = await (await fetch(flyerData)).blob()
          const path = `${producerId}/flyer-${Date.now()}.jpg`
          const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
          if (!upErr) flyerUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
        } catch { /* sem flyer, segue */ }
      }

      const feesAplicadas = temMaquinas && mf
        ? { mode: cupomAplicado ? 'coupon' : 'standard', fees: cupomAplicado ? mf.coupon : mf.standard, machine_rent: mf.machine_rent, totem_rent: mf.totem_rent, coupon: cupomAplicado ? mf.coupon_code : null }
        : null

      const event = await createEventAsProducer(producerId, {
        name, event_date: eventDate, location, city, status: 'Planejado', leader_id: null,
        address, flyer_url: flyerUrl,
        sales_amount: 0,
        commission_percentage: temOperacao ? percentProdutor : 0,
        min_sales_target: temOperacao ? minSalesTarget || null : null,
        has_other_beverage_partners: temOperacao ? hasOtherPartners : null,
        beverage_partners_notes: temOperacao && hasOtherPartners ? partnersNotes.trim() || null : null,
        has_official_beer: temOperacao ? hasOfficialBeer : null,
        official_beer_brand: temOperacao && hasOfficialBeer ? officialBeerBrand.trim() || null : null,
        proposal_fees: feesAplicadas,
        proposal_products: temOperacao ? produtosDesejados.trim() || null : null,
        proposal_totems: temMaquinas ? totensQtd : null,
        proposal_coupon: cupomAplicado && mf ? mf.coupon_code : null
      })

      for (const id of escolhidas) {
        const m = modalities.find((x) => x.id === id)
        if (!m) continue
        const quantidade = ehMaquina(m) ? maquinasQtd : m.price_type === 'percent' ? 1 : (qts[id] ?? 1)
        const preco = m.default_price ?? 0
        await createEventModality({
          event_id: event.id, modality_id: id, quantity: quantidade,
          unit_price: preco, notes: null
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
      fala('Proposta enviada! 🎉 Agora é só assinar — seu e-mail já foi validado pelo link mágico do login.')
      setEtapa('fim')
    } catch (err) {
      fala(`Ops, algo travou no envio: ${err instanceof Error ? err.message : 'tenta de novo'}. Nada do que você respondeu se perdeu — toca em Enviar de novo.`)
      setEtapa('resumo')
    }
  }

  // ---- Bloqueio quando as propostas estão pausadas ----
  if (!propostasAbertas) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center space-y-3">
        <p className="text-4xl">⏸️</p>
        <h1 className="text-xl font-extrabold">Propostas pausadas</h1>
        <p className="text-sm text-beetz-dark/60">
          A Beetz não está recebendo novas propostas neste momento. Assim que reabrir, é só voltar aqui.
        </p>
      </div>
    )
  }

  // ---- Render ----
  const stepperInput = (valor: number, setValor: (n: number) => void, min = 0) => (
    <div className="flex items-center gap-1 bg-white border border-beetz-dark/15 rounded-xl p-1">
      <button type="button" onClick={() => setValor(Math.max(min, valor - 1))} className="w-10 h-10 rounded-lg font-extrabold text-lg text-beetz-dark/60 hover:bg-beetz-gray">−</button>
      <span className="w-12 text-center font-extrabold">{valor}</span>
      <button type="button" onClick={() => setValor(valor + 1)} className="w-10 h-10 rounded-lg font-extrabold text-lg text-beetz-dark/60 hover:bg-beetz-gray">+</button>
    </div>
  )

  const botaoOk = (rotulo: string, onClick: () => void) => (
    <button
      onMouseDown={naoRoubaFoco}
      onClick={onClick}
      className="honey-gradient text-beetz-dark font-bold px-5 py-3 rounded-xl text-sm active:scale-[0.98] transition-transform shrink-0 min-h-[48px]"
    >
      {rotulo}
    </button>
  )

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ minHeight: 'calc(100dvh - 140px)' }}>
      <div className="mb-3">
        <h1 className="text-xl font-extrabold">Nova proposta 🐝</h1>
        <p className="text-xs text-beetz-dark/50">Uma conversa rápida com a Beetz — responde no seu ritmo.</p>
      </div>

      {/* A conversa */}
      <div className="flex-1 space-y-2.5 pb-4">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.de === 'b' ? 'justify-start' : 'justify-end'}`}>
            {m.de === 'b' && <span className="text-lg mr-2 mt-0.5 shrink-0">🐝</span>}
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              m.de === 'b' ? 'bg-beetz-dark text-white rounded-tl-sm' : 'bg-beetz-yellow text-beetz-dark font-semibold rounded-tr-sm'
            }`}>
              {m.texto}
            </div>
          </div>
        ))}

        {/* Resumo como cartão dentro da conversa */}
        {(etapa === 'resumo' || etapa === 'enviando') && (
          <div className="bg-white border border-beetz-dark/10 rounded-2xl p-4 text-sm space-y-1.5">
            <p className="font-extrabold">{name}</p>
            <p className="text-beetz-dark/60 text-xs">
              {eventDate ? new Date(eventDate + 'T12:00:00').toLocaleDateString('pt-BR') : ''} · {location} · {city}
            </p>
            <div className="border-t border-beetz-dark/8 pt-1.5 space-y-1">
              {escolhidas.map((id) => {
                const m = modalities.find((x) => x.id === id)
                if (!m) return null
                if (m.price_type === 'percent') {
                  return <p key={id}>• {m.name} — sociedade {100 - percentProdutor}% Beetz / {percentProdutor}% você</p>
                }
                const q = ehMaquina(m) ? maquinasQtd : (qts[id] ?? 1)
                return (
                  <p key={id}>
                    • {m.name} — {q} {m.unit_label}{q > 1 ? 's' : ''}
                    {m.default_price != null ? ` × ${currency(m.default_price)} = ${currency(q * m.default_price)}` : ' · sob consulta'}
                  </p>
                )
              })}
              {temMaquinas && totensQtd > 0 && <p>• Totem de autoatendimento — {totensQtd}</p>}
              {temMaquinas && mf && (
                <p className="text-xs text-beetz-dark/55">
                  Taxas{cupomAplicado ? ` (cupom ${mf.coupon_code})` : ' padrão'}: {(cupomAplicado ? mf.coupon : mf.standard).debit_pix}% déb/pix · {(cupomAplicado ? mf.coupon : mf.standard).credit}% créd · {(cupomAplicado ? mf.coupon : mf.standard).cash}% dinheiro · {(cupomAplicado ? mf.coupon : mf.standard).management}% gestão — aluguel mensal: máquina {currency(mf.machine_rent)}{totensQtd > 0 ? ` · totem ${currency(mf.totem_rent)}` : ''}
                </p>
              )}
              {temOperacao && (
                <>
                  <p className="text-xs text-beetz-dark/55">Produtos: {produtosDesejados}</p>
                  <p className="text-xs text-beetz-dark/55">Equipe: {staffRows.map((s) => `${s.quantity}× ${s.role_label}`).join(', ')}</p>
                  <p className="text-xs text-beetz-dark/55">
                    Mínimo de vendas: {currency(minSalesTarget)} · Parceiros de bebida: {hasOtherPartners ? `Sim — ${partnersNotes}` : 'Não'} · Cerveja oficial: {hasOfficialBeer ? `Sim — ${officialBeerBrand}` : 'Não'}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {etapa === 'fim' && signUrl && (
          <div className="bg-white border border-beetz-dark/10 rounded-2xl p-5 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto"><Check size={24} /></div>
            <p className="font-bold text-sm">Falta só a assinatura!</p>
            <a href={signUrl} target="_blank" rel="noreferrer" className="inline-block honey-gradient text-beetz-dark font-bold px-6 py-3 rounded-xl text-sm">
              🖊️ Assinar a proposta
            </a>
            <p className="text-[11px] text-beetz-dark/45">A Beetz analisa e te responde por aqui e por e-mail.</p>
          </div>
        )}

        <div ref={fimRef} />
      </div>

      {/* Área de resposta — muda conforme a pergunta da vez. Gruda no fundo,
          acompanha o teclado (100dvh) e respeita a barra do iPhone. */}
      <div className="sticky bottom-0 bg-beetz-gray/95 backdrop-blur-sm -mx-4 px-4 py-3 space-y-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
        {erro && <p className="text-xs text-red-600 font-semibold">{erro}</p>}

        {etapa === 'flyer' && (
          <div className="flex gap-2">
            <label className={`flex-1 honey-gradient text-beetz-dark font-bold px-4 py-3 rounded-xl text-sm text-center cursor-pointer ${flyerBusy ? 'opacity-60 pointer-events-none' : ''}`}>
              {flyerBusy ? 'Lendo o flyer...' : '📸 Enviar o flyer'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFlyer(f) }} />
            </label>
            <button onClick={() => { respondo('Sem flyer por enquanto'); irPara('nome') }} className="px-4 py-3 rounded-xl text-sm font-semibold text-beetz-dark/60 bg-white border border-beetz-dark/10">
              Pular
            </button>
          </div>
        )}

        {(etapa === 'nome' || etapa === 'local' || etapa === 'cidade' || etapa === 'endereco' || etapa === 'produtos') && (
          <div className="flex gap-2">
            <input
              ref={entradaRef}
              className={inputChat}
              enterKeyHint="send"
              placeholder={
                etapa === 'nome' ? (name ? `Li "${name}" no flyer — confirma ou corrige` : 'Nome do evento...')
                : etapa === 'local' ? (location || 'Local/espaço...')
                : etapa === 'cidade' ? (city || 'Cidade...')
                : etapa === 'endereco' ? 'Rua, número, bairro...'
                : 'Cerveja, drinks, energético...'
              }
              value={campo}
              onChange={(e) => setCampo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') enviarTexto() }}
              autoFocus
            />
            <button onMouseDown={naoRoubaFoco} onClick={enviarTexto} className="honey-gradient text-beetz-dark px-4 rounded-xl shrink-0 min-h-[48px]"><Send size={18} /></button>
          </div>
        )}

        {etapa === 'data' && (
          <div className="flex gap-2">
            <input type="date" className={inputClass} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            {botaoOk('Confirmar', confirmarData)}
          </div>
        )}

        {etapa === 'servicos' && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {modalities.map((m) => {
                const on = escolhidas.includes(m.id)
                const rotuloPreco = m.price_type === 'percent'
                  ? `${100 - percentProdutor}/${percentProdutor}`
                  : m.default_price != null ? currency(m.default_price) : 'sob consulta'
                return (
                  <button
                    key={m.id}
                    onClick={() => setEscolhidas((prev) => (on ? prev.filter((x) => x !== m.id) : [...prev, m.id]))}
                    className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                      on ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark' : 'bg-white border-beetz-dark/12 text-beetz-dark/70'
                    }`}
                  >
                    {m.name} <span className="text-beetz-dark/40">({rotuloPreco})</span>
                  </button>
                )
              })}
            </div>
            {botaoOk('É isso →', confirmarServicos)}
          </div>
        )}

        {etapa === 'qtd_fixa' && filaFixas[0] && (
          <div className="flex items-center gap-2">
            {stepperInput(qts[filaFixas[0]] ?? 1, (n) => setQts((prev) => ({ ...prev, [filaFixas[0]]: n })), 1)}
            <span className="text-xs text-beetz-dark/50 flex-1">
              {(() => { const m = modalities.find((x) => x.id === filaFixas[0]); return m?.default_price != null ? `× ${currency(m.default_price)} = ${currency((qts[filaFixas[0]] ?? 1) * m.default_price)}` : 'preço sob consulta' })()}
            </span>
            {botaoOk('Confirmar', confirmarQtdFixa)}
          </div>
        )}

        {etapa === 'maquinas' && (
          <div className="flex items-center gap-2">
            {stepperInput(maquinasQtd, setMaquinasQtd, 1)}
            {mf && <span className="text-xs text-beetz-dark/50 flex-1">aluguel {currency(mf.machine_rent)}/mês por máquina</span>}
            {botaoOk('Confirmar', confirmarMaquinas)}
          </div>
        )}

        {etapa === 'totens' && (
          <div className="flex items-center gap-2">
            {stepperInput(totensQtd, setTotensQtd, 0)}
            {mf && <span className="text-xs text-beetz-dark/50 flex-1">aluguel {currency(mf.totem_rent)}/mês por totem</span>}
            {botaoOk('Confirmar', confirmarTotens)}
          </div>
        )}

        {etapa === 'cupom' && (
          <div className="flex gap-2">
            <input
              ref={entradaRef}
              className={`${inputChat} uppercase`}
              enterKeyHint="go"
              autoCapitalize="characters"
              placeholder="CUPOM (se tiver)"
              value={cupom}
              onChange={(e) => setCupom(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') aplicarCupom(false) }}
            />
            {botaoOk('Aplicar', () => aplicarCupom(false))}
            <button onMouseDown={naoRoubaFoco} onClick={() => aplicarCupom(true)} className="px-4 rounded-xl text-sm font-semibold text-beetz-dark/60 bg-white border border-beetz-dark/10 shrink-0 min-h-[48px]">
              Pular
            </button>
          </div>
        )}

        {etapa === 'funcoes' && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {FUNCOES_COMUNS.map((f) => (
                <button key={f} onClick={() => addFuncao(f)} className="text-xs font-semibold border border-dashed border-beetz-dark/25 text-beetz-dark/70 px-3 py-1.5 rounded-full hover:bg-beetz-yellow/20">
                  + {f}
                </button>
              ))}
            </div>
            {staffRows.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {staffRows.map((s) => (
                  <span key={s.role_label} className="flex items-center gap-1.5 text-xs font-bold bg-white border border-beetz-dark/10 px-3 py-1.5 rounded-full">
                    {s.quantity}× {s.role_label}
                    <button onClick={() => setStaffRows((prev) => prev.filter((x) => x !== s))} className="text-beetz-dark/40 hover:text-red-600"><Trash2 size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input className={inputClass} placeholder="Outra função..." value={novaFuncao} onChange={(e) => setNovaFuncao(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addFuncao() }} />
              {stepperInput(novaQtd, setNovaQtd, 1)}
              <button onClick={() => addFuncao()} className="bg-beetz-dark text-white p-3 rounded-xl shrink-0"><Plus size={16} /></button>
            </div>
            {botaoOk('Equipe fechada →', confirmarFuncoes)}
          </div>
        )}

        {etapa === 'minimo' && (
          <div className="flex gap-2">
            <input
              ref={entradaRef}
              type="number" min={0} step="0.01" inputMode="decimal" enterKeyHint="done"
              className={inputChat} placeholder="Ex.: 15000"
              value={minSalesTarget || ''}
              onChange={(e) => setMinSalesTarget(Number(e.target.value))}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmarMinimo() }}
            />
            {botaoOk('Confirmar', confirmarMinimo)}
          </div>
        )}

        {etapa === 'parceiros' && (
          hasOtherPartners === true ? (
            <div className="flex gap-2">
              <input ref={entradaRef} className={inputChat} enterKeyHint="send" placeholder="Quais? Ex.: gin oficial, energético..." value={partnersNotes} onChange={(e) => setPartnersNotes(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirmarParceirosNotas() }} autoFocus />
              {botaoOk('Confirmar', confirmarParceirosNotas)}
            </div>
          ) : (
            <div className="flex gap-2">
              {botaoOk('Sim', () => respostaParceiros(true))}
              <button onClick={() => respostaParceiros(false)} className="px-6 rounded-xl text-sm font-semibold bg-white border border-beetz-dark/10 min-h-[48px]">Não</button>
            </div>
          )
        )}

        {etapa === 'cerveja' && (
          hasOfficialBeer === true ? (
            <div className="flex gap-2">
              <input ref={entradaRef} className={inputChat} enterKeyHint="send" placeholder="Qual marca?" value={officialBeerBrand} onChange={(e) => setOfficialBeerBrand(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirmarCervejaMarca() }} autoFocus />
              {botaoOk('Confirmar', confirmarCervejaMarca)}
            </div>
          ) : (
            <div className="flex gap-2">
              {botaoOk('Sim', () => respostaCerveja(true))}
              <button onClick={() => respostaCerveja(false)} className="px-6 rounded-xl text-sm font-semibold bg-white border border-beetz-dark/10 min-h-[48px]">Não</button>
            </div>
          )
        )}

        {etapa === 'resumo' && (
          <div className="flex gap-2">
            {botaoOk('✅ Enviar proposta e assinar', enviarProposta)}
            <button onClick={() => window.location.reload()} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-beetz-dark/50 bg-white border border-beetz-dark/10 shrink-0">
              Recomeçar
            </button>
          </div>
        )}

        {etapa === 'enviando' && <p className="text-sm font-semibold text-beetz-dark/50 text-center py-1">Enviando... 🐝</p>}
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Camera, Check, X } from 'lucide-react'
import { staffCheckIn, staffCheckOut } from '../../lib/dataService'
import type { EventStaffingApplication, EventStaffingRequirement } from '../../lib/types'

// Validação de ENTRADA e SAÍDA da equipe por QR, na porta do evento.
//   Entrada: gerente escaneia o QR do colaborador confirmado → registra o
//     check-in e pergunta o equipamento (maquininha) pra garçom/caixa — com
//     leitura do QR do próprio equipamento.
//   Saída: mesmo QR → registra o check-out e dá baixa na devolução.
// PAGAMENTO NÃO acontece aqui: regra da casa é pagar a escala sempre DEPOIS,
// via repasse/acerto — o botão "Gerar pagamentos" segue sendo o caminho.
// Leitura via jsQR (CDN, carregado só aqui) + câmera traseira; sem câmera,
// o código pode ser digitado à mão.

async function loadJsQR(): Promise<any> {
  const w = window as any
  if (w.jsQR) return w.jsQR
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Não deu pra carregar o leitor de QR.'))
    document.head.appendChild(s)
  })
  return (window as any).jsQR
}

// O QR do colaborador é "beetz:app:<uuid>"; aceita também o uuid puro
// (fallback manual). Qualquer outro conteúdo é tratado como código de
// equipamento quando o scan está na fase do equipamento.
function parseAppCode(raw: string): string | null {
  const t = raw.trim()
  const m = t.match(/^beetz:app:([0-9a-f-]{36})$/i) ?? t.match(/^([0-9a-f-]{36})$/i)
  return m ? m[1].toLowerCase() : null
}

const precisaEquipamento = (req: EventStaffingRequirement | undefined) =>
  !!req && /gar[çc]|caixa/i.test(req.role_label)

interface Props {
  eventId: string
  apps: EventStaffingApplication[]
  requirements: EventStaffingRequirement[]
  personName: (profileId: string) => string
  userId: string | null
  onClose: () => void
  onChanged: () => void
}

type Fase = 'scan-pessoa' | 'confirmar' | 'scan-equip'

export default function CheckinScanner({ eventId, apps, requirements, personName, userId, onClose, onChanged }: Props) {
  const [modo, setModo] = useState<'entrada' | 'saida'>('entrada')
  const [fase, setFase] = useState<Fase>('scan-pessoa')
  const [alvo, setAlvo] = useState<EventStaffingApplication | null>(null)
  const [equip, setEquip] = useState('')
  const [manual, setManual] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [camErro, setCamErro] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // A fase muda dentro do loop da câmera — o ref evita closure velha.
  const faseRef = useRef<Fase>(fase)
  faseRef.current = fase
  const modoRef = useRef(modo)
  modoRef.current = modo

  const reqDe = (app: EventStaffingApplication) => requirements.find((r) => r.id === app.requirement_id)

  function encontrarPessoa(codigo: string) {
    const appId = parseAppCode(codigo)
    if (!appId) return
    const app = apps.find((a) => a.id === appId && a.status === 'Confirmado')
    if (!app) {
      setErro('QR não confere com nenhum confirmado DESTE evento.')
      return
    }
    setErro(null)
    setMsg(null)
    setAlvo(app)
    setEquip(app.equipment_code ?? '')
    setFase('confirmar')
  }

  function aoLerCodigo(codigo: string) {
    if (faseRef.current === 'scan-pessoa') {
      encontrarPessoa(codigo)
    } else if (faseRef.current === 'scan-equip') {
      // Qualquer QR serve como código do equipamento (etiqueta da maquininha).
      setEquip(codigo.trim())
      setFase('confirmar')
    }
  }

  // Câmera + loop de leitura — ligados enquanto alguma fase de scan está ativa.
  const scanAtivo = fase === 'scan-pessoa' || fase === 'scan-equip'
  useEffect(() => {
    if (!scanAtivo) return
    let alive = true
    let timer: number | null = null
    const canvas = document.createElement('canvas')

    async function start() {
      try {
        const [jsQR, stream] = await Promise.all([
          loadJsQR(),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        ])
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        timer = window.setInterval(() => {
          if (!alive || !video.videoWidth) return
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          ctx.drawImage(video, 0, 0)
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const hit = jsQR(img.data, img.width, img.height)
          if (hit?.data) aoLerCodigo(hit.data)
        }, 350)
      } catch {
        if (alive) setCamErro(true)
      }
    }
    start()
    return () => {
      alive = false
      if (timer) window.clearInterval(timer)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanAtivo])

  async function confirmarEntrada() {
    if (!alvo) return
    setBusy(true)
    setErro(null)
    try {
      await staffCheckIn(alvo.id, userId, equip.trim() || null)
      setMsg(`✅ Entrada de ${personName(alvo.profile_id)} registrada${equip.trim() ? ` · equipamento ${equip.trim()}` : ''}.`)
      setAlvo(null)
      setEquip('')
      setFase('scan-pessoa')
      onChanged()
    } catch (e: any) {
      setErro(e?.message ?? 'Não foi possível registrar a entrada.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmarSaida() {
    if (!alvo) return
    setBusy(true)
    setErro(null)
    try {
      const devolve = !!alvo.equipment_code && !alvo.equipment_returned_at
      await staffCheckOut(alvo.id, userId, devolve)
      setMsg(`✅ Saída de ${personName(alvo.profile_id)} registrada${devolve ? ` · equipamento ${alvo.equipment_code} devolvido` : ''}.`)
      setAlvo(null)
      setFase('scan-pessoa')
      onChanged()
    } catch (e: any) {
      setErro(e?.message ?? 'Não foi possível registrar a saída.')
    } finally {
      setBusy(false)
    }
  }

  const req = alvo ? reqDe(alvo) : undefined
  const pedirEquip = modo === 'entrada' && precisaEquipamento(req)
  const horario = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[92vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dark-gradient text-white px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-beetz-yellow">Validação da escala</p>
            <p className="font-extrabold leading-tight">Escanear QR do colaborador</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Fechar"><X size={18} /></button>
        </div>

        {/* Entrada | Saída — a opção pedida: o mesmo scanner faz as duas pontas. */}
        <div className="grid grid-cols-2 gap-2 p-4 pb-0">
          {(['entrada', 'saida'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setModo(m); setAlvo(null); setFase('scan-pessoa'); setErro(null); setMsg(null) }}
              className={`py-2.5 rounded-xl text-sm font-bold transition-colors ${
                modo === m ? 'bg-beetz-dark text-white' : 'bg-beetz-gray text-beetz-dark/60 hover:bg-beetz-dark/10'
              }`}
            >
              {m === 'entrada' ? '🟢 Entrada' : '🔵 Saída'}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          {msg && <p className="text-sm font-semibold text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5">{msg}</p>}
          {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">{erro}</p>}

          {scanAtivo && (
            <>
              <p className="text-xs font-semibold text-beetz-dark/60">
                {fase === 'scan-equip'
                  ? '📷 Agora aponte pro QR/etiqueta do EQUIPAMENTO'
                  : `📷 Aponte pro QR de ${modo === 'entrada' ? 'entrada' : 'saída'} do colaborador`}
              </p>
              {camErro ? (
                <p className="text-sm text-beetz-dark/55 bg-beetz-gray rounded-xl px-3 py-3">
                  Sem acesso à câmera — digite o código abaixo.
                </p>
              ) : (
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
                  <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-8 border-2 border-beetz-yellow/80 rounded-2xl pointer-events-none" />
                </div>
              )}
              {/* Fallback universal: colar/digitar o código do crachá ou do equipamento. */}
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-beetz-dark/15 rounded-xl px-3 py-2.5 text-base"
                  placeholder={fase === 'scan-equip' ? 'Código do equipamento' : 'Ou digite o código do crachá'}
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && manual.trim()) { aoLerCodigo(manual); setManual('') } }}
                />
                <button
                  onClick={() => { if (manual.trim()) { aoLerCodigo(manual); setManual('') } }}
                  className="bg-beetz-dark text-white font-bold px-4 rounded-xl"
                >
                  OK
                </button>
              </div>
              {fase === 'scan-equip' && (
                <button onClick={() => setFase('confirmar')} className="w-full text-xs font-semibold text-beetz-dark/50 py-2">
                  ← Voltar sem ler equipamento
                </button>
              )}
            </>
          )}

          {fase === 'confirmar' && alvo && (
            <div className="space-y-3">
              <div className="bg-beetz-gray rounded-2xl p-4">
                <p className="font-extrabold text-lg leading-tight">{personName(alvo.profile_id)}</p>
                <p className="text-sm text-beetz-dark/55">{req?.role_label ?? 'Função'}</p>
                <div className="flex flex-wrap gap-1.5 mt-2 text-[11px] font-semibold">
                  {alvo.checkin_at && (
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">🟢 entrou {horario(alvo.checkin_at)}</span>
                  )}
                  {alvo.equipment_code && (
                    <span className="bg-beetz-yellow/40 px-2 py-0.5 rounded-full">💳 {alvo.equipment_code}{alvo.equipment_returned_at ? ' · devolvido' : ''}</span>
                  )}
                  {alvo.checkout_at && (
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">saiu {horario(alvo.checkout_at)}</span>
                  )}
                </div>
              </div>

              {modo === 'entrada' ? (
                <>
                  {alvo.checkin_at && (
                    <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                      Essa pessoa já teve a entrada validada — confirmar de novo só atualiza o equipamento.
                    </p>
                  )}
                  {pedirEquip && (
                    <div>
                      <label className="text-sm font-semibold block mb-1">Equipamento recebido (maquininha)</label>
                      <div className="flex gap-2">
                        <input
                          className="flex-1 border border-beetz-dark/15 rounded-xl px-3 py-2.5 text-base"
                          placeholder="Código do equipamento"
                          value={equip}
                          onChange={(e) => setEquip(e.target.value)}
                        />
                        <button
                          onClick={() => setFase('scan-equip')}
                          className="flex items-center gap-1.5 bg-beetz-dark text-white text-sm font-bold px-3 rounded-xl"
                          title="Ler o QR do equipamento com a câmera"
                        >
                          <Camera size={15} /> Ler QR
                        </button>
                      </div>
                      <p className="text-[11px] text-beetz-dark/45 mt-1">Garçom/caixa recebe maquininha — deixe vazio se essa pessoa não pegou equipamento.</p>
                    </div>
                  )}
                  <button
                    onClick={confirmarEntrada}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-1.5 honey-gradient text-beetz-dark font-bold py-3 rounded-xl disabled:opacity-60"
                  >
                    <Check size={16} /> {busy ? 'Registrando...' : 'Confirmar entrada'}
                  </button>
                </>
              ) : (
                <>
                  {!alvo.checkin_at && (
                    <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                      Essa pessoa não tem entrada registrada neste evento.
                    </p>
                  )}
                  {alvo.equipment_code && !alvo.equipment_returned_at && (
                    <p className="text-sm font-semibold bg-beetz-yellow/20 border border-beetz-yellow/50 rounded-xl px-3 py-2.5">
                      ↩ Devolvendo equipamento <strong>{alvo.equipment_code}</strong>
                    </p>
                  )}
                  <button
                    onClick={confirmarSaida}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-1.5 bg-beetz-dark text-white font-bold py-3 rounded-xl disabled:opacity-60"
                  >
                    <Check size={16} /> {busy ? 'Registrando...' : 'Confirmar saída e devolução'}
                  </button>
                </>
              )}

              <button
                onClick={() => { setAlvo(null); setFase('scan-pessoa'); setErro(null) }}
                className="w-full text-sm font-semibold text-beetz-dark/50 py-2"
              >
                ← Escanear outra pessoa
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

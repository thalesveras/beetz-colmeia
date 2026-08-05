import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, CheckCircle2, ChevronRight } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { enablePushOnThisDevice, isPushEnabledHere, pushSupportedHere } from '../../lib/dataService'

// Pós-cadastro: uma parada única antes do painel pra ligar os avisos push
// deste aparelho (o passo que todo mundo pulava e depois "não fiquei sabendo
// da escala"). Reusa a mesma engrenagem do /alertas — inclusive a dica do
// iPhone, que só recebe push com o app instalado na tela de início.

export default function FirstSteps() {
  const { userId, profile } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'parado' | 'ativando' | 'ativado'>('parado')
  const [erro, setErro] = useState<string | null>(null)
  const suportado = pushSupportedHere()

  // Se este aparelho já está inscrito (ex.: voltou pra página), mostra feito.
  useEffect(() => {
    isPushEnabledHere().then((on) => { if (on) setStatus('ativado') }).catch(() => {})
  }, [])

  async function ativar() {
    if (!userId) return
    setErro(null)
    setStatus('ativando')
    try {
      await enablePushOnThisDevice(userId)
      setStatus('ativado')
    } catch (e) {
      setStatus('parado')
      setErro(e instanceof Error ? e.message : 'Não deu pra ativar agora — dá pra tentar de novo em Avisos.')
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="bg-beetz-dark text-white rounded-3xl p-6 md:p-8 relative overflow-hidden">
        <div className="absolute -right-6 -top-6 text-[110px] leading-none opacity-15 select-none" aria-hidden>🐝</div>
        <p className="text-xs font-semibold uppercase tracking-wider text-beetz-yellow mb-2">Cadastro concluído</p>
        <h1 className="text-2xl md:text-3xl font-extrabold">
          Bem-vindo à colmeia{profile?.first_name ? `, ${profile.first_name}` : ''}! 🎉
        </h1>
        <p className="text-white/70 mt-2 text-sm md:text-base">
          Falta só um passo pra você não perder nada: ativar os avisos neste aparelho.
        </p>
      </div>

      <div className="bg-white rounded-3xl shadow-soft border border-beetz-dark/5 p-6 md:p-8 space-y-5">
        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${status === 'ativado' ? 'bg-green-100' : 'honey-gradient'}`}>
            {status === 'ativado' ? <CheckCircle2 size={22} className="text-green-600" /> : <Bell size={22} className="text-beetz-dark" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold">Ativar avisos no aparelho</p>
            <p className="text-sm text-beetz-dark/60 mt-0.5">
              Escala aprovada, pagamento lançado, aviso da Diretoria — chega aqui na hora, mesmo com o app fechado.
            </p>
            {!suportado && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-2">
                No iPhone, primeiro instale o app: Compartilhar → “Adicionar à Tela de Início”, e ative por lá.
              </p>
            )}
            {erro && <p className="text-xs text-red-600 mt-2">{erro}</p>}
          </div>
        </div>

        {status === 'ativado' ? (
          <p className="text-sm font-semibold text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
            ✅ Avisos ativados neste aparelho! Você pode ajustar o que recebe na página de Avisos.
          </p>
        ) : (
          <button
            onClick={ativar}
            disabled={status === 'ativando' || !suportado}
            className="w-full honey-gradient text-beetz-dark font-bold py-3.5 rounded-xl disabled:opacity-60 active:scale-[0.99] transition-transform"
          >
            {status === 'ativando' ? 'Ativando...' : '🔔 Ativar avisos agora'}
          </button>
        )}

        <Link
          to="/alertas"
          className="flex items-center justify-between text-sm font-semibold text-beetz-dark/70 hover:text-beetz-dark border border-beetz-dark/10 rounded-xl px-4 py-3"
        >
          Escolher o que eu quero receber (página de Avisos)
          <ChevronRight size={16} />
        </Link>
      </div>

      <button
        onClick={() => navigate('/dashboard')}
        className="w-full bg-beetz-dark text-white font-bold py-3.5 rounded-xl hover:bg-black transition-colors"
      >
        {status === 'ativado' ? 'Ir pro painel →' : 'Deixar pra depois e ir pro painel →'}
      </button>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Building2, Save, ShieldCheck, UserRound } from 'lucide-react'
import { getEventFinancialSummary, listEventRepasses, updateEvent } from '../../lib/dataService'
import type { EventFinancialSummary, EventItem, EventRepasse } from '../../lib/types'

// Fechamento como PRESTAÇÃO DE CONTAS, em duas visões (pedido do dono):
// — Visão empresa: o resultado da Beetz no evento (receita − custos = lucro).
// — Visão produtor: o extrato que se apresenta à produtora — vendas, comissão,
//   acertos já feitos e o saldo. Formatada como documento, pronta pra mostrar.
// Os números vêm do mesmo cálculo (getEventFinancialSummary); o que muda é o
// ponto de vista de quem lê.

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dateBR(iso: string) {
  return new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR')
}

interface Props {
  event: EventItem
  onEventUpdated: (updated: EventItem) => void
}

export default function FinancialSummaryCard({ event, onEventUpdated }: Props) {
  const [summary, setSummary] = useState<EventFinancialSummary | null>(null)
  const [repasses, setRepasses] = useState<EventRepasse[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'empresa' | 'produtor'>('empresa')

  const [salesAmount, setSalesAmount] = useState(event.sales_amount)
  const [percentage, setPercentage] = useState(event.commission_percentage)
  const [creditsBonus, setCreditsBonus] = useState(event.credits_bonus)

  async function load() {
    setLoading(true)
    const [s, r] = await Promise.all([getEventFinancialSummary(event.id), listEventRepasses(event.id)])
    setSummary(s)
    setRepasses(r)
    setLoading(false)
  }

  useEffect(() => { load() }, [event.id])
  useEffect(() => {
    setSalesAmount(event.sales_amount)
    setPercentage(event.commission_percentage)
    setCreditsBonus(event.credits_bonus)
  }, [event])

  async function handleSave() {
    setSaving(true)
    const updated = await updateEvent(event.id, {
      sales_amount: salesAmount, commission_percentage: percentage, credits_bonus: creditsBonus
    })
    onEventUpdated(updated)
    await load()
    setSaving(false)
  }

  const toggle = (
    <div className="flex gap-1 bg-black/20 rounded-xl p-1 w-fit">
      <button
        onClick={() => setView('empresa')}
        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
          view === 'empresa' ? 'bg-beetz-yellow text-beetz-dark' : 'text-white/60 hover:text-white'
        }`}
      >
        <Building2 size={13} /> Visão empresa
      </button>
      <button
        onClick={() => setView('produtor')}
        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
          view === 'produtor' ? 'bg-beetz-yellow text-beetz-dark' : 'text-white/60 hover:text-white'
        }`}
      >
        <UserRound size={13} /> Visão produtor
      </button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="bg-beetz-dark text-white rounded-2xl p-5 md:p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-beetz-yellow" />
            <h2 className="font-bold">Fechamento — prestação de contas</h2>
          </div>
          {toggle}
        </div>
        <p className="text-sm text-white/50 mt-2 mb-5">
          {view === 'empresa'
            ? 'O resultado da Beetz neste evento: receita da comissão menos os custos lançados.'
            : 'O extrato do evento do ponto de vista da produtora — pronto pra apresentar no acerto.'}
        </p>

        {view === 'empresa' && (
          <>
            <div className="grid sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-xs text-white/60 block mb-1">Vendas (R$)</label>
                <input type="number" min={0} step="0.01" className={`${inputClass} bg-white/10 border-white/15 text-white`} value={salesAmount} onChange={(e) => setSalesAmount(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1">Percentual da Beetz (%)</label>
                <input type="number" min={0} max={100} step="0.1" className={`${inputClass} bg-white/10 border-white/15 text-white`} value={percentage} onChange={(e) => setPercentage(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1">Créditos ou bonificações (R$)</label>
                <input type="number" step="0.01" className={`${inputClass} bg-white/10 border-white/15 text-white`} value={creditsBonus} onChange={(e) => setCreditsBonus(Number(e.target.value))} />
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60 mb-5"
            >
              <Save size={14} /> {saving ? 'Salvando...' : 'Salvar valores'}
            </button>

            {loading || !summary ? (
              <p className="text-sm text-white/50">Calculando fechamento...</p>
            ) : (
              <div className="pt-4 border-t border-white/10 space-y-1.5">
                <StatementRow label={`Comissão sobre vendas (${summary.percentual}% de ${currency(summary.vendas)})`} value={summary.aReceber} />
                <StatementRow label="Créditos e bonificações" value={summary.creditosOuBonificacoes} />
                <StatementRow label="Despesas do evento" value={-summary.despesas} />
                <StatementRow label="Custo de produtos" value={-summary.custoProdutos} />
                <StatementRow label="Consumo da produção" value={-summary.consumoProducao} />
                <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/15">
                  <span className="font-bold">Lucro do evento</span>
                  <span className={`text-xl font-extrabold ${summary.lucroOuPerda >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {currency(summary.lucroOuPerda)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 pt-4 mt-2 border-t border-white/10 text-sm">
                  <div className="bg-white/5 rounded-xl px-4 py-2.5 flex-1 min-w-[140px]">
                    <p className="text-xs text-white/50">Já acertado com a produtora</p>
                    <p className="font-bold text-beetz-yellow mt-0.5">{currency(summary.repasses)}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl px-4 py-2.5 flex-1 min-w-[140px]">
                    <p className="text-xs text-white/50">Saldo do acerto</p>
                    <p className={`font-bold mt-0.5 ${summary.saldoAReceberDaProdutora > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                      {currency(summary.saldoAReceberDaProdutora)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {view === 'produtor' && (loading || !summary ? (
          <p className="text-sm text-white/50">Montando a prestação de contas...</p>
        ) : (
          // Documento branco de propósito: é a folha que se mostra pra
          // produtora, destacada do painel interno escuro.
          <div className="bg-white text-beetz-dark rounded-2xl p-5 md:p-6">
            <div className="mb-4 pb-4 border-b border-beetz-dark/10">
              <p className="text-[11px] font-bold uppercase tracking-wide text-beetz-dark/40">Prestação de contas</p>
              <p className="font-extrabold text-lg leading-tight mt-0.5">{event.name}</p>
              {event.event_date && <p className="text-xs text-beetz-dark/50 mt-0.5">{dateBR(event.event_date)}</p>}
            </div>

            <div className="space-y-1.5">
              <StatementRowLight label="Vendas totais do evento" value={summary.vendas} />
              <StatementRowLight label={`Comissão Beetz (${summary.percentual}%)`} value={-summary.aReceber} />
              <StatementRowLight label="Créditos e bonificações" value={-summary.creditosOuBonificacoes} />
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-beetz-dark/15">
                <span className="font-bold">Resultado do produtor sobre as vendas</span>
                <span className="text-lg font-extrabold">
                  {currency(summary.vendas - summary.aReceber - summary.creditosOuBonificacoes)}
                </span>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-beetz-dark/10">
              <p className="text-sm font-bold mb-2">Acertos com a Beetz</p>
              {repasses.length === 0 ? (
                <p className="text-xs text-beetz-dark/45">Nenhum acerto lançado ainda.</p>
              ) : (
                <div className="space-y-1">
                  {repasses.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-sm bg-beetz-gray/60 rounded-lg px-3 py-2">
                      <span className="text-beetz-dark/70">
                        {dateBR(r.paid_at)}{r.notes ? ` · ${r.notes}` : ''}
                      </span>
                      <span className="font-semibold">{currency(r.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-beetz-dark/10">
                <span className="text-sm font-semibold text-beetz-dark/70">Saldo pendente do acerto</span>
                <span className={`font-extrabold ${summary.saldoAReceberDaProdutora > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  {currency(summary.saldoAReceberDaProdutora)}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-beetz-dark/35 mt-5">
              Gerado automaticamente a partir dos lançamentos deste evento na Colmeia Beetz.
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatementRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/70">{label}</span>
      <span className={`font-semibold ${value < 0 ? 'text-red-300' : 'text-white'}`}>
        {value < 0 ? `− ${currency(Math.abs(value))}` : currency(value)}
      </span>
    </div>
  )
}

function StatementRowLight({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-beetz-dark/70">{label}</span>
      <span className={`font-semibold ${value < 0 ? 'text-red-600' : ''}`}>
        {value < 0 ? `− ${currency(Math.abs(value))}` : currency(value)}
      </span>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Building2, Save, ShieldCheck, UserRound } from 'lucide-react'
import { getEventFinancialSummary, listEventProducts, listEventRepasses, updateEvent } from '../../lib/dataService'
import type { EventFinancialSummary, EventItem, EventProduct, EventRepasse } from '../../lib/types'

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
  const [eventProducts, setEventProducts] = useState<EventProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'empresa' | 'produtor'>('empresa')

  const [salesAmount, setSalesAmount] = useState(event.sales_amount)
  const [percentage, setPercentage] = useState(event.commission_percentage)
  const [creditsBonus, setCreditsBonus] = useState(event.credits_bonus)
  // Vazio = usa a alíquota padrão de Configurações.
  const [taxPct, setTaxPct] = useState(event.tax_percentage != null ? String(event.tax_percentage) : '')

  async function load() {
    setLoading(true)
    const [s, r, ep] = await Promise.all([
      getEventFinancialSummary(event.id),
      listEventRepasses(event.id),
      listEventProducts(event.id).catch(() => [])
    ])
    setSummary(s)
    setRepasses(r)
    setEventProducts(ep)
    setLoading(false)
  }

  useEffect(() => { load() }, [event.id])
  useEffect(() => {
    setSalesAmount(event.sales_amount)
    setPercentage(event.commission_percentage)
    setCreditsBonus(event.credits_bonus)
    setTaxPct(event.tax_percentage != null ? String(event.tax_percentage) : '')
  }, [event])

  async function handleSave() {
    setSaving(true)
    const updated = await updateEvent(event.id, {
      sales_amount: salesAmount, commission_percentage: percentage, credits_bonus: creditsBonus,
      tax_percentage: taxPct.trim() ? Number(taxPct.replace(',', '.')) : null
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
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
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
              <div>
                <label className="text-xs text-white/60 block mb-1">Imposto (%) — vazio usa o padrão</label>
                <input type="text" inputMode="decimal" placeholder={summary ? `Padrão: ${summary.taxaImposto}%` : 'Padrão'} className={`${inputClass} bg-white/10 border-white/15 text-white`} value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
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
                <StatementRow label={`Impostos (${summary.taxaImposto}% da receita Beetz)`} value={-summary.impostos} />
                <StatementRow label="Despesas do evento" value={-summary.despesas} />
                <StatementRow label="Custo de produtos" value={-summary.custoProdutos} />
                <StatementRow label="Consumo da produção" value={-summary.consumoProducao} />
                <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/15">
                  <span className="font-bold">Lucro do evento</span>
                  <span className={`text-xl font-extrabold ${summary.lucroOuPerda >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {currency(summary.lucroOuPerda)}
                  </span>
                </div>
                {/* Acerto com a produtora — modelo correto: os caixas da Beetz
                    arrecadam, a Beetz fica com a receita dela e o resto é da
                    produtora. Saldo positivo = falta repassar. */}
                <div className="flex flex-wrap gap-3 pt-4 mt-2 border-t border-white/10 text-sm">
                  <div className="bg-white/5 rounded-xl px-4 py-2.5 flex-1 min-w-[140px]">
                    <p className="text-xs text-white/50">Arrecadado pelos caixas</p>
                    <p className="font-bold text-white mt-0.5">{currency(summary.recebimentos)}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl px-4 py-2.5 flex-1 min-w-[140px]">
                    <p className="text-xs text-white/50">Já repassado</p>
                    <p className="font-bold text-beetz-yellow mt-0.5">{currency(summary.repasses)}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl px-4 py-2.5 flex-1 min-w-[140px]">
                    <p className="text-xs text-white/50">Saldo a repassar à produtora</p>
                    <p className={`font-bold mt-0.5 ${summary.saldoAPagarProdutora > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                      {currency(summary.saldoAPagarProdutora)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {view === 'produtor' && (loading || !summary ? (
          <p className="text-sm text-white/50">Montando a prestação de contas...</p>
        ) : (() => {
          // O extrato do produtor no modelo da casa, com cada linha LIGADA na
          // aba de origem — nada digitado duas vezes:
          //   Vendas        ← aba Produtos (Σ vendido × preço); sem vendas lá,
          //                   cai no campo Vendas do fechamento
          //   % do produtor ← 100 − Percentual Beetz
          //   Consumo       ← aba Consumo da produção (desconta do produtor)
          //   Repasses      ← aba Repasses (o que já foi pago)
          //   Saldo         = vendas × % + créditos − consumo − repasses
          const vendasProdutos = eventProducts.reduce((s, p) => s + (p.sold_quantity ?? 0) * (p.sale_price ?? 0), 0)
          const vendasBase = vendasProdutos > 0 ? vendasProdutos : summary.vendas
          const vendasFonte = vendasProdutos > 0 ? 'aba Produtos' : 'campo do fechamento'
          const pctProdutor = Math.max(0, 100 - summary.percentual)
          const valorAReceber = vendasBase * (pctProdutor / 100)
          const saldoAReceber = valorAReceber + summary.creditosOuBonificacoes - summary.consumoProducao - summary.repasses
          return (
          // Documento branco de propósito: é a folha que se mostra pra
          // produtora, destacada do painel interno escuro.
          <div className="bg-white text-beetz-dark rounded-2xl p-5 md:p-6">
            <div className="flex items-start gap-4 mb-4 pb-4 border-b border-beetz-dark/10">
              {event.flyer_url && (
                <img src={event.flyer_url} alt="Flyer" className="w-20 h-20 object-cover rounded-xl border border-beetz-dark/10 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-beetz-dark/40">Fechamento do evento</p>
                <p className="font-extrabold text-lg leading-tight mt-0.5">{event.name}</p>
                <p className="text-xs text-beetz-dark/50 mt-1">
                  {event.event_date ? dateBR(event.event_date) : ''}{event.start_time ? ` · ${event.start_time.slice(0, 5)}` : ''}
                  {event.music_style ? ` · ${event.music_style}` : ''}
                </p>
                {(event.location || event.city) && (
                  <p className="text-xs text-beetz-dark/50">📍 {[event.location, event.city].filter(Boolean).join(', ')}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <StatementRowLight label={`Vendas (${vendasFonte})`} value={vendasBase} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-beetz-dark/70">Percentual do produtor</span>
                <span className="font-semibold">{pctProdutor}%</span>
              </div>
              <StatementRowLight label={`Valor a receber (${pctProdutor}% de ${currency(vendasBase)})`} value={valorAReceber} />
              <StatementRowLight label="Créditos ou bonificações" value={summary.creditosOuBonificacoes} />
              <StatementRowLight label="Consumo da produção (aba Consumo)" value={-summary.consumoProducao} />
              <StatementRowLight label="Repasses já pagos (aba Repasses)" value={-summary.repasses} />
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-beetz-dark/15">
                <span className="font-bold">Saldo a receber</span>
                <span className={`text-xl font-extrabold ${saldoAReceber >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {currency(saldoAReceber)}
                </span>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-beetz-dark/10">
              <p className="text-sm font-bold mb-2">Repasses já recebidos da Beetz</p>
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
            </div>

            <p className="text-[11px] text-beetz-dark/35 mt-5">
              Gerado automaticamente a partir dos lançamentos deste evento na Colmeia Beetz.
            </p>
          </div>
          )
        })())}
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

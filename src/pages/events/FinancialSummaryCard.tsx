import { useEffect, useState } from 'react'
import { Plus, Save, ShieldCheck, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  createEventRepasse, deleteEventRepasse, getEventFinancialSummary, listEventRepasses, updateEvent
} from '../../lib/dataService'
import type { EventFinancialSummary, EventItem, EventRepasse } from '../../lib/types'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface Props {
  event: EventItem
  onEventUpdated: (updated: EventItem) => void
}

export default function FinancialSummaryCard({ event, onEventUpdated }: Props) {
  const { userId } = useAuth()
  const [summary, setSummary] = useState<EventFinancialSummary | null>(null)
  const [repasses, setRepasses] = useState<EventRepasse[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [salesAmount, setSalesAmount] = useState(event.sales_amount)
  const [percentage, setPercentage] = useState(event.commission_percentage)
  const [creditsBonus, setCreditsBonus] = useState(event.credits_bonus)

  // Novo lançamento de repasse (ledger event_repasses)
  const [newAmount, setNewAmount] = useState(0)
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10))
  const [newNotes, setNewNotes] = useState('')
  const [savingRepasse, setSavingRepasse] = useState(false)
  const [deletingRepasseId, setDeletingRepasseId] = useState<string | null>(null)

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

  async function handleAddRepasse(e: React.FormEvent) {
    e.preventDefault()
    if (newAmount <= 0) return
    setSavingRepasse(true)
    await createEventRepasse({
      event_id: event.id, amount: newAmount, paid_at: newDate, notes: newNotes.trim() || null, created_by: userId ?? null
    })
    setSavingRepasse(false)
    setNewAmount(0)
    setNewDate(new Date().toISOString().slice(0, 10))
    setNewNotes('')
    load()
  }

  async function handleDeleteRepasse(id: string) {
    setDeletingRepasseId(id)
    await deleteEventRepasse(id)
    setDeletingRepasseId(null)
    load()
  }

  return (
    <div className="bg-beetz-dark text-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={18} className="text-beetz-yellow" />
        <h2 className="font-bold">Fechamento — visão diretoria</h2>
      </div>
      <p className="text-sm text-white/50 mb-5">
        Vendas, percentual e créditos são entradas manuais. Repasses agora é um ledger de lançamentos
        (abaixo). Os demais valores são calculados a partir das despesas, produtos e consumo da produção
        lançados neste evento.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <div>
          <label className="text-xs text-white/60 block mb-1">Vendas (R$)</label>
          <input type="number" min={0} step="0.01" className={`${inputClass} bg-white/10 border-white/15 text-white`} value={salesAmount} onChange={(e) => setSalesAmount(Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-white/60 block mb-1">Percentual (%)</label>
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
        className="flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60 mb-6"
      >
        <Save size={14} /> {saving ? 'Salvando...' : 'Salvar valores'}
      </button>

      <div className="bg-white/5 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm">Repasses à produtora</h3>
          <span className="font-bold text-beetz-yellow">{currency(summary?.repasses ?? 0)}</span>
        </div>

        {loading ? (
          <p className="text-sm text-white/50">Carregando lançamentos...</p>
        ) : (
          <div className="space-y-2 mb-4">
            {repasses.map((r) => (
              <div key={r.id} className="flex items-center gap-3 bg-white/10 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{currency(r.amount)}</p>
                  <p className="text-xs text-white/50 truncate">{formatDate(r.paid_at)}{r.notes ? ` · ${r.notes}` : ''}</p>
                </div>
                <button
                  onClick={() => handleDeleteRepasse(r.id)}
                  disabled={deletingRepasseId === r.id}
                  className="text-white/40 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {repasses.length === 0 && <p className="text-sm text-white/40">Nenhum repasse lançado ainda.</p>}
          </div>
        )}

        <form onSubmit={handleAddRepasse} className="grid sm:grid-cols-[1fr_1fr_2fr_auto] gap-2 items-end">
          <div>
            <label className="text-xs text-white/60 block mb-1">Valor (R$)</label>
            <input type="number" min={0.01} step="0.01" className={`${inputClass} bg-white/10 border-white/15 text-white`} value={newAmount || ''} onChange={(e) => setNewAmount(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs text-white/60 block mb-1">Data</label>
            <input type="date" className={`${inputClass} bg-white/10 border-white/15 text-white`} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-white/60 block mb-1">Observações</label>
            <input className={`${inputClass} bg-white/10 border-white/15 text-white`} value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Opcional" />
          </div>
          <button
            type="submit"
            disabled={savingRepasse || newAmount <= 0}
            className="flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60 h-fit"
          >
            <Plus size={14} /> {savingRepasse ? 'Salvando...' : 'Lançar'}
          </button>
        </form>
      </div>

      {loading || !summary ? (
        <p className="text-sm text-white/50">Calculando fechamento...</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-5 border-t border-white/10">
          <SummaryTile label="Despesas do evento" value={summary.despesas} />
          <SummaryTile label="Custo de produtos" value={summary.custoProdutos} />
          <SummaryTile label="Consumo da produção" value={summary.consumoProducao} />
          <SummaryTile label="A receber" value={summary.aReceber} />
          <SummaryTile label="Saldo a receber da produtora" value={summary.saldoAReceberDaProdutora} />
          <SummaryTile
            label="Lucro ou perda"
            value={summary.lucroOuPerda}
            highlight={summary.lucroOuPerda >= 0 ? 'positive' : 'negative'}
          />
        </div>
      )}
    </div>
  )
}

function SummaryTile({ label, value, highlight }: { label: string; value: number; highlight?: 'positive' | 'negative' }) {
  const color = highlight === 'positive' ? 'text-green-400' : highlight === 'negative' ? 'text-red-400' : 'text-beetz-yellow'
  return (
    <div className="bg-white/5 rounded-xl p-4">
      <p className="text-xs text-white/50">{label}</p>
      <p className={`font-bold text-lg mt-1 ${color}`}>{currency(value)}</p>
    </div>
  )
}

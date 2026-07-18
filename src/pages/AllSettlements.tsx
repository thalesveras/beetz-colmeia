import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpDown, ClipboardList } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getEventFinancialSummary, listEvents } from '../lib/dataService'
import type { EventFinancialSummary, EventItem } from '../lib/types'
import { canViewFinancialSummary } from '../lib/permissions'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface Row {
  event: EventItem
  summary: EventFinancialSummary
}

type SortDir = 'asc' | 'desc'

export default function AllSettlements() {
  const { accessRole } = useAuth()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  async function load() {
    setLoading(true)
    const events = await listEvents()
    const summaries = await Promise.all(events.map((ev) => getEventFinancialSummary(ev.id)))
    setRows(events.map((event, i) => ({ event, summary: summaries[i] })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => dir * (a.event.event_date < b.event.event_date ? -1 : 1))
  }, [rows, sortDir])

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        vendas: acc.vendas + r.summary.vendas,
        despesas: acc.despesas + r.summary.despesas,
        custoProdutos: acc.custoProdutos + r.summary.custoProdutos,
        consumoProducao: acc.consumoProducao + r.summary.consumoProducao,
        repasses: acc.repasses + r.summary.repasses,
        aReceber: acc.aReceber + r.summary.aReceber,
        saldoAPagarProdutora: acc.saldoAPagarProdutora + r.summary.saldoAPagarProdutora,
        lucroOuPerda: acc.lucroOuPerda + r.summary.lucroOuPerda
      }),
      { vendas: 0, despesas: 0, custoProdutos: 0, consumoProducao: 0, repasses: 0, aReceber: 0, saldoAPagarProdutora: 0, lucroOuPerda: 0 }
    )
  }, [rows])

  if (!canViewFinancialSummary(accessRole)) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold mb-1">Acesso restrito</h1>
        <p className="text-sm text-beetz-dark/60">Essa área é exclusiva para a Diretoria.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-2">
          <ClipboardList size={26} /> Todos os fechamentos
        </h1>
        <p className="text-beetz-dark/60 mt-1">Resumo financeiro (visão diretoria) de todos os eventos, lado a lado.</p>
      </div>

      {loading ? (
        <p className="text-beetz-dark/50 text-sm">Calculando fechamentos de todos os eventos...</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-beetz-dark/10 text-left">
                <th className="p-3 cursor-pointer select-none" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                  <span className="flex items-center gap-1">Evento <ArrowUpDown size={12} className="text-beetz-dark/30" /></span>
                </th>
                <th className="p-3 text-right">Vendas</th>
                <th className="p-3 text-right">Despesas</th>
                <th className="p-3 text-right">Custo produtos</th>
                <th className="p-3 text-right">Consumo produção</th>
                <th className="p-3 text-right">Repasses</th>
                <th className="p-3 text-right">A receber</th>
                <th className="p-3 text-right">Saldo a repassar</th>
                <th className="p-3 text-right">Lucro/perda</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(({ event, summary }) => (
                <tr key={event.id} className="border-b border-beetz-dark/5 last:border-0">
                  <td className="p-3">
                    <Link to={`/eventos/${event.id}`} className="font-semibold hover:text-beetz-yellow transition-colors">{event.name}</Link>
                    <p className="text-xs text-beetz-dark/50">{formatDate(event.event_date)}</p>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(summary.vendas)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(summary.despesas)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(summary.custoProdutos)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(summary.consumoProducao)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(summary.repasses)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(summary.aReceber)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(summary.saldoAPagarProdutora)}</td>
                  <td className={`p-3 text-right font-bold whitespace-nowrap ${summary.lucroOuPerda >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {currency(summary.lucroOuPerda)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-beetz-dark/50">Nenhum evento cadastrado.</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-beetz-dark/10 bg-beetz-gray/50 font-bold">
                  <td className="p-3">Total</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(totals.vendas)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(totals.despesas)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(totals.custoProdutos)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(totals.consumoProducao)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(totals.repasses)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(totals.aReceber)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{currency(totals.saldoAPagarProdutora)}</td>
                  <td className={`p-3 text-right whitespace-nowrap ${totals.lucroOuPerda >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {currency(totals.lucroOuPerda)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

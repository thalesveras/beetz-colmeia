import { useEffect, useState } from 'react'
import {
  ArrowLeftRight, BarChart3, ClipboardList, HandCoins, Package, Receipt, Users, Wallet
} from 'lucide-react'
import {
  getEventFinancialSummary, listCashierSettlementsForEvent, listEventProducts,
  listEventRepasses, listEventStaffingApplications, listEventStaffingRequirements,
  listExpensesForEvent, listProductionConsumption, listStockMovements
} from '../../lib/dataService'
import type { EventFinancialSummary } from '../../lib/types'

// Aba Resumo: o evento inteiro em números, num olhar só — pensada pro celular
// do líder no meio da operação. Cada cartão é um atalho: toca e cai na aba
// certa. Os números respeitam as mesmas permissões das abas (quem não vê
// financeiro não vê lucro aqui tampouco).

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface Props {
  eventId: string
  canExpenses: boolean
  canCashier: boolean
  canStock: boolean
  canFinance: boolean
  onNavigate: (tab: string) => void
}

interface Numbers {
  vagas: number
  confirmados: number
  custoEscala: number
  despesasTotal: number
  despesasPendentes: number
  temDespesas: boolean
  recebimentosTotal: number
  caixas: number
  produtosItens: number
  produtosTotal: number
  enviadoUn: number
  devolvidoUn: number
  consumoTotal: number
  repassesTotal: number
  repassesLancamentos: number
  fin: EventFinancialSummary | null
}

export default function EventResumoTab({ eventId, canExpenses, canCashier, canStock, canFinance, onNavigate }: Props) {
  const [nums, setNums] = useState<Numbers | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [reqs, apps, expenses, settlements, products, movements, consumption, repasses, fin] = await Promise.all([
          listEventStaffingRequirements(eventId),
          listEventStaffingApplications(eventId),
          canExpenses ? listExpensesForEvent(eventId) : Promise.resolve([]),
          canCashier ? listCashierSettlementsForEvent(eventId) : Promise.resolve([]),
          canStock ? listEventProducts(eventId) : Promise.resolve([]),
          canStock ? listStockMovements(eventId) : Promise.resolve([]),
          canStock ? listProductionConsumption(eventId) : Promise.resolve([]),
          canFinance ? listEventRepasses(eventId) : Promise.resolve([]),
          canFinance ? getEventFinancialSummary(eventId) : Promise.resolve(null)
        ])
        if (!alive) return
        const confirmed = apps.filter((a) => a.status === 'Confirmado')
        const reqById = new Map(reqs.map((r) => [r.id, r]))
        const custoEscala = confirmed.reduce((sum, a) => {
          const req = reqById.get(a.requirement_id)
          return sum + (a.agreed_value ?? req?.unit_cost ?? 0)
        }, 0)
        const ativos = movements.filter((m) => m.status === 'Ativo')
        setNums({
          vagas: reqs.reduce((s, r) => s + r.quantity, 0),
          confirmados: confirmed.length,
          custoEscala,
          despesasTotal: expenses.filter((e) => e.status !== 'Cancelado').reduce((s2, e) => s2 + e.total, 0),
          despesasPendentes: expenses.filter((e) => e.status === 'Pendente').length,
          temDespesas: canExpenses,
          recebimentosTotal: settlements.reduce((s, x) => s + x.total, 0),
          caixas: settlements.length,
          produtosItens: products.length,
          produtosTotal: products.reduce((s, p) => s + p.total, 0),
          // Bug antigo: comparava com 'Envio'/'Devolução' truncados (tipos
          // reais: 'Envio para Evento'/'Devolução do Evento') — contadores
          // ficavam sempre em zero. Entradas diretas no almoxarifado do
          // evento também contam como "enviado" agora.
          enviadoUn: ativos.filter((m) => ['Envio para Evento', 'Entrada', 'Compra', 'Ajuste (entrada)'].includes(m.movement_type)).reduce((s, m) => s + m.quantity, 0),
          devolvidoUn: ativos.filter((m) => m.movement_type === 'Devolução do Evento').reduce((s, m) => s + m.quantity, 0),
          consumoTotal: consumption.reduce((s, c) => s + c.total_cost, 0),
          repassesTotal: repasses.reduce((s, r) => s + r.amount, 0),
          repassesLancamentos: repasses.length,
          fin
        })
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Erro ao carregar o resumo.')
      }
    }
    load()
    return () => { alive = false }
  }, [eventId, canExpenses, canCashier, canStock, canFinance])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!nums) return <p className="text-sm text-beetz-dark/50">Montando o resumo...</p>

  const cardClass = 'bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5 flex flex-col items-start gap-2 text-left hover:shadow-glow active:scale-[0.98] transition min-h-[110px] w-full'
  const chip = 'bg-beetz-yellow/25 rounded-xl p-2'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <button onClick={() => onNavigate('equipe')} className={cardClass}>
          <span className={chip}><Users size={18} /></span>
          <span className="font-extrabold text-lg leading-none">{nums.confirmados}<span className="text-beetz-dark/35 text-sm font-semibold"> / {nums.vagas || '—'}</span></span>
          <span className="text-xs text-beetz-dark/50 leading-tight">
            Equipe confirmada{nums.custoEscala > 0 ? ` · escala ${brl(nums.custoEscala)}` : ''}
          </span>
        </button>

        {nums.temDespesas && (
          <button onClick={() => onNavigate('despesas')} className={cardClass}>
            <span className={chip}><Wallet size={18} /></span>
            <span className="font-extrabold text-lg leading-none">{brl(nums.despesasTotal)}</span>
            <span className="text-xs text-beetz-dark/50 leading-tight">
              Despesas{nums.despesasPendentes > 0 ? ` · ${nums.despesasPendentes} pendente${nums.despesasPendentes > 1 ? 's' : ''}` : ''}
            </span>
          </button>
        )}

        {canCashier && (
          <button onClick={() => onNavigate('recebimentos')} className={cardClass}>
            <span className={chip}><HandCoins size={18} /></span>
            <span className="font-extrabold text-lg leading-none">{brl(nums.recebimentosTotal)}</span>
            <span className="text-xs text-beetz-dark/50 leading-tight">Recebimentos · {nums.caixas} caixa{nums.caixas === 1 ? '' : 's'}</span>
          </button>
        )}

        {canStock && (
          <button onClick={() => onNavigate('produtos')} className={cardClass}>
            <span className={chip}><Package size={18} /></span>
            <span className="font-extrabold text-lg leading-none">{nums.produtosItens}</span>
            <span className="text-xs text-beetz-dark/50 leading-tight">
              Produtos do evento{nums.produtosTotal > 0 ? ` · ${brl(nums.produtosTotal)}` : ''}
            </span>
          </button>
        )}

        {canStock && (
          <button onClick={() => onNavigate('estoque')} className={cardClass}>
            <span className={chip}><ArrowLeftRight size={18} /></span>
            <span className="font-extrabold text-lg leading-none">{nums.enviadoUn}<span className="text-beetz-dark/35 text-sm font-semibold"> un</span></span>
            <span className="text-xs text-beetz-dark/50 leading-tight">Enviado pro evento · {nums.devolvidoUn} un devolvidas</span>
          </button>
        )}

        {canStock && (
          <button onClick={() => onNavigate('consumo')} className={cardClass}>
            <span className={chip}><ClipboardList size={18} /></span>
            <span className="font-extrabold text-lg leading-none">{brl(nums.consumoTotal)}</span>
            <span className="text-xs text-beetz-dark/50 leading-tight">Consumo da produção</span>
          </button>
        )}

        {canFinance && (
          <button onClick={() => onNavigate('repasses')} className={cardClass}>
            <span className={chip}><Receipt size={18} /></span>
            <span className="font-extrabold text-lg leading-none">{brl(nums.repassesTotal)}</span>
            <span className="text-xs text-beetz-dark/50 leading-tight">
              Repasses · {nums.repassesLancamentos} lançamento{nums.repassesLancamentos === 1 ? '' : 's'}
            </span>
          </button>
        )}

        {canFinance && nums.fin && (
          <button onClick={() => onNavigate('fechamentos')} className={cardClass}>
            <span className={chip}><BarChart3 size={18} /></span>
            <span className={`font-extrabold text-lg leading-none ${nums.fin.saldoAPagarProdutora > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {brl(nums.fin.saldoAPagarProdutora)}
            </span>
            <span className="text-xs text-beetz-dark/50 leading-tight">Saldo a repassar à produtora</span>
          </button>
        )}
      </div>

      {/* Lucro fecha a página: primeiro os pedaços da operação, no fim a
          conta que eles somam — leitura de cima pra baixo termina no veredito. */}
      {canFinance && nums.fin && (
        <button onClick={() => onNavigate('fechamentos')} className="w-full bg-beetz-dark text-white rounded-2xl p-5 shadow-soft flex flex-wrap items-center gap-4 text-left active:scale-[0.99] transition">
          <div className="bg-beetz-yellow/20 text-beetz-yellow rounded-xl p-2.5"><BarChart3 size={22} /></div>
          <div className="flex-1 min-w-[150px]">
            <p className={`text-2xl font-extrabold leading-none ${nums.fin.lucroOuPerda >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {brl(nums.fin.lucroOuPerda)}
            </p>
            <p className="text-xs text-white/50 mt-1.5">Lucro do evento (visão empresa) · toque pra ver a prestação de contas</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-beetz-yellow">{brl(nums.fin.aReceber + nums.fin.creditosOuBonificacoes)}</p>
            <p className="text-[11px] text-white/40">receita da Beetz</p>
          </div>
        </button>
      )}
    </div>
  )
}

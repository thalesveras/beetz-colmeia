import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Filter, Plus, Search, ShieldCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { canViewFinancialSummary } from '../lib/permissions'
import { createProducer, listProducers } from '../lib/dataService'
import type { Producer, ProducerStatus } from '../lib/types'
import ProducerFormModal from '../components/producers/ProducerFormModal'

const inputClass = 'rounded-xl border border-beetz-dark/15 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

const STATUS_STYLES: Record<ProducerStatus, string> = {
  Ativo: 'bg-green-100 text-green-700',
  Inativo: 'bg-beetz-dark/10 text-beetz-dark/50',
  Bloqueado: 'bg-red-100 text-red-700'
}

// Cadastro das produtoras parceiras. Antes o produtor só existia se ele mesmo
// criasse conta no portal — então o evento guardava o nome como texto livre e
// cada digitação virava um "produtor" novo ("ACONTECE PRODUÇÕES" e "acontece
// produ" eram dois). Agora a ficha é cadastrada aqui e o evento aponta pra ela.
export default function Producers() {
  const { accessRole, userId } = useAuth()
  const [producers, setProducers] = useState<Producer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setProducers(await listProducers())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar produtores.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return producers.filter((p) => {
      if (statusFilter && (p.status ?? 'Ativo') !== statusFilter) return false
      if (!q) return true
      return `${p.name} ${p.company_name ?? ''} ${p.email} ${p.cpf_cnpj ?? ''}`.toLowerCase().includes(q)
    })
  }, [producers, search, statusFilter])

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-2">
            <Building2 size={24} /> Produtoras
          </h1>
          <p className="text-beetz-dark/60 mt-1">Quem faz evento com a Beetz — ficha, histórico e números.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-4 py-2.5 rounded-xl text-sm"
        >
          <Plus size={15} /> Nova produtora
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-beetz-dark/30" />
          <input
            placeholder="Buscar por nome, empresa, e-mail ou CPF/CNPJ"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} w-full pl-9`}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
          <option value="">Todos os status</option>
          <option value="Ativo">Ativo</option>
          <option value="Inativo">Inativo</option>
          <option value="Bloqueado">Bloqueado</option>
        </select>
      </div>

      {loading ? (
        <p className="text-beetz-dark/50">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-beetz-dark/5">
          <p className="text-sm text-beetz-dark/50">
            {producers.length === 0
              ? 'Nenhuma produtora cadastrada ainda. Cadastre as que já trabalham com vocês pra parar de digitar o nome solto no evento.'
              : 'Nenhuma produtora com esses filtros.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-beetz-dark/40">{filtered.length} de {producers.length}</p>
          <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
            {filtered.map((p) => {
              const status = (p.status ?? 'Ativo') as ProducerStatus
              return (
                <Link
                  key={p.id}
                  to={`/produtoras/${p.id}`}
                  className="flex flex-wrap items-center gap-3 p-4 hover:bg-beetz-gray/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl honey-gradient flex items-center justify-center shrink-0 font-bold text-sm text-beetz-dark">
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-semibold text-sm">
                      {p.name}
                      {p.company_name && <span className="text-beetz-dark/40 font-normal"> · {p.company_name}</span>}
                    </p>
                    <p className="text-xs text-beetz-dark/45">{p.email}{p.phone ? ` · ${p.phone}` : ''}</p>
                  </div>
                  {/* Quem já tem login enxerga os próprios eventos no portal —
                      vale sinalizar, porque muda o que a pessoa vê. */}
                  {p.auth_user_id && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-beetz-dark/40" title="Já tem acesso ao portal do produtor">
                      <ShieldCheck size={11} /> portal
                    </span>
                  )}
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[status]}`}>
                    {status}
                  </span>
                </Link>
              )
            })}
          </div>
        </>
      )}

      {creating && (
        <ProducerFormModal
          onClose={() => setCreating(false)}
          onSave={async (data) => {
            await createProducer(data, userId ?? null)
            await load()
          }}
        />
      )}
    </div>
  )
}

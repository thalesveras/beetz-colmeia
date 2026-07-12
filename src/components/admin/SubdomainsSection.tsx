import { useEffect, useState } from 'react'
import { Globe, Trash2 } from 'lucide-react'
import { createDnsSubdomain, deleteDnsSubdomain, listDnsSubdomains } from '../../lib/dataService'
import type { DnsRecordType, DnsSubdomain } from '../../lib/types'

const inputClass = 'rounded-xl border border-beetz-dark/15 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const ZONE_NAME = 'beetz.bar'

// Cria de verdade um registro de DNS no Cloudflare (via edge function
// manage-subdomain, que segura o token) pra apontar um subdomínio novo —
// ex: app.beetz.bar -> beetz-colmeia.netlify.app. Precisa dos secrets
// CLOUDFLARE_API_TOKEN e CLOUDFLARE_ZONE_ID cadastrados no projeto Supabase.
export default function SubdomainsSection() {
  const [subdomains, setSubdomains] = useState<DnsSubdomain[]>([])
  const [loading, setLoading] = useState(true)

  const [newPrefix, setNewPrefix] = useState('')
  const [newTargetType, setNewTargetType] = useState<DnsRecordType>('CNAME')
  const [newTargetValue, setNewTargetValue] = useState('')
  const [newProxied, setNewProxied] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setSubdomains(await listDnsSubdomains())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newPrefix.trim() || !newTargetValue.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      await createDnsSubdomain({
        subdomain: newPrefix.trim().toLowerCase(),
        target_type: newTargetType,
        target_value: newTargetValue.trim(),
        proxied: newProxied
      })
      setNewPrefix(''); setNewTargetValue(''); setNewTargetType('CNAME'); setNewProxied(true)
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao criar subdomínio.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(record: DnsSubdomain) {
    setDeletingId(record.id)
    try {
      await deleteDnsSubdomain(record)
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao apagar subdomínio.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <h2 className="font-bold mb-1 flex items-center gap-2"><Globe size={18} /> Subdomínios (beetz.bar)</h2>
      <p className="text-xs text-beetz-dark/50 mb-3">
        Cria o registro de DNS de verdade no Cloudflare. Precisa dos secrets <code className="bg-beetz-gray px-1.5 py-0.5 rounded">CLOUDFLARE_API_TOKEN</code> e{' '}
        <code className="bg-beetz-gray px-1.5 py-0.5 rounded">CLOUDFLARE_ZONE_ID</code> cadastrados no Supabase — sem isso, a criação retorna erro.
      </p>

      <form onSubmit={handleCreate} className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 p-5 space-y-3 mb-4">
        <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-center">
          <div className="flex items-center gap-2">
            <input
              placeholder="app" value={newPrefix} onChange={(e) => setNewPrefix(e.target.value)}
              className={`${inputClass} flex-1`}
            />
            <span className="text-sm text-beetz-dark/50 whitespace-nowrap">.{ZONE_NAME}</span>
          </div>
          <select value={newTargetType} onChange={(e) => setNewTargetType(e.target.value as DnsRecordType)} className={inputClass}>
            <option value="CNAME">CNAME</option>
            <option value="A">A</option>
          </select>
        </div>
        <input
          placeholder={newTargetType === 'CNAME' ? 'ex: beetz-colmeia.netlify.app' : 'ex: 192.0.2.1'}
          value={newTargetValue} onChange={(e) => setNewTargetValue(e.target.value)}
          className={`${inputClass} w-full`}
        />
        <label className="flex items-center gap-2 text-sm text-beetz-dark/70">
          <input type="checkbox" checked={newProxied} onChange={(e) => setNewProxied(e.target.checked)} />
          Proxy do Cloudflare ativo (nuvem laranja — recomendado)
        </label>
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <button
          type="submit" disabled={saving || !newPrefix.trim() || !newTargetValue.trim()}
          className="honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60"
        >
          {saving ? 'Criando...' : 'Criar subdomínio'}
        </button>
      </form>

      {loading ? (
        <p className="text-beetz-dark/50 text-sm">Carregando...</p>
      ) : subdomains.length === 0 ? (
        <p className="text-sm text-beetz-dark/50 bg-white rounded-2xl p-6 text-center border border-beetz-dark/5">Nenhum subdomínio cadastrado ainda.</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
          {subdomains.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 p-4">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                s.status === 'Ativo' ? 'bg-green-100 text-green-700' : s.status === 'Erro' ? 'bg-red-100 text-red-700' : 'bg-beetz-dark/10 text-beetz-dark/50'
              }`}>
                {s.status}
              </span>
              <div className="flex-1 min-w-[220px]">
                <p className="font-semibold text-sm">{s.subdomain}.{ZONE_NAME}</p>
                <p className="text-xs text-beetz-dark/50">
                  {s.target_type} → {s.target_value} {s.proxied ? '· proxy ativo' : '· proxy desligado'}
                  {s.error_message ? ` · ${s.error_message}` : ''}
                </p>
              </div>
              <button
                onClick={() => handleDelete(s)}
                disabled={deletingId === s.id}
                className="text-beetz-dark/40 hover:text-red-600 p-1.5 rounded-lg hover:bg-beetz-gray disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

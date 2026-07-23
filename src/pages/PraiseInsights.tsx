import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { canViewPraiseInsights } from '../lib/permissions'
import { listAllCompliments, listAllHoneyPoints, listProfilesLite } from '../lib/dataService'
import type { Compliment, HoneyPoint, Profile } from '../lib/types'
import Avatar from '../components/ui/Avatar'

// Gestão → Elogios: o panorama do reconhecimento da equipe, pra Diretoria
// entender as pessoas — quem é lembrado, quem lembra dos outros e (o mais
// importante) quem está passando despercebido. Nasce interno; abrir pra
// outros cargos é a flag can_view_praise_insights na matriz de permissões.

type Periodo = 30 | 90 | 0 // 0 = tudo

export default function PraiseInsights() {
  const { accessRole } = useAuth()
  const [compliments, setCompliments] = useState<Compliment[]>([])
  const [honey, setHoney] = useState<HoneyPoint[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<Periodo>(0)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    Promise.all([listAllCompliments(), listAllHoneyPoints(), listProfilesLite()])
      .then(([c, h, p]) => { setCompliments(c); setHoney(h); setProfiles(p) })
      .finally(() => setLoading(false))
  }, [])

  const nome = (id: string | null) => {
    const p = profiles.find((pr) => pr.id === id)
    if (!p) return 'Alguém da colmeia'
    const n = [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
    return n || 'Sem nome (perfil incompleto)'
  }

  const corte = useMemo(() => {
    if (!periodo) return null
    const d = new Date()
    d.setDate(d.getDate() - periodo)
    return d.toISOString()
  }, [periodo])

  const elogios = useMemo(() => corte ? compliments.filter((c) => c.created_at >= corte) : compliments, [compliments, corte])
  const meis = useMemo(() => corte ? honey.filter((h) => h.created_at >= corte) : honey, [honey, corte])

  // Placar por pessoa: recebido e enviado, elogios e mel separados —
  // somar coisas diferentes numa nota única esconde mais do que mostra.
  const placar = useMemo(() => {
    const m = new Map<string, { elogiosRec: number; melRec: number; elogiosEnv: number; melEnv: number }>()
    const de = (id: string | null) => {
      if (!id) return null
      if (!m.has(id)) m.set(id, { elogiosRec: 0, melRec: 0, elogiosEnv: 0, melEnv: 0 })
      return m.get(id)!
    }
    for (const c of elogios) {
      const r = de(c.to_profile_id); if (r) r.elogiosRec++
      const s = de(c.from_profile_id); if (s) s.elogiosEnv++
    }
    for (const h of meis) {
      const r = de(h.to_profile_id); if (r) r.melRec += h.amount ?? 0
      const s = de(h.from_profile_id); if (s) s.melEnv += h.amount ?? 0
    }
    return m
  }, [elogios, meis])

  const ranking = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    return [...placar.entries()]
      .map(([id, p]) => ({ id, ...p }))
      .filter((r) => !busca.trim() || norm(nome(r.id)).includes(norm(busca)))
      .sort((a, b) => (b.elogiosRec - a.elogiosRec) || (b.melRec - a.melRec) || (b.elogiosEnv - a.elogiosEnv))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placar, busca, profiles])

  // O ouro da gestão: quem está na equipe e NÃO recebeu nada no período.
  const semReconhecimento = useMemo(() => {
    return profiles
      .filter((p) => p.approval_status === 'Aprovado')
      .filter((p) => [p.first_name, p.last_name].filter(Boolean).length > 0)
      .filter((p) => {
        const s = placar.get(p.id)
        return !s || (s.elogiosRec === 0 && s.melRec === 0)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, placar])

  // Linha do tempo misturada: elogio carrega mensagem, mel carrega motivo.
  const timeline = useMemo(() => {
    const items = [
      ...elogios.map((c) => ({ kind: 'elogio' as const, at: c.created_at, from: c.from_profile_id, to: c.to_profile_id, texto: c.message, qtd: 0 })),
      ...meis.map((h) => ({ kind: 'mel' as const, at: h.created_at, from: h.from_profile_id, to: h.to_profile_id, texto: h.reason ?? '', qtd: h.amount ?? 0 }))
    ]
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60)
  }, [elogios, meis])

  const kpi = useMemo(() => ({
    elogios: elogios.length,
    mel: meis.reduce((s, h) => s + (h.amount ?? 0), 0),
    alcancadas: new Set([...elogios.map((c) => c.to_profile_id), ...meis.map((h) => h.to_profile_id)].filter(Boolean)).size,
    participantes: new Set([...elogios.map((c) => c.from_profile_id), ...meis.map((h) => h.from_profile_id)].filter(Boolean)).size
  }), [elogios, meis])

  const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  if (!canViewPraiseInsights(accessRole)) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-sm text-beetz-dark/60 bg-beetz-gray rounded-2xl p-5">
          Esta página é do time de gestão. Se você precisa dela, fale com a Diretoria —
          a permissão se chama “Ver panorama de elogios”.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><Heart className="text-beetz-yellow" size={24} /> Elogios da Colmeia</h1>
          <p className="text-sm text-beetz-dark/50 mt-1">
            Quem é lembrado, quem lembra dos outros — e quem merece um olhar da gestão.
          </p>
        </div>
        <div className="flex gap-1.5">
          {([[30, '30 dias'], [90, '90 dias'], [0, 'Tudo']] as [Periodo, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setPeriodo(v)}
              className={`text-xs font-bold px-3 py-2 rounded-xl border transition-colors ${
                periodo === v ? 'bg-beetz-dark text-white border-beetz-dark' : 'bg-white text-beetz-dark/60 border-beetz-dark/15'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-beetz-dark/40 p-6">Carregando o mel da colmeia...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-beetz-dark text-white rounded-2xl p-4">
              <p className="text-2xl font-extrabold">{kpi.elogios}</p>
              <p className="text-xs text-white/50">elogios escritos</p>
            </div>
            <div className="bg-beetz-dark text-white rounded-2xl p-4">
              <p className="text-2xl font-extrabold">🍯 {kpi.mel}</p>
              <p className="text-xs text-white/50">mel doado</p>
            </div>
            <div className="bg-beetz-gray rounded-2xl p-4">
              <p className="text-2xl font-extrabold">{kpi.alcancadas}</p>
              <p className="text-xs text-beetz-dark/50">pessoas reconhecidas</p>
            </div>
            <div className="bg-beetz-gray rounded-2xl p-4">
              <p className="text-2xl font-extrabold">{kpi.participantes}</p>
              <p className="text-xs text-beetz-dark/50">pessoas que reconheceram</p>
            </div>
          </div>

          {semReconhecimento.length > 0 && (
            <div className="bg-beetz-yellow/15 border border-beetz-yellow/40 rounded-2xl p-4">
              <p className="text-sm font-bold text-beetz-dark mb-1">
                Radar do cuidado · {semReconhecimento.length} pessoa(s) sem nenhum reconhecimento no período
              </p>
              <p className="text-xs text-beetz-dark/55 mb-2">
                Não é lista de cobrança — é onde um elogio seu (ou do líder) faz mais diferença.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {semReconhecimento.map((p) => (
                  <Link key={p.id} to={`/perfil/${p.id}`} className="text-xs font-semibold bg-white px-2.5 py-1.5 rounded-full border border-beetz-dark/10 hover:border-beetz-yellow">
                    {nome(p.id)}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="bg-beetz-gray rounded-2xl p-4 md:p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h2 className="font-bold">Placar por pessoa</h2>
              <input
                className="text-sm bg-white rounded-xl px-3 py-2 border border-beetz-dark/10 w-full sm:w-56"
                placeholder="Buscar por nome..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            {ranking.length === 0 ? (
              <p className="text-sm text-beetz-dark/40 p-2">Nada por aqui no período.</p>
            ) : (
              <div className="space-y-1.5">
                {ranking.map((r, i) => (
                  <Link key={r.id} to={`/perfil/${r.id}`} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 hover:ring-2 hover:ring-beetz-yellow/60 transition-shadow">
                    <span className="text-xs font-bold text-beetz-dark/30 w-5 text-right">{i + 1}º</span>
                    <Avatar name={nome(r.id)} size="sm" />
                    <span className="font-semibold text-sm flex-1 truncate">{nome(r.id)}</span>
                    <span className="text-xs text-beetz-dark/60 whitespace-nowrap">
                      recebeu <strong>{r.elogiosRec}</strong> elogio(s) · 🍯 <strong>{r.melRec}</strong>
                    </span>
                    <span className="hidden sm:inline text-[11px] text-beetz-dark/35 whitespace-nowrap">
                      deu {r.elogiosEnv} · 🍯 {r.melEnv}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="bg-beetz-gray rounded-2xl p-4 md:p-5">
            <h2 className="font-bold mb-3">Últimos reconhecimentos</h2>
            {timeline.length === 0 ? (
              <p className="text-sm text-beetz-dark/40 p-2">Nenhum registro no período.</p>
            ) : (
              <div className="space-y-2">
                {timeline.map((t, i) => (
                  <div key={i} className="bg-white rounded-xl px-4 py-3">
                    <p className="text-xs text-beetz-dark/45">
                      {t.kind === 'elogio' ? '💛 Elogio' : `🍯 ${t.qtd} de mel`} · {nome(t.from)} → <strong className="text-beetz-dark/70">{nome(t.to)}</strong> · {quando(t.at)}
                    </p>
                    {t.texto && <p className="text-sm mt-1">“{t.texto}”</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] text-beetz-dark/35">
            Visível só pra quem tem a permissão “Ver panorama de elogios” (hoje: Diretoria).
            Pra abrir a outros cargos no futuro: Configurações → Perfis de acesso.
          </p>
        </>
      )}
    </div>
  )
}

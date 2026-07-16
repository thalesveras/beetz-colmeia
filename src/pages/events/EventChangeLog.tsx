import { useEffect, useState } from 'react'
import { listEventChangeLog, listProfiles } from '../../lib/dataService'
import type { EventChangeLogEntry, Profile } from '../../lib/types'

// Quem mudou o quê e quando. As linhas nascem de um trigger no banco (não dá
// pra escrever pela API), porque histórico que se edita não vale como
// histórico. Só rastreia o que respinga em outro lugar: data e status mexem no
// financeiro e na escala; nome e produtora mexem no que a turma reconhece.
function formatWhen(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function EventChangeLog({ eventId }: { eventId: string }) {
  const [entries, setEntries] = useState<EventChangeLogEntry[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listEventChangeLog(eventId), listProfiles()])
      .then(([e, p]) => { setEntries(e); setProfiles(p) })
      .catch(() => { /* histórico é acessório: falhou, a tela segue funcionando */ })
      .finally(() => setLoading(false))
  }, [eventId])

  if (loading) return <p className="text-xs text-beetz-dark/40">Carregando histórico...</p>
  if (entries.length === 0) {
    return <p className="text-xs text-beetz-dark/40">Nenhuma alteração registrada — o evento está como foi criado.</p>
  }

  function who(id: string | null) {
    if (!id) return 'alguém'
    const p = profiles.find((x) => x.id === id)
    return p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'alguém' : 'alguém'
  }

  return (
    <div className="space-y-1.5">
      {entries.map((e) => (
        <div key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs py-1.5 border-b border-beetz-dark/5 last:border-0">
          <span className="font-semibold">{e.field}</span>
          <span className="text-beetz-dark/40 line-through">{e.old_value || '—'}</span>
          <span className="text-beetz-dark/30">→</span>
          <span className="font-semibold text-beetz-dark">{e.new_value || '—'}</span>
          <span className="text-beetz-dark/35 ml-auto whitespace-nowrap">
            {who(e.changed_by)} · {formatWhen(e.changed_at)}
          </span>
        </div>
      ))}
    </div>
  )
}

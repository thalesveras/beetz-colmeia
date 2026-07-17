import { useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { PendingProfilePickerItem, Profile } from '../../lib/types'

// Seletor de pessoa com busca. Um <select> com 1722 nomes obriga a rolar até
// achar; aqui digita-se um pedaço do nome e pronto. Aceita equipe real e
// pré-cadastro na mesma lista, com selo diferenciando.
//
// value: '' | 'p:<id do perfil>' | 'z:<id do pré-cadastro>' — o prefixo existe
// porque os ids vêm de tabelas diferentes e podem colidir.

interface Props {
  profiles: Profile[]
  pendingProfiles: PendingProfilePickerItem[]
  value: string
  onChange: (key: string) => void
}

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

// Busca sem acento: "leo" acha "Léo Felipe". Com 1722 nomes brasileiros,
// exigir acento certo é exigir sorte.
function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const MAX_RESULTS = 40

export default function PersonPicker({ profiles, pendingProfiles, value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const blurTimer = useRef<number | null>(null)

  const options = useMemo(() => [
    ...profiles.map((p) => ({
      key: `p:${p.id}`, name: `${p.first_name} ${p.last_name}`.trim(), pending: false
    })),
    ...pendingProfiles.map((p) => ({
      key: `z:${p.id}`, name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || (p.email ?? 'Sem nome'), pending: true
    }))
  ], [profiles, pendingProfiles])

  const selected = options.find((o) => o.key === value) ?? null

  const results = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return []
    const found = options.filter((o) => norm(o.name).includes(q))
    // Equipe real primeiro: é quem mais recebe pagamento no dia a dia.
    found.sort((a, b) => Number(a.pending) - Number(b.pending) || a.name.localeCompare(b.name, 'pt-BR'))
    return found.slice(0, MAX_RESULTS)
  }, [options, query])

  function pick(key: string) {
    onChange(key)
    setQuery('')
    setOpen(false)
  }

  // Pessoa escolhida vira um chip com X — estado visível, troca fácil.
  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 border border-beetz-dark/15 rounded-xl px-3 py-2">
        <span className="text-sm truncate">
          {selected.name}
          {selected.pending && <span className="ml-2 text-[10px] font-bold uppercase bg-beetz-yellow/30 px-1.5 py-0.5 rounded">pré-cadastro</span>}
        </span>
        <button type="button" onClick={() => onChange('')} className="text-beetz-dark/35 hover:text-red-600 shrink-0" title="Remover pessoa">
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-beetz-dark/30" />
      <input
        className={`${inputClass} pl-8`}
        placeholder="Digite o nome pra buscar (equipe e pré-cadastros)..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        // Delay no fechamento: sem ele, o blur mata o dropdown antes do clique
        // no resultado registrar — o clássico dropdown que "não deixa clicar".
        onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 150) }}
      />
      {open && query.trim() && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-beetz-dark/10 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {results.length === 0 ? (
            <p className="text-xs text-beetz-dark/40 px-3 py-2.5">Ninguém encontrado com esse nome.</p>
          ) : (
            <>
              {results.map((o) => (
                <button
                  type="button" key={o.key}
                  // mousedown, não click: dispara antes do blur do input.
                  onMouseDown={(e) => { e.preventDefault(); pick(o.key) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-beetz-yellow/20 flex items-center justify-between gap-2"
                >
                  <span className="truncate">{o.name}</span>
                  {o.pending && <span className="text-[10px] font-bold uppercase text-beetz-dark/40 shrink-0">pré-cadastro</span>}
                </button>
              ))}
              {results.length === MAX_RESULTS && (
                <p className="text-[11px] text-beetz-dark/35 px-3 py-2 border-t border-beetz-dark/5">
                  Mostrando os primeiros {MAX_RESULTS} — refine a busca pra achar mais rápido.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

import Avatar from './Avatar'
import type { PendingProfileDirectoryItem } from '../../lib/types'

// Card de quem ainda não se cadastrou no app (veio do Zoho/CSV) — mesma
// linguagem visual do ProfileCard, mas sem nível de gamificação (nunca
// participou de evento por aqui) e sem link "Ver perfil" (não existe
// /perfil/:id pra alguém que não tem conta ainda). Clicar abre um modal
// com mais detalhes (ver PendingProfileModal).
export default function PendingProfileCard({ profile, onClick }: { profile: PendingProfileDirectoryItem; onClick?: () => void }) {
  const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Sem nome'
  const content = (
    <>
      <Avatar src={profile.avatar_url} name={name} size="lg" />
      <h3 className="mt-3 font-bold text-base text-center w-full">{name}</h3>
      <p className="text-sm text-beetz-dark/60">{profile.role_hint || 'Colaborador(a)'}</p>
      <p className="text-xs text-beetz-dark/50 mt-1">📍 {profile.city || 'Cidade não informada'}</p>
      <span className="mt-3 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-beetz-dark/5 text-beetz-dark/50">
        Ainda não se cadastrou
      </span>
    </>
  )
  // Sem onClick (quem não tem a permissão "ver detalhes de pré-cadastro")
  // vira um card só de leitura — sem cursor de clique nem hover.
  if (!onClick) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-soft border border-dashed border-beetz-dark/15 flex flex-col items-center text-center opacity-80 w-full">
        {content}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white rounded-2xl p-5 shadow-soft border border-dashed border-beetz-dark/15 flex flex-col items-center text-center opacity-80 hover:opacity-100 hover:shadow-glow transition-all text-left w-full"
    >
      {content}
    </button>
  )
}

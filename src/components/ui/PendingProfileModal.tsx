import { Instagram, X } from 'lucide-react'
import Avatar from './Avatar'
import type { PendingProfileDirectoryItem } from '../../lib/types'

interface Props {
  profile: PendingProfileDirectoryItem
  departmentName?: string
  onClose: () => void
}

// Mostra os campos "sociais" do pré-cadastro (bio, curiosidade, habilidades,
// instagram etc.) — os mesmos que um perfil de verdade mostra em
// ProfilePage.tsx. CPF, telefone e nome dos pais continuam de fora por
// aqui: são dados sensíveis usados só internamente na migração de conta,
// nunca numa tela que qualquer colaborador pode abrir.
export default function PendingProfileModal({ profile, departmentName, onClose }: Props) {
  const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Sem nome'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-glow" onClick={(e) => e.stopPropagation()}>
        <div className="h-20 dark-gradient relative rounded-t-3xl">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/20 rounded-full p-1.5">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 -mt-12">
          <Avatar src={profile.avatar_url} name={name} size="xl" />
          <h2 className="mt-3 text-xl font-extrabold">{name}</h2>
          <p className="text-beetz-dark/60">{profile.role_hint || 'Colaborador(a)'} {departmentName ? `· ${departmentName}` : ''}</p>
          <p className="text-sm text-beetz-dark/50 mt-1">
            📍 {profile.city || '—'} {profile.state ? `- ${profile.state}` : ''}
          </p>
          <span className="inline-block mt-3 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-beetz-dark/5 text-beetz-dark/50">
            Ainda não se cadastrou no app
          </span>

          <div className="mt-5 space-y-4">
            {(profile.work_location || profile.experience_level || profile.entry_date) && (
              <div className="grid grid-cols-3 gap-2 text-center">
                {profile.experience_level && (
                  <div className="bg-beetz-gray rounded-xl p-3">
                    <p className="text-xs text-beetz-dark/50">Experiência</p>
                    <p className="text-sm font-semibold mt-0.5">{profile.experience_level}</p>
                  </div>
                )}
                {profile.work_location && (
                  <div className="bg-beetz-gray rounded-xl p-3">
                    <p className="text-xs text-beetz-dark/50">Local frequente</p>
                    <p className="text-sm font-semibold mt-0.5">{profile.work_location}</p>
                  </div>
                )}
                {profile.entry_date && (
                  <div className="bg-beetz-gray rounded-xl p-3">
                    <p className="text-xs text-beetz-dark/50">Na Beetz desde</p>
                    <p className="text-sm font-semibold mt-0.5">{new Date(profile.entry_date + 'T00:00:00').getFullYear()}</p>
                  </div>
                )}
              </div>
            )}

            {profile.skills.length > 0 && (
              <div>
                <h3 className="font-bold text-sm mb-2">Habilidades</h3>
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((s) => (
                    <span key={s} className="text-xs font-semibold bg-beetz-gray px-3 py-1.5 rounded-full">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {profile.about_me && (
              <div>
                <h3 className="font-bold text-sm mb-1">Sobre</h3>
                <p className="text-sm text-beetz-dark/70">{profile.about_me}</p>
              </div>
            )}

            {profile.fun_fact && (
              <div>
                <h3 className="font-bold text-sm mb-1">Curiosidade</h3>
                <p className="text-sm text-beetz-dark/70">{profile.fun_fact}</p>
              </div>
            )}

            {profile.favorite_events && (
              <div>
                <h3 className="font-bold text-sm mb-1">Eventos favoritos</h3>
                <p className="text-sm text-beetz-dark/70">{profile.favorite_events}</p>
              </div>
            )}

            {profile.personal_quote && (
              <blockquote className="border-l-4 border-beetz-yellow pl-4 italic text-beetz-dark/70">"{profile.personal_quote}"</blockquote>
            )}

            {profile.instagram && (
              <a
                href={`https://instagram.com/${profile.instagram.replace('@', '')}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-beetz-dark/70 hover:text-beetz-dark"
              >
                <Instagram size={16} /> {profile.instagram}
              </a>
            )}

            {!profile.about_me && !profile.fun_fact && !profile.favorite_events && !profile.personal_quote && profile.skills.length === 0 && (
              <p className="text-sm text-beetz-dark/40">Sem mais informações preenchidas até agora.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

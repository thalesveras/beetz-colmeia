import { Instagram, Sparkles, X } from 'lucide-react'
import Avatar from './Avatar'
import type { PendingProfileDirectoryItem } from '../../lib/types'

interface Props {
  profile: PendingProfileDirectoryItem
  departmentName?: string
  onClose: () => void
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-bold text-sm mb-1.5">{title}</h3>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-beetz-dark/35 italic">{children}</p>
}

// Mostra os campos "sociais" do pré-cadastro (bio, curiosidade, habilidades,
// instagram etc.) — os mesmos que um perfil de verdade mostra em
// ProfilePage.tsx. Toda seção aparece sempre, preenchida ou com um estado
// vazio explicando que a pessoa completa isso no cadastro — assim o modal
// mostra o "formato" inteiro do perfil, não só o que já veio do Zoho/CSV.
// CPF, telefone e nome dos pais continuam de fora daqui por design: são
// dados sensíveis usados só internamente na migração de conta, nunca numa
// tela que qualquer colaborador pode abrir — ver nota no rodapé.
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
            📍 {profile.city || 'Cidade não informada'} {profile.state ? `- ${profile.state}` : ''}
          </p>
          <span className="inline-block mt-3 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-beetz-dark/5 text-beetz-dark/50">
            Ainda não se cadastrou no app
          </span>

          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="bg-beetz-gray rounded-xl p-3">
              <p className="text-xs text-beetz-dark/50">Experiência</p>
              <p className="text-sm font-semibold mt-0.5">{profile.experience_level || '—'}</p>
            </div>
            <div className="bg-beetz-gray rounded-xl p-3">
              <p className="text-xs text-beetz-dark/50">Local frequente</p>
              <p className="text-sm font-semibold mt-0.5">{profile.work_location || '—'}</p>
            </div>
            <div className="bg-beetz-gray rounded-xl p-3">
              <p className="text-xs text-beetz-dark/50">Na Beetz desde</p>
              <p className="text-sm font-semibold mt-0.5">
                {profile.entry_date ? new Date(profile.entry_date + 'T00:00:00').getFullYear() : '—'}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <Section title="Habilidades">
              {profile.skills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((s) => (
                    <span key={s} className="text-xs font-semibold bg-beetz-gray px-3 py-1.5 rounded-full">{s}</span>
                  ))}
                </div>
              ) : (
                <Empty>Ainda não informou — poderá completar no cadastro.</Empty>
              )}
            </Section>

            <Section title="Sobre">
              {profile.about_me ? (
                <p className="text-sm text-beetz-dark/70">{profile.about_me}</p>
              ) : (
                <Empty>Ainda não escreveu sobre si — vem no cadastro.</Empty>
              )}
            </Section>

            <Section title="Curiosidade">
              {profile.fun_fact ? (
                <p className="text-sm text-beetz-dark/70">{profile.fun_fact}</p>
              ) : (
                <Empty>Ainda não preencheu.</Empty>
              )}
            </Section>

            <Section title="Eventos favoritos">
              {profile.favorite_events ? (
                <p className="text-sm text-beetz-dark/70">{profile.favorite_events}</p>
              ) : (
                <Empty>Ainda não informou.</Empty>
              )}
            </Section>

            <Section title="Frase pessoal">
              {profile.personal_quote ? (
                <blockquote className="border-l-4 border-beetz-yellow pl-4 italic text-beetz-dark/70">"{profile.personal_quote}"</blockquote>
              ) : (
                <Empty>Ainda não escolheu uma.</Empty>
              )}
            </Section>

            <Section title="Instagram">
              {profile.instagram ? (
                <a
                  href={`https://instagram.com/${profile.instagram.replace('@', '')}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-beetz-dark/70 hover:text-beetz-dark"
                >
                  <Instagram size={16} /> {profile.instagram}
                </a>
              ) : (
                <Empty>Ainda não informou.</Empty>
              )}
            </Section>
          </div>

          <div className="mt-6 pt-4 border-t border-beetz-dark/10 flex gap-2 text-xs text-beetz-dark/50">
            <Sparkles size={14} className="shrink-0 mt-0.5 text-beetz-yellow" />
            <p>
              Quando {profile.first_name || 'essa pessoa'} criar conta no app, o perfil completo também passa a ter
              telefone, contato de emergência, CPF e histórico de eventos — dados que só existem depois do cadastro
              de verdade, por isso não aparecem aqui no pré-cadastro.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

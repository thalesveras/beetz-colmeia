import { Cake, Clock3, Instagram, MapPin, Sparkles, X } from 'lucide-react'
import Avatar from './Avatar'
import type { PendingProfileDirectoryItem } from '../../lib/types'

interface Props {
  profile: PendingProfileDirectoryItem
  departmentName?: string
  onClose: () => void
}

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]

function formatBirthday(month: number | null, day: number | null) {
  if (!month || !day) return null
  return `${day} de ${MONTHS_PT[month - 1]}`
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-beetz-gray rounded-xl p-3 flex flex-col items-center text-center gap-1">
      <div className="text-beetz-dark/40">{icon}</div>
      <p className="text-xs text-beetz-dark/50">{label}</p>
      <p className="text-sm font-semibold leading-tight">{value}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-bold text-sm mb-1.5 text-beetz-dark/80">{title}</h3>
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
  const birthday = formatBirthday(profile.birth_month, profile.birth_day)

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[28px] w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-28 dark-gradient relative rounded-t-[28px] overflow-hidden">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-beetz-yellow/20 rounded-full blur-2xl" />
          <div className="absolute top-8 left-8 w-16 h-16 bg-beetz-yellow/10 hex-clip" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-6 -mt-14">
          <Avatar src={profile.avatar_url} name={name} size="xl" />

          <div className="mt-3 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-2xl font-extrabold leading-tight">{name}</h2>
              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                {profile.role_hint && (
                  <span className="text-xs font-semibold bg-beetz-dark text-white px-2.5 py-1 rounded-full">
                    {profile.role_hint}
                  </span>
                )}
                {departmentName && (
                  <span className="text-xs font-semibold bg-beetz-yellow/30 text-beetz-dark px-2.5 py-1 rounded-full">
                    {departmentName}
                  </span>
                )}
              </div>
            </div>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-full bg-beetz-dark/5 text-beetz-dark/50 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Ainda não se cadastrou
            </span>
          </div>

          <p className="flex items-center gap-1.5 text-sm text-beetz-dark/50 mt-2">
            <MapPin size={14} /> {profile.city || 'Cidade não informada'} {profile.state ? `- ${profile.state}` : ''}
          </p>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat icon={<Clock3 size={16} />} label="Experiência" value={profile.experience_level || '—'} />
            <Stat icon={<MapPin size={16} />} label="Local frequente" value={profile.work_location || '—'} />
            <Stat
              icon={<Sparkles size={16} />}
              label="Na Beetz desde"
              value={profile.entry_date ? String(new Date(profile.entry_date + 'T00:00:00').getFullYear()) : '—'}
            />
            <Stat icon={<Cake size={16} />} label="Aniversário" value={birthday || '—'} />
          </div>

          <div className="mt-6 space-y-4">
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
                <p className="text-sm text-beetz-dark/70 leading-relaxed">{profile.about_me}</p>
              ) : (
                <Empty>Ainda não escreveu sobre si — vem no cadastro.</Empty>
              )}
            </Section>

            <Section title="Curiosidade">
              {profile.fun_fact ? (
                <p className="text-sm text-beetz-dark/70 leading-relaxed">{profile.fun_fact}</p>
              ) : (
                <Empty>Ainda não preencheu.</Empty>
              )}
            </Section>

            <Section title="Eventos favoritos">
              {profile.favorite_events ? (
                <p className="text-sm text-beetz-dark/70 leading-relaxed">{profile.favorite_events}</p>
              ) : (
                <Empty>Ainda não informou.</Empty>
              )}
            </Section>

            {profile.personal_quote && (
              <div className="honey-gradient rounded-2xl p-4 relative overflow-hidden">
                <span className="absolute -top-2 left-3 text-5xl font-black text-beetz-dark/10 leading-none select-none">“</span>
                <p className="relative italic text-beetz-dark font-medium text-sm pl-4">{profile.personal_quote}</p>
              </div>
            )}

            <Section title="Instagram">
              {profile.instagram ? (
                <a
                  href={`https://instagram.com/${profile.instagram.replace('@', '')}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold bg-beetz-gray hover:bg-beetz-dark/10 px-3.5 py-2 rounded-full transition-colors"
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

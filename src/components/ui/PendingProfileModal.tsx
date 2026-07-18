import { useEffect, useState } from 'react'
import { Cake, Clock3, FileText, Instagram, MapPin, ShieldAlert, Sparkles, X } from 'lucide-react'
import Avatar from './Avatar'
import type { PendingProfileDirectoryItem, PendingProfileSensitive } from '../../lib/types'
import { useAuth } from '../../contexts/AuthContext'
import { getPendingDocumentSignedUrl, getPendingProfileSensitiveDetails } from '../../lib/dataService'

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
// CPF, telefone, nome dos pais, Pix e documento são dados sensíveis — só
// aparecem pra Diretoria, numa seção separada abaixo, buscada sob demanda
// (get_pending_profile_sensitive confere isso de novo no banco).
export default function PendingProfileModal({ profile, departmentName, onClose }: Props) {
  const { accessRole } = useAuth()
  const isDiretoria = accessRole === 'diretoria'
  const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Sem nome'
  const birthday = formatBirthday(profile.birth_month, profile.birth_day)
  // Nascimento completo (com ano e idade) — só no painel interno da Diretoria;
  // a parte pública do popup segue mostrando apenas dia/mês.
  const fullBirth = (() => {
    if (!profile.birth_month || !profile.birth_day) return null
    const dm = `${String(profile.birth_day).padStart(2, '0')}/${String(profile.birth_month).padStart(2, '0')}`
    if (!profile.birth_year) return dm
    const age = new Date().getFullYear() - profile.birth_year
    const passed = new Date().getMonth() + 1 > profile.birth_month ||
      (new Date().getMonth() + 1 === profile.birth_month && new Date().getDate() >= profile.birth_day)
    return `${dm}/${profile.birth_year} · ${passed ? age : age - 1} anos`
  })()

  const [sensitive, setSensitive] = useState<PendingProfileSensitive | null>(null)
  const [loadingSensitive, setLoadingSensitive] = useState(false)
  const [loadingDocument, setLoadingDocument] = useState(false)
  const [documentError, setDocumentError] = useState<string | null>(null)

  useEffect(() => {
    if (!isDiretoria) return
    let active = true
    setLoadingSensitive(true)
    getPendingProfileSensitiveDetails(profile.id)
      .then((data) => { if (active) setSensitive(data) })
      .finally(() => { if (active) setLoadingSensitive(false) })
    return () => { active = false }
  }, [profile.id, isDiretoria])

  async function handleViewDocument() {
    setDocumentError(null)
    setLoadingDocument(true)
    try {
      const { url } = await getPendingDocumentSignedUrl(profile.id)
      window.open(url, '_blank', 'noreferrer')
    } catch (err) {
      setDocumentError(err instanceof Error ? err.message : 'Nenhum documento encontrado pra essa pessoa.')
    } finally {
      setLoadingDocument(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[28px] w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-24 dark-gradient relative rounded-t-[28px] overflow-hidden">
          <div className="absolute -top-12 -right-10 w-44 h-44 bg-beetz-yellow/25 rounded-full blur-3xl" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* relative z-10: o header acima é position:relative (precisa disso pro
            brilho e pro X), e pelas regras de pintura do CSS um elemento
            posicionado sobe por cima de irmãos estáticos — mesmo vindo antes no
            HTML. Sem isso a capa cobria a foto. */}
        <div className="px-6 pb-6 -mt-10 relative z-10">
          <Avatar src={profile.avatar_url} name={name} size="lg" />

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

          {isDiretoria && (
            <div className="mt-6 bg-beetz-dark rounded-2xl p-4">
              <h3 className="font-bold text-sm text-white flex items-center gap-1.5 mb-3">
                <ShieldAlert size={15} className="text-beetz-yellow" /> Dados internos (só Diretoria)
              </h3>

              {loadingSensitive ? (
                <p className="text-sm text-white/50">Carregando...</p>
              ) : sensitive ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="col-span-2">
                    <p className="text-xs text-white/40">E-mail</p>
                    <p className="font-semibold text-white break-all">{sensitive.email || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">CPF</p>
                    <p className="font-semibold text-white">{sensitive.cpf || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Telefone</p>
                    <p className="font-semibold text-white">{sensitive.phone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Nome da mãe</p>
                    <p className="font-semibold text-white">{sensitive.mother_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Nome do pai</p>
                    <p className="font-semibold text-white">{sensitive.father_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Nascimento</p>
                    <p className="font-semibold text-white">{fullBirth || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Na Beetz desde</p>
                    <p className="font-semibold text-white">
                      {profile.entry_date ? new Date(profile.entry_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-white/40">Chave Pix</p>
                    <p className="font-semibold text-white">
                      {sensitive.pix_key ? `${sensitive.pix_key} (${sensitive.pix_key_type || 'tipo não informado'})` : '—'}
                      {sensitive.pix_owner_name ? ` · Titular: ${sensitive.pix_owner_name}` : ''}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-white/50">Sem dados internos disponíveis.</p>
              )}

              <button
                onClick={handleViewDocument}
                disabled={loadingDocument}
                className="mt-4 flex items-center gap-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <FileText size={14} /> {loadingDocument ? 'Abrindo...' : 'Ver documento enviado'}
              </button>
              {documentError && <p className="text-xs text-red-300 mt-2">{documentError}</p>}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-beetz-dark/10 flex gap-2 text-xs text-beetz-dark/50">
            <Sparkles size={14} className="shrink-0 mt-0.5 text-beetz-yellow" />
            <p>
              {isDiretoria
                ? `Essa seção de dados internos só aparece pra Diretoria. Quando ${profile.first_name || 'essa pessoa'} criar conta no app, esses dados migram pro perfil de verdade.`
                : `Quando ${profile.first_name || 'essa pessoa'} criar conta no app, o perfil completo também passa a ter telefone, contato de emergência, CPF e histórico de eventos — dados que só existem depois do cadastro de verdade, por isso não aparecem aqui no pré-cadastro.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

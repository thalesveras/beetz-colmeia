import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Image, Instagram, Sparkles, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { canGiveRecognition } from '../lib/permissions'
import {
  getProfileById, getProfileStats, giveCompliment, giveHoney,
  listDepartments, listEventsForProfile, removeProfileCover, uploadProfileCover
} from '../lib/dataService'
import type { Department, EventItem, Profile, ProfileStats } from '../lib/types'
import Avatar from '../components/ui/Avatar'
import LevelPill from '../components/ui/LevelPill'
import ProgressBar from '../components/ui/ProgressBar'
import BadgeChip from '../components/ui/BadgeChip'
import { getLevelProgress } from '../lib/levels'

export default function ProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { userId, profile: myProfile, refreshProfile, accessRole } = useAuth()
  const canRecognize = canGiveRecognition(accessRole)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [department, setDepartment] = useState<Department | null>(null)
  const [loading, setLoading] = useState(true)
  const [complimentText, setComplimentText] = useState('')
  const [showComplimentBox, setShowComplimentBox] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [coverBusy, setCoverBusy] = useState(false)
  const [coverError, setCoverError] = useState<string | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)

  const targetId = id === 'me' ? userId : id

  async function load() {
    if (!targetId) return
    setLoading(true)
    const [p, s, ev, depts] = await Promise.all([
      getProfileById(targetId), getProfileStats(targetId), listEventsForProfile(targetId), listDepartments()
    ])
    setProfile(p)
    setStats(s)
    setEvents(ev)
    setDepartment(depts.find((d) => d.id === p?.department_id) ?? null)
    setLoading(false)
  }

  useEffect(() => { load() }, [targetId])

  if (!targetId) return <p className="p-8 text-beetz-dark/50">Perfil não encontrado.</p>
  if (loading || !profile || !stats) return <p className="p-8 text-beetz-dark/50">Carregando perfil...</p>

  const isOwnProfile = userId === profile.id
  const entryYear = profile.entry_date ? new Date(profile.entry_date).getFullYear() : null
  const tenure = entryYear ? new Date().getFullYear() - entryYear : null

  async function handleGiveHoney() {
    if (!userId || !profile) return
    if (userId === profile.id) { setFeedback('Você não pode dar mel para si mesmo(a) 😅'); return }
    await giveHoney(userId, profile.id, 1, 'Reconhecimento rápido pela colmeia')
    setFeedback('🍯 Mel enviado com sucesso!')
    load()
    if (isOwnProfile) refreshProfile()
    setTimeout(() => setFeedback(null), 3000)
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setCoverBusy(true)
    setCoverError(null)
    try {
      await uploadProfileCover(userId, file)
      await load()
      if (isOwnProfile) refreshProfile()
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'Erro ao enviar o fundo.')
    } finally {
      setCoverBusy(false)
      // Zera o input pra dar pra reenviar o mesmo arquivo depois de um erro.
      if (coverInputRef.current) coverInputRef.current.value = ''
    }
  }

  async function handleCoverRemove() {
    if (!userId) return
    setCoverBusy(true)
    setCoverError(null)
    try {
      await removeProfileCover(userId)
      await load()
      refreshProfile()
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'Erro ao remover o fundo.')
    } finally {
      setCoverBusy(false)
    }
  }

  async function handleSendCompliment() {
    if (!userId || !profile || !complimentText.trim()) return
    if (userId === profile.id) { setFeedback('Você não pode se elogiar por aqui 😄'); return }
    await giveCompliment(userId, profile.id, complimentText.trim())
    setComplimentText('')
    setShowComplimentBox(false)
    setFeedback('💛 Elogio enviado!')
    load()
    setTimeout(() => setFeedback(null), 3000)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white rounded-3xl shadow-soft border border-beetz-dark/5 overflow-hidden">
        {/* Capa: imagem da pessoa se tiver, senão o gradiente escuro padrão.
            Fica sempre ATRÁS da foto — o bloco de baixo é relative z-10. */}
        <div className={`h-32 md:h-40 relative group ${profile.cover_url ? 'bg-beetz-dark' : 'dark-gradient'}`}>
          {profile.cover_url && (
            <img
              src={profile.cover_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {/* Véu escuro embaixo: a foto e o nome vêm logo abaixo, e sem isso
              uma capa clara deixaria tudo ilegível. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

          {isOwnProfile && (
            <div className="absolute bottom-3 right-3 flex gap-2">
              <label
                className={`flex items-center gap-1.5 text-xs font-bold bg-white/90 hover:bg-white text-beetz-dark px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  coverBusy ? 'opacity-60 pointer-events-none' : ''
                }`}
              >
                <Image size={13} />
                {coverBusy ? 'Enviando...' : profile.cover_url ? 'Trocar fundo' : 'Personalizar fundo'}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleCoverChange}
                />
              </label>
              {profile.cover_url && (
                <button
                  onClick={handleCoverRemove}
                  disabled={coverBusy}
                  title="Remover fundo"
                  className="bg-white/90 hover:bg-white text-beetz-dark/70 hover:text-red-600 p-1.5 rounded-lg transition-colors disabled:opacity-60"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
        </div>

        {coverError && (
          <p className="text-xs text-red-600 px-6 md:px-8 pt-3">{coverError}</p>
        )}

        {/* relative z-10 mantém a foto e o conteúdo por cima da capa: a capa é
            position:relative (pro botão), e no CSS um elemento posicionado
            pinta por cima de irmãos estáticos mesmo vindo antes no HTML. */}
        <div className="p-6 md:p-8 -mt-14 relative z-10">
          {/* Anel branco: destaca a foto contra qualquer capa que a pessoa
              suba, clara ou escura. */}
          <div className="inline-block rounded-full ring-4 ring-white">
            <Avatar src={profile.avatar_url} name={`${profile.first_name} ${profile.last_name}`} size="xl" />
          </div>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold">{profile.first_name} {profile.last_name}</h1>
              <p className="text-beetz-dark/60">{profile.role || 'Colaborador(a)'} {department ? `· ${department.name}` : ''}</p>
              <p className="text-sm text-beetz-dark/50 mt-1">📍 {profile.city || '—'} {profile.state ? `- ${profile.state}` : ''} {tenure !== null && `· ${tenure === 0 ? 'menos de 1 ano' : `${tenure} ano(s)`} de Beetz`}</p>
            </div>
            <LevelPill eventsCount={stats.eventsCount} />
          </div>

          {!isOwnProfile && userId && canRecognize && (
            <div className="flex flex-wrap gap-3 mt-6">
              <button onClick={handleGiveHoney} className="flex items-center gap-2 honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl hover:brightness-105 transition">
                🍯 Dar um Mel
              </button>
              <button onClick={() => setShowComplimentBox((v) => !v)} className="flex items-center gap-2 bg-beetz-dark text-white font-bold px-5 py-2.5 rounded-xl hover:bg-black transition">
                💛 Elogiar
              </button>
            </div>
          )}
          {isOwnProfile && (
            <Link to="/cadastro" className="inline-block mt-6 text-sm font-semibold underline text-beetz-dark/70">Editar meu perfil</Link>
          )}

          {feedback && <p className="text-sm font-semibold text-beetz-dark mt-3">{feedback}</p>}

          {showComplimentBox && (
            <div className="mt-4 flex gap-2">
              <input
                value={complimentText} onChange={(e) => setComplimentText(e.target.value)}
                placeholder="Escreva um elogio rápido..."
                className="flex-1 border border-beetz-dark/15 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow"
              />
              <button onClick={handleSendCompliment} className="bg-beetz-yellow font-semibold px-4 py-2 rounded-xl text-sm">Enviar</button>
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
          <h2 className="font-bold mb-3">Progresso na colmeia</h2>
          <ProgressBar percent={getLevelProgress(stats.eventsCount)} label={`${stats.eventsCount} evento(s) participados`} />
          <div className="grid grid-cols-3 gap-3 mt-5 text-center">
            <div><p className="text-xl font-extrabold">{stats.eventsCount}</p><p className="text-xs text-beetz-dark/50">Eventos</p></div>
            <div><p className="text-xl font-extrabold">🍯 {stats.honeyReceived}</p><p className="text-xs text-beetz-dark/50">Mel recebido</p></div>
            <div><p className="text-xl font-extrabold">💛 {stats.complimentsReceived}</p><p className="text-xs text-beetz-dark/50">Elogios</p></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
          <h2 className="font-bold mb-3 flex items-center gap-2"><Sparkles size={16} /> Medalhas</h2>
          {stats.badges.length === 0 ? (
            <p className="text-sm text-beetz-dark/50">Ainda sem medalhas — hora de entrar em ação!</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {stats.badges.map((b) => <BadgeChip key={b} type={b} />)}
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
          <h2 className="font-bold mb-3">Habilidades</h2>
          <div className="flex flex-wrap gap-2">
            {profile.skills.length ? profile.skills.map((s) => (
              <span key={s} className="text-xs font-semibold bg-beetz-gray px-3 py-1.5 rounded-full">{s}</span>
            )) : <p className="text-sm text-beetz-dark/50">Nenhuma habilidade cadastrada.</p>}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
          <h2 className="font-bold mb-3">Eventos que participou</h2>
          {events.length === 0 ? (
            <p className="text-sm text-beetz-dark/50">Ainda não participou de eventos.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id}>
                  <Link to={`/eventos/${e.id}`} className="text-sm font-medium hover:underline">{e.name}</Link>
                  <span className="text-xs text-beetz-dark/50 ml-2">{e.city}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5 space-y-4">
        <div>
          <h2 className="font-bold mb-1">Sobre mim</h2>
          <p className="text-sm text-beetz-dark/70">{profile.about_me || 'Ainda não preencheu esta parte do perfil.'}</p>
        </div>
        <div>
          <h2 className="font-bold mb-1">Curiosidade</h2>
          <p className="text-sm text-beetz-dark/70">{profile.fun_fact || '—'}</p>
        </div>
        {profile.personal_quote && (
          <blockquote className="border-l-4 border-beetz-yellow pl-4 italic text-beetz-dark/70">"{profile.personal_quote}"</blockquote>
        )}
        {profile.instagram && (
          <a href={`https://instagram.com/${profile.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-beetz-dark/70 hover:text-beetz-dark">
            <Instagram size={16} /> {profile.instagram}
          </a>
        )}
      </div>
    </div>
  )
}

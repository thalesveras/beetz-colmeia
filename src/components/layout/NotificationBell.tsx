import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../../lib/dataService'
import type { AppNotification, NotificationKind } from '../../lib/types'

// Sininho de avisos. As notificações nascem no banco (triggers), aqui a gente
// só lê, mostra o contador e marca como lida.

const KIND_EMOJI: Record<NotificationKind, string> = {
  Geral: '🐝',
  Escala: '📋',
  Despesa: '💸',
  Estoque: '📦',
  Evento: '📅',
  Fechamento: '🧾'
}

// "há 5 min", "há 2 h", "ontem"... — data crua num aviso é ruim de ler.
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function NotificationBell() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const unread = items.filter((n) => !n.read_at).length

  // Bolinha de contagem no ÍCONE do app instalado (Badging API — iOS 16.4+,
  // Android, desktop). Espelha o sininho: zerou, limpa. Navegador sem suporte
  // simplesmente ignora.
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (!nav.setAppBadge) return
    if (unread > 0) nav.setAppBadge(unread).catch(() => undefined)
    else nav.clearAppBadge?.().catch(() => undefined)
  }, [unread])

  async function load() {
    if (!userId) return
    setLoading(true)
    try {
      setItems(await listNotifications(userId))
    } catch {
      // Aviso é acessório: se falhar, o app continua funcionando normalmente.
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [userId])

  // Fecha ao clicar fora.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function handleOpenItem(n: AppNotification) {
    if (!n.read_at) {
      await markNotificationRead(n.id)
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
    }
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  async function handleMarkAll() {
    if (!userId) return
    await markAllNotificationsRead(userId)
    const now = new Date().toISOString()
    setItems((prev) => prev.map((x) => (x.read_at ? x : { ...x, read_at: now })))
  }

  if (!userId) return null

  return (
    <div className="relative" ref={wrapRef}>
      {/* Cores responsivas: no celular o sino vive na barra escura do topo;
          no desktop, sobre o fundo claro da página. */}
      <button
        onClick={() => { setOpen((v) => !v); if (!open) load() }}
        className="relative p-2 rounded-xl hover:bg-white/10 md:hover:bg-beetz-dark/5 transition-colors"
        aria-label="Notificações"
      >
        <Bell size={20} className="text-white/80 md:text-beetz-dark/70" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[17px] h-[17px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* text-beetz-dark explícito no popup: ele mora dentro da barra escura
          do topo (text-white no mobile) — sem ancorar a cor aqui, títulos sem
          cor própria herdavam branco sobre fundo branco. */}
      {open && (
        <div className="absolute right-0 mt-2 w-[320px] max-w-[calc(100vw-2rem)] bg-white text-beetz-dark rounded-2xl shadow-xl border border-beetz-dark/10 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-beetz-dark/5">
            <p className="font-bold text-sm">Avisos</p>
            {unread > 0 && (
              <button onClick={handleMarkAll} className="text-[11px] font-semibold text-beetz-dark/50 hover:text-beetz-dark flex items-center gap-1">
                <CheckCheck size={12} /> Marcar todos como lidos
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {loading ? (
              <p className="text-sm text-beetz-dark/40 p-6 text-center">Carregando...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-beetz-dark/40 p-6 text-center">Nenhum aviso por aqui ainda. 🐝</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleOpenItem(n)}
                  className={`w-full text-left px-4 py-3 border-b border-beetz-dark/5 last:border-0 hover:bg-beetz-gray transition-colors ${
                    n.read_at ? '' : 'bg-beetz-yellow/10'
                  }`}
                >
                  <div className="flex gap-2.5">
                    <span className="text-base leading-none mt-0.5">{KIND_EMOJI[n.kind]}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-snug ${n.read_at ? 'font-medium text-beetz-dark/70' : 'font-bold'}`}>
                        {n.title}
                      </p>
                      {n.body && <p className="text-xs text-beetz-dark/50 mt-0.5 leading-snug">{n.body}</p>}
                      <p className="text-[10px] text-beetz-dark/35 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.read_at && <span className="w-2 h-2 rounded-full bg-beetz-yellow shrink-0 mt-1.5" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { Link } from 'react-router-dom'
import { Users, UserCircle, CalendarDays } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function Welcome() {
  const { userId } = useAuth()
  const loginTarget = userId ? '/turma' : '/entrar?next=/turma'
  const profileTarget = userId ? '/cadastro' : '/entrar?next=/cadastro'
  const eventsTarget = userId ? '/eventos' : '/entrar?next=/eventos'

  return (
    <div className="min-h-screen dark-gradient text-white flex flex-col items-center justify-center px-6 py-16 text-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 bg-honeycomb" style={{ backgroundSize: '24px 24px' }} />

      <div className="relative z-10 max-w-2xl">
        <div className="mx-auto mb-6 w-20 h-20 rounded-2xl honey-gradient flex items-center justify-center text-4xl shadow-glow">
          🐝
        </div>
        <p className="uppercase tracking-[0.3em] text-beetz-yellow text-xs font-semibold mb-4">Comunidade interna Beetz</p>
        <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-4">
          Bem-vindo à <span className="text-beetz-yellow">Colmeia Beetz</span>
        </h1>
        <p className="text-white/70 text-lg md:text-xl mb-10">
          Conheça quem faz os maiores eventos acontecerem.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to={loginTarget}
            className="flex items-center justify-center gap-2 honey-gradient text-beetz-dark font-bold px-6 py-3.5 rounded-2xl hover:brightness-105 transition shadow-glow"
          >
            <Users size={18} /> Conhecer a turma
          </Link>
          <Link
            to={profileTarget}
            className="flex items-center justify-center gap-2 bg-white/10 backdrop-blur border border-white/20 font-semibold px-6 py-3.5 rounded-2xl hover:bg-white/20 transition"
          >
            <UserCircle size={18} /> Completar meu perfil
          </Link>
          <Link
            to={eventsTarget}
            className="flex items-center justify-center gap-2 bg-white/10 backdrop-blur border border-white/20 font-semibold px-6 py-3.5 rounded-2xl hover:bg-white/20 transition"
          >
            <CalendarDays size={18} /> Ver próximos eventos
          </Link>
        </div>
      </div>

      <p className="relative z-10 text-white/30 text-xs mt-16">Beetz Colmeia · feito por abelhas, para abelhas 🍯</p>
    </div>
  )
}

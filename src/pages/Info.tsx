import { BADGE_DEFS, HIVE_LEVELS } from '../lib/levels'

export default function Info() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold">Informações da colmeia</h1>
        <p className="text-beetz-dark/60 mt-1">Entenda como funciona a gamificação da Beetz Colmeia.</p>
      </div>

      <section className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
        <h2 className="font-bold mb-4">Níveis na colmeia</h2>
        <p className="text-sm text-beetz-dark/60 mb-4">Seu nível sobe automaticamente conforme você participa de mais eventos com a Beetz.</p>
        <div className="space-y-3">
          {HIVE_LEVELS.map((lvl) => (
            <div key={lvl.level} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: lvl.color + '40' }}>
              <span className="text-2xl">{lvl.icon}</span>
              <div>
                <p className="font-semibold">{lvl.level}</p>
                <p className="text-xs text-beetz-dark/60">{lvl.description} · a partir de {lvl.minEvents} evento(s)</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
        <h2 className="font-bold mb-4">Medalhas</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {BADGE_DEFS.map((b) => (
            <div key={b.type} className="flex items-center gap-3 p-3 rounded-xl bg-beetz-gray">
              <span className="w-10 h-10 rounded-full honey-gradient flex items-center justify-center text-lg">{b.icon}</span>
              <div>
                <p className="font-semibold text-sm">{b.label}</p>
                <p className="text-xs text-beetz-dark/60">{b.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
        <h2 className="font-bold mb-2">Sobre a Beetz Colmeia</h2>
        <p className="text-sm text-beetz-dark/70">
          A Beetz Colmeia é a comunidade interna de quem faz os eventos da Beetz acontecerem. Aqui você conhece a turma,
          acompanha equipes e eventos, reconhece colegas com mel e elogios, e evolui de Nova Abelha até Lenda Beetz. 🐝🍯
        </p>
      </section>
    </div>
  )
}

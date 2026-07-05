import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-6 dark-gradient text-white">
      <p className="text-6xl mb-4">🐝</p>
      <h1 className="text-2xl font-extrabold mb-2">Essa colmeia não existe por aqui</h1>
      <p className="text-white/60 mb-6">A página que você procura voou para outro lugar.</p>
      <Link to="/" className="honey-gradient text-beetz-dark font-bold px-6 py-3 rounded-xl">Voltar para o início</Link>
    </div>
  )
}

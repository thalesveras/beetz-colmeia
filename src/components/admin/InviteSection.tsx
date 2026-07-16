import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { inviteTeamMember } from '../../lib/dataService'

const DEPARTMENT_HINTS = ['Garçons', 'Caixas', 'Operacional']
const inputClass = 'rounded-xl border border-beetz-dark/15 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

// Convidar alguém = criar um pré-cadastro. Não dispara e-mail nenhum: quando a
// pessoa entrar com o Google usando esse endereço, o perfil já nasce
// preenchido. Estava solto dentro do Admin.tsx; virou componente quando a
// página passou a ter abas.
export default function InviteSection() {
  const [form, setForm] = useState({ email: '', first_name: '', last_name: '', role_hint: '', department_hint: '' })
  const [inviting, setInviting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleInvite() {
    if (!form.email.trim()) return
    setInviting(true)
    setError(null)
    setFeedback(null)
    try {
      await inviteTeamMember(form)
      setFeedback(`${form.first_name || form.email} já aparece como pré-cadastro na comunidade.`)
      setForm({ email: '', first_name: '', last_name: '', role_hint: '', department_hint: '' })
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao convidar.')
    } finally {
      setInviting(false)
    }
  }

  return (
    <div>
      <h2 className="font-bold mb-1 flex items-center gap-2"><UserPlus size={18} /> Convidar para o time</h2>
      <p className="text-xs text-beetz-dark/50 mb-3">
        Cria um pré-cadastro. Não envia e-mail nenhum — quando a pessoa entrar no app com o Google
        usando esse mesmo endereço, o perfil dela já nasce preenchido e liberado na comunidade.
      </p>

      <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 p-5 space-y-3 max-w-2xl">
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            placeholder="E-mail *" type="email" value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Nome" value={form.first_name}
              onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder="Sobrenome" value={form.last_name}
              onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              className={inputClass}
            />
          </div>
          <input
            placeholder="Função (ex: Garçom, Bar...)" value={form.role_hint}
            onChange={(e) => setForm((f) => ({ ...f, role_hint: e.target.value }))}
            className={inputClass}
          />
          <select
            value={form.department_hint}
            onChange={(e) => setForm((f) => ({ ...f, department_hint: e.target.value }))}
            className={inputClass}
          >
            <option value="">Departamento não definido</option>
            {DEPARTMENT_HINTS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {feedback && <p className="text-sm text-green-700">{feedback}</p>}
        <button
          onClick={handleInvite}
          disabled={inviting || !form.email.trim()}
          className="honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60"
        >
          {inviting ? 'Convidando...' : 'Convidar'}
        </button>
      </div>
    </div>
  )
}

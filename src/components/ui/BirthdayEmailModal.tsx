import { useState } from 'react'
import { Cake, Check, Send, X } from 'lucide-react'
import { sendBirthdayEmail, type BirthdayEmailTarget } from '../../lib/dataService'
import Avatar from './Avatar'

// Popup de parabéns. O texto já vem escrito com o nome da pessoa e é editável
// antes de enviar. O e-mail de destino não aparece aqui de propósito — quem
// resolve o endereço é a edge function, no servidor.

interface Props {
  target: BirthdayEmailTarget
  name: string
  firstName: string
  avatarUrl: string | null
  onClose: () => void
}

function defaultSubject(firstName: string) {
  return `Feliz aniversário, ${firstName}! 🎉`
}

function defaultMessage(firstName: string) {
  return `Oi, ${firstName}!

Hoje é o seu dia, e a colmeia inteira parou pra desejar um feliz aniversário. 🎉

Obrigado por fazer parte da Beetz e por somar com a gente em cada evento. Que esse novo ano venha cheio de coisa boa, saúde e muitas histórias pra contar.

Aproveita o seu dia!

Com carinho,
Time Beetz 🐝`
}

export default function BirthdayEmailModal({ target, name, firstName, avatarUrl, onClose }: Props) {
  const safeFirst = firstName.trim() || name.split(' ')[0] || 'abelha'
  const [subject, setSubject] = useState(defaultSubject(safeFirst))
  const [message, setMessage] = useState(defaultMessage(safeFirst))
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    if (!subject.trim() || !message.trim()) return
    setSending(true)
    setError(null)
    try {
      await sendBirthdayEmail(target, subject.trim(), message.trim())
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar o e-mail.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-beetz-dark/5">
          <h2 className="font-extrabold flex items-center gap-2"><Cake size={18} className="text-beetz-yellow" /> Enviar parabéns</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-beetz-gray" aria-label="Fechar"><X size={18} /></button>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-3">
              <Check size={26} />
            </div>
            <p className="font-bold">E-mail enviado pra {safeFirst}! 🎉</p>
            <p className="text-sm text-beetz-dark/50 mt-1">O envio ficou registrado no log de e-mails.</p>
            <button onClick={onClose} className="mt-5 honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm">
              Fechar
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3 bg-beetz-gray rounded-2xl p-3">
              <Avatar src={avatarUrl} name={name} size="sm" />
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{name}</p>
                <p className="text-xs text-beetz-dark/50">
                  Vai pro e-mail cadastrado dessa pessoa.
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-beetz-dark/60 mb-1 block">Assunto</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-xl border border-beetz-dark/15 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-beetz-yellow"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-beetz-dark/60 mb-1 block">Mensagem</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={11}
                className="w-full rounded-xl border border-beetz-dark/15 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-beetz-yellow resize-y leading-relaxed"
              />
              <p className="text-[11px] text-beetz-dark/40 mt-1">
                Vai sair no modelo da Beetz, com o cabeçalho amarelo de aniversário.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleSend}
                disabled={sending || !subject.trim() || !message.trim()}
                className="flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-4 py-2.5 rounded-xl text-sm disabled:opacity-60"
              >
                <Send size={14} /> {sending ? 'Enviando...' : 'Enviar parabéns'}
              </button>
              <button onClick={onClose} className="text-sm font-semibold text-beetz-dark/50 px-4 py-2.5 rounded-xl hover:bg-beetz-gray">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

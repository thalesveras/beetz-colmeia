import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { loadQRCode } from '../../lib/qr'
import type { Profile } from '../../lib/types'

// Crachá digital do colaborador: código ÚNICO e permanente, no topo do
// perfil. O chip mostra o código curto; o toque abre o QR GIGANTE que o
// gerente/técnico escaneia na porta pra validar a participação no evento
// (entrada e saída — e é a validação que libera o certificado).
// O QR carrega `beetz:p:<id do perfil>`; o código de 6 letras é o plano B
// de digitar na mão quando a câmera não colabora.
export default function StaffBadge({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false)
  const [qrErro, setQrErro] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    loadQRCode()
      .then((QRCode: any) => {
        if (!alive || !qrRef.current) return
        qrRef.current.innerHTML = ''
        new QRCode(qrRef.current, {
          text: `beetz:p:${profile.id}`,
          width: 280, height: 280,
          colorDark: '#050505', colorLight: '#ffffff'
        })
      })
      .catch(() => { if (alive) setQrErro(true) })
    return () => { alive = false }
  }, [open, profile.id])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 honey-gradient text-beetz-dark font-extrabold px-4 py-2.5 rounded-2xl text-sm shadow-soft hover:brightness-105 active:scale-[0.97] transition"
        title="Toque pra abrir o QR grande — é ele que valida sua participação na porta do evento"
      >
        🎫 Meu crachá
        {profile.staff_code && (
          <span className="bg-beetz-dark/10 rounded-lg px-2 py-0.5 font-mono tracking-widest text-xs">
            {profile.staff_code}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden text-center" onClick={(e) => e.stopPropagation()}>
            <div className="dark-gradient text-white px-5 py-4 flex items-center justify-between gap-3">
              <div className="text-left">
                <p className="text-[11px] font-bold uppercase tracking-wider text-beetz-yellow">Crachá Beetz</p>
                <p className="font-extrabold leading-tight">{profile.first_name} {profile.last_name}</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Fechar"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-3">
              <div className="flex justify-center">
                {qrErro ? (
                  <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-6">
                    Não deu pra gerar o QR agora — mostre o código abaixo pro gerente digitar.
                  </p>
                ) : (
                  <div ref={qrRef} className="p-3 bg-white rounded-2xl border border-beetz-dark/10" />
                )}
              </div>
              {profile.staff_code && (
                <p className="font-mono text-2xl font-extrabold tracking-[0.3em]">{profile.staff_code}</p>
              )}
              <p className="text-xs text-beetz-dark/55 leading-relaxed">
                Este código é seu, <strong>único e permanente</strong>. Apresente na entrada e na
                saída do evento — é a validação que registra sua participação e libera o
                certificado.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

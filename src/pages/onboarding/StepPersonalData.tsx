import { useEffect, useState } from 'react'
import type { OnboardingData } from './OnboardingWizard'
import Avatar from '../../components/ui/Avatar'
import { cleanCpf, formatCpf, isValidCpf } from '../../lib/cpf'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabaseClient'

interface Props { data: OnboardingData; update: (patch: Partial<OnboardingData>) => void }

// Encolhe a foto no navegador (máx. 800px, JPEG 85%): a selfie de 6 MB da
// câmera vira ~150 KB antes de subir.
async function encolherFoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const escala = Math.min(1, 800 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * escala)
  c.height = Math.round(bmp.height * escala)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('sem blob'))), 'image/jpeg', 0.85))
}

const ufs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
const PIX_KEY_TYPES = ['CPF', 'Telefone', 'Email', 'Chave aleatória']

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-sm font-medium block mb-1">{label}</label>{children}</div>
}

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

export default function StepPersonalData({ data, update }: Props) {
  const { userId, isDemoMode } = useAuth()
  const [fotoBusy, setFotoBusy] = useState(false)
  const [fotoErro, setFotoErro] = useState<string | null>(null)

  // Cidades do IBGE pra UF escolhida: estado vem primeiro e a cidade vira um
  // select certeiro (nada de "São Luis"/"Sao Luís"/"SLZ" no banco). Se a API
  // falhar, o campo volta a ser texto livre — cadastro nunca trava por isso.
  const [cidades, setCidades] = useState<string[]>([])
  const [cidadesBusy, setCidadesBusy] = useState(false)
  useEffect(() => {
    const uf = (data.state ?? '').trim()
    if (!uf) { setCidades([]); return }
    let vivo = true
    setCidadesBusy(true)
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((lista: { nome: string }[]) => { if (vivo) setCidades(lista.map((m) => m.nome)) })
      .catch(() => { if (vivo) setCidades([]) })
      .finally(() => { if (vivo) setCidadesBusy(false) })
    return () => { vivo = false }
  }, [data.state])

  // CEP → ViaCEP preenche rua, bairro, cidade e estado de uma vez.
  const [cepBusy, setCepBusy] = useState(false)
  const [cepErro, setCepErro] = useState<string | null>(null)
  async function buscarCep(valor: string) {
    const numeros = valor.replace(/\D/g, '')
    if (numeros.length !== 8) return
    setCepBusy(true)
    setCepErro(null)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${numeros}/json/`)
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
      if (j.erro) { setCepErro('CEP não encontrado — confere os números (ou preencha o endereço à mão).'); return }
      update({
        // Só completa o que estiver vazio? Não: quem digitou o CEP QUER o
        // endereço dele — sobrescreve rua/bairro/cidade/UF com o oficial.
        address_street: j.logradouro || data.address_street || '',
        address_neighborhood: j.bairro || data.address_neighborhood || '',
        city: j.localidade || data.city || '',
        state: j.uf || data.state || ''
      })
    } catch {
      setCepErro('Não deu pra buscar o CEP agora — preencha o endereço à mão.')
    } finally {
      setCepBusy(false)
    }
  }

  // A foto vai DIRETO pro Storage (pasta do próprio usuário), encolhida —
  // nunca mais base64 gigante dentro do banco (era isso que deixava Admin,
  // Turma e Aniversariantes de joelhos: 33 MB de fotos viajando por visita).
  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFotoErro(null)
    // Demo/sem login ainda: prévia local, sem tocar em Storage.
    if (isDemoMode || !userId) {
      const reader = new FileReader()
      reader.onload = () => update({ avatar_url: reader.result as string })
      reader.readAsDataURL(file)
      return
    }
    setFotoBusy(true)
    try {
      const blob = await encolherFoto(file)
      const path = `${userId}/avatar-${Date.now()}.jpg`
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (error) throw error
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      update({ avatar_url: pub.publicUrl })
    } catch {
      setFotoErro('Não deu pra enviar a foto agora — tenta de novo ou siga sem ela (dá pra colocar depois no perfil).')
    } finally {
      setFotoBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar src={data.avatar_url} name={`${data.first_name || ''} ${data.last_name || ''}`} size="xl" />
        <div>
          <label className={`inline-block bg-beetz-dark text-white text-sm font-semibold px-4 py-2 rounded-xl cursor-pointer hover:bg-black transition ${fotoBusy ? 'opacity-60 pointer-events-none' : ''}`}>
            {fotoBusy ? 'Enviando...' : 'Escolher foto'}
            <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </label>
          <p className="text-xs text-beetz-dark/50 mt-2">Qualquer foto serve — a gente ajusta o tamanho.</p>
          {fotoErro && <p className="text-xs text-red-600 mt-1">{fotoErro}</p>}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Nome"><input required className={inputClass} value={data.first_name || ''} onChange={(e) => update({ first_name: e.target.value })} /></Field>
        <Field label="Sobrenome"><input required className={inputClass} value={data.last_name || ''} onChange={(e) => update({ last_name: e.target.value })} /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Data de nascimento"><input type="date" className={inputClass} value={data.birth_date || ''} onChange={(e) => update({ birth_date: e.target.value })} /></Field>
        <Field label="CPF">
          <input
            className={`${inputClass} ${cleanCpf(data.cpf).length > 0 && !isValidCpf(data.cpf) ? 'border-red-400 focus:ring-red-300' : ''}`}
            placeholder="000.000.000-00"
            inputMode="numeric"
            maxLength={14}
            value={data.cpf || ''}
            onChange={(e) => update({ cpf: formatCpf(e.target.value) })}
          />
          {cleanCpf(data.cpf).length > 0 && !isValidCpf(data.cpf) && (
            <p className="text-xs text-red-600 mt-1">
              {cleanCpf(data.cpf).length < 11 ? 'CPF incompleto — são 11 números.' : 'Esse CPF não existe — confere os números.'}
            </p>
          )}
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Telefone"><input className={inputClass} placeholder="(00) 00000-0000" value={data.phone || ''} onChange={(e) => update({ phone: e.target.value })} /></Field>
        <Field label="Email"><input type="email" required className={inputClass} value={data.email || ''} onChange={(e) => update({ email: e.target.value })} /></Field>
      </div>
      <div className="border-t border-beetz-dark/10 pt-4">
        <p className="text-sm font-semibold mb-1">Endereço</p>
        <p className="text-xs text-beetz-dark/50 mb-3">Digite o CEP que a gente preenche rua, bairro, cidade e estado sozinho.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="CEP">
            <input
              className={inputClass}
              placeholder="00000-000"
              inputMode="numeric"
              maxLength={9}
              value={data.cep || ''}
              onChange={(e) => {
                const n = e.target.value.replace(/\D/g, '').slice(0, 8)
                const mascarado = n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n
                update({ cep: mascarado })
                if (n.length === 8) buscarCep(n)
              }}
            />
            {cepBusy && <p className="text-xs text-beetz-dark/50 mt-1">Buscando endereço...</p>}
            {cepErro && <p className="text-xs text-amber-700 mt-1">{cepErro}</p>}
          </Field>
          <Field label="Estado">
            <select className={inputClass} value={data.state || ''} onChange={(e) => update({ state: e.target.value, city: '' })}>
              <option value="">Selecionar...</option>
              {ufs.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Field label="Cidade">
            {cidades.length > 0 ? (
              <select className={inputClass} value={data.city || ''} onChange={(e) => update({ city: e.target.value })}>
                <option value="">{cidadesBusy ? 'Carregando cidades...' : 'Selecionar...'}</option>
                {/* Cidade gravada antes da lista existir (ou vinda do Zoho com
                    grafia própria) continua selecionável — nada se perde. */}
                {data.city && !cidades.includes(data.city) && <option value={data.city}>{data.city}</option>}
                {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input
                className={inputClass}
                placeholder={!data.state ? 'Escolha o estado primeiro' : cidadesBusy ? 'Carregando cidades...' : ''}
                value={data.city || ''}
                onChange={(e) => update({ city: e.target.value })}
              />
            )}
          </Field>
          <Field label="Bairro">
            <input className={inputClass} value={data.address_neighborhood || ''} onChange={(e) => update({ address_neighborhood: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Endereço (rua e número)">
            <input className={inputClass} placeholder="Ex.: Rua das Abelhas, 123" value={data.address_street || ''} onChange={(e) => update({ address_street: e.target.value })} />
          </Field>
        </div>
      </div>

      <div className="border-t border-beetz-dark/10 pt-4">
        <p className="text-sm font-semibold mb-1">Dados para pagamento (Pix)</p>
        <p className="text-xs text-beetz-dark/50 mb-3">Usado pela Diretoria pra fazer repasses e pagamentos. Só a Diretoria consegue ver isso.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Tipo de chave Pix">
            <select className={inputClass} value={data.pix_key_type || ''} onChange={(e) => update({ pix_key_type: e.target.value })}>
              <option value="">Selecionar...</option>
              {PIX_KEY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Chave Pix"><input className={inputClass} placeholder="CPF, telefone, e-mail ou chave aleatória" value={data.pix_key || ''} onChange={(e) => update({ pix_key: e.target.value })} /></Field>
        </div>
        <div className="mt-4">
          <Field label="Nome do titular (se a chave não for sua)">
            <input className={inputClass} placeholder="Deixe em branco se a chave for sua" value={data.pix_owner_name || ''} onChange={(e) => update({ pix_owner_name: e.target.value })} />
          </Field>
        </div>
      </div>
    </div>
  )
}

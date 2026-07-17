import { useState } from 'react'
import { Save, X } from 'lucide-react'
import { createSupplier, updateSupplier } from '../../lib/dataService'
import type { PixKeyType, Supplier } from '../../lib/types'

interface Props {
  supplier: Supplier | null
  onClose: () => void
  onSaved: () => void
}

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const PIX_TYPES: PixKeyType[] = ['CNPJ', 'CPF', 'E-mail', 'Telefone', 'Aleatória']

// Ficha completa do fornecedor. Antes eram dois campos — nome e um "contato"
// que virava saco de gato (telefone, e-mail, o que coubesse). Quem paga precisa
// saber pra QUEM e ONDE mandar; por isso Pix e CNPJ têm campo próprio.
export default function SupplierFormModal({ supplier, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    cnpj: supplier?.cnpj ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    pix_key: supplier?.pix_key ?? '',
    pix_key_type: (supplier?.pix_key_type ?? '') as PixKeyType | '',
    notes: supplier?.notes ?? '',
    // Só aparece se já existir: é campo legado, não quero que ninguém preencha
    // de novo — mas apagar o que está lá seria perder dado.
    contact: supplier?.contact ?? ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.name.trim()) { setError('O nome é obrigatório.'); return }
    // Chave sem tipo vira chave que ninguém sabe usar: se digitou uma, diga qual.
    if (form.pix_key.trim() && !form.pix_key_type) {
      setError('Escolha o tipo da chave Pix.')
      return
    }
    setSaving(true); setError(null)
    const payload = {
      name: form.name.trim(),
      cnpj: form.cnpj.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      pix_key: form.pix_key.trim() || null,
      pix_key_type: form.pix_key.trim() ? (form.pix_key_type as PixKeyType) : null,
      notes: form.notes.trim() || null,
      contact: form.contact.trim() || null
    }
    try {
      if (supplier) await updateSupplier(supplier.id, payload)
      else await createSupplier(payload)
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível salvar.')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <h3 className="text-lg font-extrabold">{supplier ? 'Editar fornecedor' : 'Novo fornecedor'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-beetz-gray" aria-label="Fechar"><X size={18} /></button>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Nome / Razão social *</label>
            <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">CNPJ / CPF</label>
            <input className={inputClass} value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0001-00" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Telefone</label>
              <input className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(98) 99999-0000" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">E-mail</label>
              <input type="email" className={inputClass} value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
          </div>

          <div className="bg-beetz-yellow/10 border border-beetz-yellow/40 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-beetz-dark/50">Pagamento</p>
            <div className="grid sm:grid-cols-[130px_1fr] gap-3">
              <div>
                <label className="text-sm font-medium block mb-1">Tipo da chave</label>
                <select className={inputClass} value={form.pix_key_type} onChange={(e) => set('pix_key_type', e.target.value)}>
                  <option value="">—</option>
                  {PIX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Chave Pix</label>
                <input className={inputClass} value={form.pix_key} onChange={(e) => set('pix_key', e.target.value)} placeholder="Chave para pagamento" />
              </div>
            </div>
            <p className="text-xs text-beetz-dark/40">
              Fica visível para quem tem acesso ao Financeiro. Confira a chave com o fornecedor antes de pagar — o sistema guarda, não valida.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Observações</label>
            <textarea className={`${inputClass} min-h-[70px]`} value={form.notes} onChange={(e) => set('notes', e.target.value)}
              placeholder="Prazo de entrega, condições, quem atende..." />
          </div>

          {form.contact && (
            <div>
              <label className="text-sm font-medium block mb-1">Contato (campo antigo)</label>
              <input className={inputClass} value={form.contact} onChange={(e) => set('contact', e.target.value)} />
              <p className="text-xs text-beetz-dark/40 mt-1">
                Vinha de um campo único, antes de telefone e e-mail existirem separados. Mova o conteúdo pros campos certos e deixe este vazio.
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={saving || !form.name.trim()}
              className="flex items-center gap-2 honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-60">
              <Save size={16} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button onClick={onClose} className="text-sm text-beetz-dark/50 hover:text-beetz-dark px-3">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

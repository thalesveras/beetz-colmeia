import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { canAddExpense } from '../../lib/permissions'
import { createExpense, createStockMovement, getStockBalances, isPositiveMovementType, listEvents, listProducts, listStockLocations, transferStock } from '../../lib/dataService'
import type { EventItem, MovementType, Product, StockBalance, StockLocation } from '../../lib/types'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
// 'Entrada'/'Saída' genéricos seguem válidos no banco (dados antigos), mas o
// formulário de nova movimentação só oferece os tipos que refletem o fluxo
// real: compra entra, ajuste pode ir pros dois lados, perda sai. "Envio pro
// evento" e "Devolução do evento" não aparecem aqui de propósito — nascem
// automaticamente ao aprovar/devolver uma transferência (aba Transferências).
// Consumo Interno e Quebra entraram na Fase 1 da inteligência de estoque:
// separam "a equipe bebeu/usou" de "quebrou no transporte" — dois números que
// a Perda genérica misturava e que contam histórias diferentes no fechamento.
const movementTypes: MovementType[] = ['Compra', 'Ajuste (entrada)', 'Ajuste (saída)', 'Consumo Interno', 'Quebra', 'Perda']
// 'Transferência' não é um tipo do banco: é o atalho de 1 passo que vira um
// par Saída (origem) + Entrada (destino) espelhado, gravado atomicamente pela
// RPC transfer_stock. Antes, mover entre estoques exigia pedido + aprovação
// (com evento obrigatório) ou dois lançamentos soltos na mão.
type FormType = MovementType | 'Transferência'
const formTypes: FormType[] = [...movementTypes, 'Transferência']

interface Props {
  fixedEventId?: string
  onSaved: () => void
}

export default function StockMovementForm({ fixedEventId, onSaved }: Props) {
  const { userId, accessRole } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [balances, setBalances] = useState<StockBalance[]>([])
  const [saving, setSaving] = useState(false)

  const [productId, setProductId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [toLocationId, setToLocationId] = useState('')
  const [eventId, setEventId] = useState(fixedEventId || '')
  const [movementType, setMovementType] = useState<FormType>('Compra')
  const [quantity, setQuantity] = useState(1)
  const [unitCost, setUnitCost] = useState('')
  // Ligado por padrão: o vínculo estoque↔financeiro é opcional no modelo, mas
  // opcional-desligado é o campo que ninguém preenche. Quem NÃO quiser a
  // despesa desmarca — o caminho comum vira o caminho fácil.
  const [generateExpense, setGenerateExpense] = useState(true)
  // Quem não pode lançar despesa (ex: Operacional) não gera despesa por
  // tabela: a Compra entra no estoque e a tela avisa que falta o financeiro.
  // Sem isso, a flag can_add_expense diria uma coisa e o sistema faria outra.
  const allowExpense = canAddExpense(accessRole)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    listProducts().then(setProducts)
    listStockLocations().then(setLocations)
    getStockBalances().then(setBalances)
    if (!fixedEventId) listEvents().then(setEvents)
  }, [fixedEventId])

  const isTransfer = movementType === 'Transferência'
  // Compra e Ajuste são patrimônio da empresa: o banco RECUSA vínculo com
  // evento (trigger check_movement_event_coherence). O form escondia o erro e
  // ficava "Salvando..." eterno — agora esconde o campo e não manda o vínculo.
  // Compra no almoxarifado DO evento continua valendo (gelo comprado na porta
  // da festa): o local já diz de quem é, sem precisar do vínculo.
  const isWarehouseOnly = movementType === 'Compra' || movementType === 'Ajuste (entrada)' || movementType === 'Ajuste (saída)'

  // Aviso não-bloqueante: mostra o saldo atual quando o tipo escolhido é de
  // saída e a quantidade vai deixar esse produto/estoque negativo. Não
  // impede o registro — às vezes o saldo real já está errado e a
  // movimentação é justamente pra corrigir isso. Transferência sempre é
  // saída do ponto de vista da origem.
  const currentBalance = balances.find((b) => b.product_id === productId && b.stock_location_id === locationId)?.balance ?? 0
  const isOutgoing = isTransfer || !isPositiveMovementType(movementType as MovementType)
  const resultingBalance = isOutgoing ? currentBalance - quantity : currentBalance + quantity
  const showNegativeWarning = !!(productId && locationId && isOutgoing && quantity > 0 && resultingBalance < 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productId || !locationId || !userId) return
    if (isTransfer) {
      if (!toLocationId || toLocationId === locationId) return
      setSaving(true)
      try {
        await transferStock({
          product_id: productId, from_location_id: locationId,
          to_location_id: toLocationId, quantity, notes: notes || null
        })
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Erro ao transferir.')
        setSaving(false)
        return
      }
      setSaving(false)
      setProductId(''); setLocationId(''); setToLocationId(''); setQuantity(1); setNotes('')
      onSaved()
      return
    }
    setSaving(true)
    // Preço só em Compra: alimenta o custo médio (product_avg_costs) e o valor
    // do estoque em R$. Vírgula vira ponto (teclado brasileiro digita "4,50").
    const parsedCost = movementType === 'Compra' && unitCost.trim()
      ? Number(unitCost.replace(',', '.')) || null
      : null
    let movement
    try {
      movement = await createStockMovement({
        product_id: productId,
        stock_location_id: locationId,
        event_id: isWarehouseOnly ? null : (fixedEventId || eventId || null),
        // Cast seguro: o caminho Transferência já retornou lá em cima.
        movement_type: movementType as MovementType,
        quantity,
        unit_cost: parsedCost,
        notes: notes || null,
        created_by: userId
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível registrar a movimentação.')
      setSaving(false)
      return
    }

    // Compra com preço pode gerar a despesa já vinculada à movimentação. Um
    // lançamento, dois efeitos: estoque ganha quantidade+custo, financeiro
    // ganha o gasto como Pendente pra Diretoria revisar. Se a compra foi no
    // almoxarifado DE UM EVENTO (gelo comprado na porta da festa), a despesa
    // nasce no evento certo — o local diz de quem é o gasto. Se a despesa
    // falhar, a Compra fica — o aviso diz o que faltou.
    if (movementType === 'Compra' && generateExpense && allowExpense && parsedCost) {
      const productName = products.find((p) => p.id === productId)?.name ?? 'produto'
      const locationEventId = locations.find((l) => l.id === locationId)?.event_id ?? null
      try {
        await createExpense({
          event_id: locationEventId,
          status: 'Pendente',
          category: 'Estoque',
          description: `Compra de estoque: ${productName} (${quantity} un)`,
          quantity,
          unit_value: parsedCost,
          dex_fee: 0,
          receipt_data: null, payment_method: null, signature_data: null, repasse_data: null,
          created_by: userId, team_member_id: null, supplier_id: null,
          pending_team_member_id: null,
          stock_movement_id: movement.id
        })
      } catch {
        alert('A compra entrou no estoque, mas a despesa não pôde ser criada — lance-a manualmente no Financeiro.')
      }
    }

    setSaving(false)
    setProductId(''); setLocationId(''); setQuantity(1); setUnitCost(''); setNotes('')
    if (!fixedEventId) setEventId('')
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-beetz-gray rounded-2xl p-5 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium block mb-1">Produto</label>
          <select required className={inputClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Selecionar...</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">{isTransfer ? 'De (estoque de origem)' : 'Estoque'}</label>
          <select required className={inputClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Selecionar...</option>
            <optgroup label="Almoxarifados">
              {locations.filter((l) => !l.event_id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </optgroup>
            {locations.some((l) => l.event_id) && (
              <optgroup label="Eventos (estoque na festa)">
                {locations.filter((l) => l.event_id).map((l) => <option key={l.id} value={l.id}>🎪 {l.name}</option>)}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium block mb-1">Tipo</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {formTypes.map((t) => (
            <button
              type="button" key={t} onClick={() => setMovementType(t)}
              className={`text-sm font-medium px-3 py-2.5 rounded-xl border transition-colors ${
                movementType === t ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark' : 'border-beetz-dark/15 text-beetz-dark/70 bg-white'
              }`}
            >
              {t === 'Transferência' ? '⇄ Transferência' : t}
            </button>
          ))}
        </div>
      </div>

      {isTransfer && (
        <div>
          <label className="text-sm font-medium block mb-1">Para (estoque de destino)</label>
          <select required className={inputClass} value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
            <option value="">Selecionar...</option>
            <optgroup label="Almoxarifados">
              {locations.filter((l) => !l.event_id && l.id !== locationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </optgroup>
            {locations.some((l) => l.event_id && l.id !== locationId) && (
              <optgroup label="Eventos (estoque na festa)">
                {locations.filter((l) => l.event_id && l.id !== locationId).map((l) => <option key={l.id} value={l.id}>🎪 {l.name}</option>)}
              </optgroup>
            )}
          </select>
          <p className="text-xs text-beetz-dark/40 mt-1">
            Sai da origem e entra no destino na mesma hora, como um par ligado: editar ou cancelar
            um lado ajusta o outro sozinho. No histórico aparece como uma linha só.
          </p>
        </div>
      )}

      <div className={movementType === 'Compra' ? 'grid sm:grid-cols-2 gap-4' : ''}>
        <div>
          <label className="text-sm font-medium block mb-1">Quantidade</label>
          <input type="number" min={0.01} step="0.01" required className={inputClass} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </div>
        {movementType === 'Compra' && (
          <div>
            <label className="text-sm font-medium block mb-1">Preço unitário (R$)</label>
            <input type="text" inputMode="decimal" placeholder="Ex: 4,50" className={inputClass}
              value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            <p className="text-xs text-beetz-dark/40 mt-1">
              Alimenta o custo médio e o valor do estoque. Sem preço, a compra entra só em quantidade.
            </p>
            {unitCost.trim() && !allowExpense && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                Seu perfil não lança despesas: a compra entra no estoque e alguém do Financeiro registra o gasto.
              </p>
            )}
            {unitCost.trim() && allowExpense && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={generateExpense} onChange={(e) => setGenerateExpense(e.target.checked)}
                  className="rounded border-beetz-dark/20" />
                <span className="text-xs text-beetz-dark/60">
                  Gerar despesa no Financeiro ({(quantity * (Number(unitCost.replace(',', '.')) || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, entra como Pendente)
                </span>
              </label>
            )}
          </div>
        )}
        {showNegativeWarning && (
          <p className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
            <AlertTriangle size={13} className="shrink-0" />
            Saldo atual aqui: {currentBalance}. Essa saída vai deixar {resultingBalance} — negativo.
          </p>
        )}
      </div>

      {!fixedEventId && !isTransfer && !isWarehouseOnly && (
        <div>
          <label className="text-sm font-medium block mb-1">Evento (opcional)</label>
          <select className={inputClass} value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Nenhum (movimentação avulsa)</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="text-sm font-medium block mb-1">Observações</label>
        <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || (isTransfer && (!toLocationId || toLocationId === locationId))}
          className="honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60"
        >
          {saving ? 'Salvando...' : isTransfer ? 'Transferir' : 'Registrar movimentação'}
        </button>
      </div>
    </form>
  )
}

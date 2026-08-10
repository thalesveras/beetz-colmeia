import { eventLabel } from '../../lib/eventLabel'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Minus, Plus, Search, X } from 'lucide-react'
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

// Modelo de CESTA: a caminhonete chega com 15 produtos e a pessoa lança tudo
// numa sessão só — o contexto (tipo, estoque, evento, observação) é definido
// uma vez e cada produto vira um item da lista. O caminho de 1 item continua
// de 1 passo: preencher e registrar direto, sem obrigar o "adicionar à lista".
interface ItemCesta {
  productId: string
  quantity: number
  unitCost: string
}

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

  const [busca, setBusca] = useState('')
  const buscaRef = useRef<HTMLInputElement | null>(null)
  const [productId, setProductId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [toLocationId, setToLocationId] = useState('')
  const [eventId, setEventId] = useState(fixedEventId || '')
  const [movementType, setMovementType] = useState<FormType>('Compra')
  const [quantity, setQuantity] = useState(1)
  const [unitCost, setUnitCost] = useState('')
  const [cesta, setCesta] = useState<ItemCesta[]>([])
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
  const isOutgoing = isTransfer || !isPositiveMovementType(movementType as MovementType)

  const nomeProduto = (id: string) => products.find((p) => p.id === id)?.name ?? 'produto'
  const parseCost = (c: string) => Number(c.replace(',', '.')) || 0

  // Busca doma o dropdown gigante: digitou "vodka" acha as vodkas, e BIPOU o
  // código de barras (leitor ou dedo) acha o produto na hora. O produto já
  // escolhido nunca some das opções — senão o select mentiria.
  const produtosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const base = q
      ? products.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode ?? '').includes(busca.trim()))
      : products
    const selecionado = productId ? products.find((p) => p.id === productId) : null
    return selecionado && !base.some((p) => p.id === selecionado.id) ? [selecionado, ...base] : base
  }, [products, busca, productId])

  // MODO FARDO: produto com units_per_pack cadastrado pode ser lançado em
  // fardos — o sistema DESMEMBRA na hora (3 fardos × 12 = 36 unidades) e,
  // na Compra, divide o preço do fardo pelo pack (custo médio fica por
  // unidade, como o estoque inteiro conta).
  const [emFardos, setEmFardos] = useState(false)
  const produtoAtual = products.find((p) => p.id === productId)
  const upp = produtoAtual?.units_per_pack ?? 0
  const fatorFardo = emFardos && upp > 1 ? upp : 1
  const itemAtualEfetivo = (): ItemCesta => ({
    productId,
    quantity: Math.round(quantity * fatorFardo * 100) / 100,
    unitCost: emFardos && upp > 1 && unitCost.trim()
      ? String(Math.round((parseCost(unitCost) / upp) * 10000) / 10000)
      : unitCost
  })

  const itemAtualValido = !!productId && quantity > 0
  // A sessão soma a cesta + o que está preenchido agora ("esqueci de apertar
  // adicionar" não pode engolir o último item na hora de registrar).
  const itensDaSessao = useMemo(() => {
    const lista = [...cesta]
    if (itemAtualValido) lista.push(itemAtualEfetivo())
    return lista
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cesta, productId, quantity, unitCost, itemAtualValido, emFardos])

  // Aviso não-bloqueante de saldo negativo, agora somando a SESSÃO inteira:
  // 3 itens do mesmo produto na cesta contam juntos contra o saldo. Não
  // impede o registro — às vezes o saldo real já está errado e a
  // movimentação é justamente pra corrigir isso.
  const negativos = useMemo(() => {
    if (!locationId || !isOutgoing) return []
    const porProduto = new Map<string, number>()
    itensDaSessao.forEach((i) => porProduto.set(i.productId, (porProduto.get(i.productId) ?? 0) + i.quantity))
    const avisos: { nome: string; saldo: number; resulta: number }[] = []
    porProduto.forEach((qtd, pid) => {
      const saldo = balances.find((b) => b.product_id === pid && b.stock_location_id === locationId)?.balance ?? 0
      if (qtd > 0 && saldo - qtd < 0) avisos.push({ nome: nomeProduto(pid), saldo, resulta: saldo - qtd })
    })
    return avisos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itensDaSessao, locationId, isOutgoing, balances, products])

  const totalCompraSessao = itensDaSessao.reduce((s, i) => s + i.quantity * parseCost(i.unitCost), 0)
  const algumPrecoNaSessao = itensDaSessao.some((i) => i.unitCost.trim())

  function adicionarItem() {
    if (!itemAtualValido) return
    // Cesta guarda SEMPRE unidades e custo por unidade — o fardo já foi
    // desmembrado aqui.
    const efetivo = itemAtualEfetivo()
    setCesta((prev) => {
      // Mesmo produto com o mesmo preço? Soma na linha que já existe.
      const ix = prev.findIndex((i) => i.productId === efetivo.productId && i.unitCost.trim() === efetivo.unitCost.trim())
      if (ix >= 0) {
        const copia = [...prev]
        copia[ix] = { ...copia[ix], quantity: copia[ix].quantity + efetivo.quantity }
        return copia
      }
      return [...prev, efetivo]
    })
    setProductId(''); setQuantity(1); setUnitCost(''); setBusca(''); setEmFardos(false)
    buscaRef.current?.focus()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const itens = itensDaSessao
    if (!locationId || !userId || itens.length === 0) return
    if (isTransfer && (!toLocationId || toLocationId === locationId)) return
    setSaving(true)

    // Registra item a item e reporta o que falhou SEM desfazer o que entrou —
    // meio caminho andado é melhor que recomeçar a lista dos 15 produtos.
    const falhas: string[] = []
    let sucessos = 0
    for (const item of itens) {
      try {
        if (isTransfer) {
          await transferStock({
            product_id: item.productId, from_location_id: locationId,
            to_location_id: toLocationId, quantity: item.quantity, notes: notes || null
          })
        } else {
          // Preço só em Compra: alimenta o custo médio (product_avg_costs) e o
          // valor do estoque em R$. Vírgula vira ponto ("4,50" do teclado BR).
          const parsedCost = movementType === 'Compra' && item.unitCost.trim() ? parseCost(item.unitCost) || null : null
          const movement = await createStockMovement({
            product_id: item.productId,
            stock_location_id: locationId,
            event_id: isWarehouseOnly ? null : (fixedEventId || eventId || null),
            movement_type: movementType as MovementType,
            quantity: item.quantity,
            unit_cost: parsedCost,
            notes: notes || null,
            created_by: userId
          })
          // Compra com preço gera a despesa vinculada à movimentação (uma por
          // item, cada uma amarrada no seu lançamento — editar/cancelar a
          // Compra acompanha a despesa certa). Se a despesa falhar, a Compra
          // fica e o aviso diz o que faltou.
          if (movementType === 'Compra' && generateExpense && allowExpense && parsedCost) {
            const locationEventId = locations.find((l) => l.id === locationId)?.event_id ?? null
            try {
              await createExpense({
                event_id: locationEventId,
                status: 'Pendente',
                category: 'Estoque',
                description: `Compra de estoque: ${nomeProduto(item.productId)} (${item.quantity} un)`,
                quantity: item.quantity,
                unit_value: parsedCost,
                dex_fee: 0,
                receipt_data: null, payment_method: null, signature_data: null, repasse_data: null,
                created_by: userId, team_member_id: null, supplier_id: null,
                pending_team_member_id: null,
                stock_movement_id: movement.id
              })
            } catch {
              falhas.push(`despesa de ${nomeProduto(item.productId)} (a compra entrou; lance o gasto no Financeiro)`)
            }
          }
        }
        sucessos++
      } catch (err) {
        falhas.push(`${nomeProduto(item.productId)}${err instanceof Error ? ` — ${err.message}` : ''}`)
      }
    }

    setSaving(false)
    if (falhas.length > 0) {
      alert(`${sucessos > 0 ? `${sucessos} de ${itens.length} itens entraram. ` : ''}Não consegui registrar: ${falhas.join('; ')}.`)
    }
    if (sucessos > 0) {
      setCesta([]); setProductId(''); setBusca(''); setLocationId(''); setToLocationId(''); setQuantity(1); setUnitCost(''); setNotes('')
      if (!fixedEventId) setEventId('')
      onSaved()
    }
  }

  const totalItens = itensDaSessao.length
  return (
    <form onSubmit={handleSubmit} className="bg-beetz-gray rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Tipo primeiro: é ele que decide quais campos existem embaixo. */}
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

      <div className={isTransfer ? 'grid sm:grid-cols-2 gap-4' : ''}>
        <div>
          <label className="text-sm font-medium block mb-1">{isTransfer ? 'De (estoque de origem)' : 'Estoque'}</label>
          <select required className={inputClass + ' min-w-0'} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
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
        {isTransfer && (
          <div>
            <label className="text-sm font-medium block mb-1">Para (estoque de destino)</label>
            <select required className={inputClass + ' min-w-0'} value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
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
              Sai da origem e entra no destino na mesma hora, como um par ligado. No histórico aparece como uma linha só.
            </p>
          </div>
        )}
      </div>

      {!fixedEventId && !isTransfer && !isWarehouseOnly && (
        <div>
          <label className="text-sm font-medium block mb-1">Evento (opcional)</label>
          <select className={inputClass + ' min-w-0'} value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Nenhum (movimentação avulsa)</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{eventLabel(ev)}</option>)}
          </select>
        </div>
      )}

      {/* Itens: busca doma a lista, o stepper serve o polegar e "Adicionar à
          lista" abre a cesta pra lançar a chegada inteira numa sessão só. */}
      <div className="bg-white rounded-xl p-3.5 sm:p-4 space-y-3 border border-beetz-dark/5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold">{cesta.length > 0 ? `Itens (${cesta.length} na lista)` : 'Item'}</label>
          {cesta.length > 0 && (
            <button type="button" onClick={() => setCesta([])} className="text-xs font-semibold text-beetz-dark/40 hover:text-red-600">
              Limpar lista
            </button>
          )}
        </div>

        {cesta.length > 0 && (
          <div className="space-y-1.5">
            {cesta.map((i, ix) => (
              <div key={`${i.productId}-${ix}`} className="flex items-center gap-2 bg-beetz-gray rounded-lg px-3 py-2">
                <span className="flex-1 min-w-0 truncate text-sm font-medium">{nomeProduto(i.productId)}</span>
                <span className="text-xs font-bold bg-beetz-yellow/60 text-beetz-dark px-2 py-0.5 rounded-full shrink-0">{i.quantity}</span>
                {movementType === 'Compra' && i.unitCost.trim() && (
                  <span className="text-xs text-beetz-dark/50 shrink-0 hidden sm:inline">
                    × {parseCost(i.unitCost).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                )}
                <button type="button" onClick={() => setCesta((prev) => prev.filter((_, j) => j !== ix))}
                  className="text-beetz-dark/35 hover:text-red-600 p-1 shrink-0" title="Tirar da lista">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-beetz-dark/30" />
          <input
            ref={buscaRef}
            className={inputClass + ' pl-9'}
            placeholder="Buscar produto pelo nome..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <select required={cesta.length === 0} className={inputClass + ' min-w-0'} value={productId} onChange={(e) => { setProductId(e.target.value); setEmFardos(false) }}>
          <option value="">{busca.trim() ? `Selecionar (${produtosFiltrados.length} na busca)...` : 'Selecionar produto...'}</option>
          {produtosFiltrados.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
        </select>

        {/* Fardo cadastrado no produto → dá pra lançar em fardos, com a
            conversão explícita na tela (nada de conta de cabeça na carga). */}
        {upp > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-beetz-dark/15 overflow-hidden text-xs">
              <button type="button" onClick={() => setEmFardos(false)}
                className={`px-3 py-1.5 font-bold ${!emFardos ? 'bg-beetz-dark text-white' : 'text-beetz-dark/50'}`}>
                Unidades
              </button>
              <button type="button" onClick={() => setEmFardos(true)}
                className={`px-3 py-1.5 font-bold ${emFardos ? 'bg-beetz-dark text-white' : 'text-beetz-dark/50'}`}>
                Fardos de {upp}
              </button>
            </div>
            {emFardos && quantity > 0 && (
              <span className="text-xs font-semibold text-beetz-dark/60">
                = {Math.round(quantity * upp * 100) / 100} unidades
                {movementType === 'Compra' && unitCost.trim()
                  ? ` · ${(parseCost(unitCost) / upp).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/un`
                  : ''}
              </span>
            )}
          </div>
        )}

        <div className={movementType === 'Compra' ? 'grid grid-cols-2 gap-3' : ''}>
          <div>
            <label className="text-xs font-medium text-beetz-dark/60 block mb-1">{emFardos && upp > 1 ? 'Fardos' : 'Quantidade'}</label>
            <div className="flex items-stretch gap-1.5">
              <button type="button" onClick={() => setQuantity((q) => Math.max(1, Math.round(q - 1)))}
                className="px-3 rounded-xl border border-beetz-dark/15 bg-beetz-gray text-beetz-dark shrink-0 active:scale-95 transition">
                <Minus size={15} />
              </button>
              <input type="number" min={0.01} step="0.01" inputMode="decimal" required={cesta.length === 0}
                className={inputClass + ' min-w-0 text-center'} value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))} />
              <button type="button" onClick={() => setQuantity((q) => Math.round(q + 1))}
                className="px-3 rounded-xl border border-beetz-dark/15 bg-beetz-gray text-beetz-dark shrink-0 active:scale-95 transition">
                <Plus size={15} />
              </button>
            </div>
          </div>
          {movementType === 'Compra' && (
            <div>
              <label className="text-xs font-medium text-beetz-dark/60 block mb-1">{emFardos && upp > 1 ? 'Preço do fardo (R$)' : 'Preço unitário (R$)'}</label>
              <input type="text" inputMode="decimal" placeholder="Ex: 4,50" className={inputClass + ' min-w-0'}
                value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </div>
          )}
        </div>
        {movementType === 'Compra' && (
          <p className="text-xs text-beetz-dark/40">
            O preço alimenta o custo médio e o valor do estoque. Sem preço, a compra entra só em quantidade.
          </p>
        )}

        <button
          type="button"
          onClick={adicionarItem}
          disabled={!itemAtualValido}
          className="w-full sm:w-auto flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl border border-dashed border-beetz-dark/25 text-beetz-dark/70 hover:bg-beetz-gray disabled:opacity-40 transition-colors"
        >
          <Plus size={15} /> Adicionar à lista e lançar outro
        </button>
      </div>

      {negativos.length > 0 && (
        <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>
            {negativos.map((n) => `${n.nome}: saldo ${n.saldo}, essa saída deixa ${n.resulta}`).join(' · ')} — negativo.
          </span>
        </div>
      )}

      {movementType === 'Compra' && algumPrecoNaSessao && !allowExpense && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Seu perfil não lança despesas: a compra entra no estoque e alguém do Financeiro registra o gasto.
        </p>
      )}
      {movementType === 'Compra' && algumPrecoNaSessao && allowExpense && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={generateExpense} onChange={(e) => setGenerateExpense(e.target.checked)}
            className="rounded border-beetz-dark/20" />
          <span className="text-xs text-beetz-dark/60">
            Gerar despesa{totalItens > 1 ? 's' : ''} no Financeiro ({totalCompraSessao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} no total, entra{totalItens > 1 ? 'm' : ''} como Pendente)
          </span>
        </label>
      )}

      <div>
        <label className="text-sm font-medium block mb-1">Observações</label>
        <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={totalItens > 1 ? 'Vale pra todos os itens da lista' : ''} />
      </div>

      <button
        type="submit"
        disabled={saving || totalItens === 0 || !locationId || (isTransfer && (!toLocationId || toLocationId === locationId))}
        className="w-full sm:w-auto honey-gradient text-beetz-dark font-bold px-6 py-3 rounded-xl text-sm disabled:opacity-60"
      >
        {saving
          ? 'Salvando...'
          : isTransfer
            ? (totalItens > 1 ? `Transferir ${totalItens} itens` : 'Transferir')
            : (totalItens > 1 ? `Registrar ${totalItens} itens` : 'Registrar movimentação')}
      </button>
    </form>
  )
}

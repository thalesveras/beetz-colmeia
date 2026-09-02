import { useEffect, useMemo, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { createStockMovement, getStockBalances, listProducts, listStockLocations, transferStock } from '../../lib/dataService'
import type { MovementType, Product, StockBalance, StockLocation } from '../../lib/types'

// "Conversar com o estoque": porta de entrada FÁCIL por cima do modelo que já
// existe — nada de dado novo, nada de dado perdido. Comandos naturais em
// PT-BR viram consultas na view de saldos ou movimentações de verdade
// (sempre com cartão de prévia + Confirmar antes de gravar).
//
// Exemplos que ele entende:
//   "quanto tem de heineken?"           → saldo por local
//   "o que tem na privilege?"           → resumo do local
//   "o que tá acabando?"                → produtos abaixo do mínimo
//   "entrada de 10 caixas de corona"    → Compra no CENTRAL (prévia)
//   "saiu 5 vodka na privilege"         → Saída (prévia)
//   "transfere 20 red bull pra samba"   → transferência central → local (prévia)
//   "últimas movimentações"             → histórico recente

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

interface Msg { de: 'eu' | 'bot'; texto: string }

type Acao =
  | {
      tipo: 'mov'; movement: MovementType; productId: string; productName: string
      qty: number; unit: string; locId: string; locName: string; detalhe: string | null
    }
  | {
      tipo: 'transfer'; productId: string; productName: string; qty: number; unit: string
      fromId: string; fromName: string; toId: string; toName: string
    }

const SUGESTOES = ['O que tá acabando?', 'O que tem na Privilege?', 'Últimas movimentações']

export default function StockChat() {
  const { userId } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [balances, setBalances] = useState<StockBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [acao, setAcao] = useState<Acao | null>(null)
  const [busy, setBusy] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)

  const central = useMemo(() => locations.find((l) => l.is_central) ?? null, [locations])

  async function carregar() {
    const [p, l, b] = await Promise.all([listProducts(), listStockLocations(), getStockBalances()])
    setProducts(p)
    setLocations(l)
    setBalances(b)
  }

  useEffect(() => {
    carregar()
      .then(() => setMsgs([{
        de: 'bot',
        texto: 'Oi! 🐝 Me pergunta do estoque: saldo de um produto, o que tem num local, o que tá acabando — ou já lança: "entrada de 10 caixas de corona na Privilege". Eu sempre mostro a prévia antes de gravar.'
      }]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, acao])

  function bot(texto: string) { setMsgs((m) => [...m, { de: 'bot', texto }]) }

  // ---- casadores ----
  // Produto: quantas palavras (>2 letras) do NOME aparecem na frase.
  function acharProduto(frase: string): Product | null {
    const f = norm(frase)
    let melhor: Product | null = null
    let melhorScore = 0
    for (const p of products) {
      const palavras = norm(p.name).split(/[^a-z0-9]+/).filter((w) => w.length > 2)
      if (palavras.length === 0) continue
      const score = palavras.filter((w) => f.includes(w)).length
      if (score > melhorScore || (score === melhorScore && score > 0 && melhor && p.name.length < melhor.name.length)) {
        melhor = p
        melhorScore = score
      }
    }
    return melhorScore > 0 ? melhor : null
  }

  function acharLocal(frase: string): StockLocation | null {
    const f = norm(frase)
    if (/(central|privilege|casa|sede)/.test(f)) return central
    let melhor: StockLocation | null = null
    let melhorScore = 0
    for (const l of locations) {
      const palavras = norm(l.name).split(/[^a-z0-9]+/).filter((w) => w.length > 2)
      if (palavras.length === 0) continue
      const score = palavras.filter((w) => f.includes(w)).length
      if (score > melhorScore) { melhor = l; melhorScore = score }
    }
    return melhorScore > 0 ? melhor : null
  }

  function saldoDe(productId: string, locId?: string): number {
    return balances
      .filter((b) => b.product_id === productId && (!locId || b.stock_location_id === locId))
      .reduce((s, b) => s + b.balance, 0)
  }

  // ---- o cérebro: entender a frase ----
  function responder(frase: string) {
    const f = norm(frase)
    const numero = frase.match(/(\d+(?:[.,]\d+)?)/)
    const qtdBruta = numero ? Number(numero[1].replace(',', '.')) : null
    const ehFardo = /\b(fardos?|caixas?|cx|packs?)\b/.test(f)

    // Ajuda
    if (/\b(ajuda|help|comandos|o que voce faz)\b/.test(f)) {
      bot('Eu entendo:\n· "quanto tem de [produto]?"\n· "o que tem na [local]?"\n· "o que tá acabando?"\n· "últimas movimentações"\n· "entrada de 10 caixas de [produto] na [local]"\n· "saiu 5 [produto]" (também: perda, quebra, consumo)\n· "transfere 20 [produto] pra [local]"\nSem local, uso o central (Privilege Hall). Lançamentos sempre pedem confirmação.')
      return
    }

    // O que tá acabando (abaixo do mínimo)
    if (/\b(acaband|abaixo do minimo|estoque baixo|repor|faltando)\b/.test(f)) {
      const linhas: string[] = []
      for (const p of products) {
        const min = p.low_stock_threshold ?? 5
        const total = saldoDe(p.id)
        if (total < min) linhas.push(`⚠️ ${p.name}: ${total} ${p.unit} (mínimo ${min})`)
      }
      bot(linhas.length ? `Abaixo do mínimo:\n${linhas.slice(0, 15).join('\n')}${linhas.length > 15 ? `\n…e mais ${linhas.length - 15}.` : ''}` : 'Tudo acima do mínimo por aqui. 🐝')
      return
    }

    // Transferência: "transfere 20 red bull [de X] pra Y"
    if (/\b(transfere|transferir|manda|mandar|envia|enviar|leva|levar)\b/.test(f) && qtdBruta) {
      const produto = acharProduto(frase)
      if (!produto) { bot('Não achei esse produto no catálogo. Qual o nome exato?'); return }
      const depoisPra = frase.split(/\b(?:pra|para|pro)\b/i)[1] ?? ''
      const destino = acharLocal(depoisPra)
      if (!destino) { bot('Pra qual local? Ex.: "transfere 20 red bull pra Samba Experience".'); return }
      const antesPra = frase.split(/\b(?:pra|para|pro)\b/i)[0]
      const trechoDe = antesPra.match(/\bde\s+(.+)$/i)?.[1] ?? ''
      const origem = (trechoDe && acharLocal(trechoDe)) || central
      if (!origem) { bot('Não sei de onde tirar — não há estoque central definido. Diga "de [local] pra [local]".'); return }
      if (origem.id === destino.id) { bot('Origem e destino são o mesmo local. 🤔'); return }
      const upp = ehFardo && (produto.units_per_pack ?? 0) > 1 ? produto.units_per_pack! : 1
      const qty = qtdBruta * upp
      setAcao({
        tipo: 'transfer', productId: produto.id, productName: produto.name, qty, unit: produto.unit,
        fromId: origem.id, fromName: origem.name, toId: destino.id, toName: destino.name
      })
      return
    }

    // Entrada (Compra)
    if (/\b(entrada|comprei|compra|chegou|chegaram|adiciona|recebemos)\b/.test(f) && qtdBruta) {
      const produto = acharProduto(frase)
      if (!produto) { bot('Não achei esse produto no catálogo. Qual o nome exato?'); return }
      const local = acharLocal(frase) ?? central
      if (!local) { bot('Em qual local? Diga por ex. "na Privilege".'); return }
      const upp = ehFardo && (produto.units_per_pack ?? 0) > 1 ? produto.units_per_pack! : 1
      const qty = qtdBruta * upp
      setAcao({
        tipo: 'mov', movement: 'Compra', productId: produto.id, productName: produto.name,
        qty, unit: produto.unit, locId: local.id, locName: local.name,
        detalhe: upp > 1 ? `${qtdBruta} fardo(s) × ${upp} = ${qty}` : null
      })
      return
    }

    // Saída / Perda / Quebra / Consumo
    if (/\b(saida|saiu|baixa|retira|tira|perda|perdemos|quebra|quebrou|consumo)\b/.test(f) && qtdBruta) {
      const produto = acharProduto(frase)
      if (!produto) { bot('Não achei esse produto no catálogo. Qual o nome exato?'); return }
      const local = acharLocal(frase) ?? central
      if (!local) { bot('De qual local? Diga por ex. "na Privilege".'); return }
      const movement: MovementType = /\bperd/.test(f) ? 'Perda' : /\bquebr/.test(f) ? 'Quebra' : /\bconsumo\b/.test(f) ? 'Consumo Interno' : 'Saída'
      const upp = ehFardo && (produto.units_per_pack ?? 0) > 1 ? produto.units_per_pack! : 1
      const qty = qtdBruta * upp
      const saldoAtual = saldoDe(produto.id, local.id)
      setAcao({
        tipo: 'mov', movement, productId: produto.id, productName: produto.name,
        qty, unit: produto.unit, locId: local.id, locName: local.name,
        detalhe: qty > saldoAtual ? `⚠️ saldo atual em ${local.name}: ${saldoAtual} — vai ficar negativo` : null
      })
      return
    }

    // Resumo de um local: "o que tem na privilege" / "saldo da samba"
    const pedeLocal = /\b(o que tem|o que ha|saldo|estoque)\b/.test(f) && /\b(na|no|em|d[ao])\b/.test(f)
    const produtoNaFrase = acharProduto(frase)
    if (pedeLocal && !produtoNaFrase) {
      const local = acharLocal(frase)
      if (local) {
        const doLocal = balances
          .filter((b) => b.stock_location_id === local.id && Math.abs(b.balance) > 0.004)
          .sort((a, b) => b.balance - a.balance)
        bot(doLocal.length
          ? `📍 ${local.name}${local.is_central ? ' (central)' : ''}:\n${doLocal.slice(0, 20).map((b) => `· ${b.product_name}: ${b.balance} ${b.product_unit}`).join('\n')}${doLocal.length > 20 ? `\n…e mais ${doLocal.length - 20} itens.` : ''}`
          : `📍 ${local.name}: sem saldo por lá.`)
        return
      }
    }

    // Histórico recente
    if (/\b(ultim|historic|movimentac)/.test(f)) {
      bot('Pro histórico completo com filtros, use a aba Movimentações aqui do Estoque — ela tem tudo paginado. Por aqui eu respondo saldos e lanço movimentações. 😉')
      return
    }

    // Saldo de um produto
    if (produtoNaFrase) {
      const local = acharLocal(frase)
      if (local) {
        bot(`${produtoNaFrase.name} em ${local.name}: ${saldoDe(produtoNaFrase.id, local.id)} ${produtoNaFrase.unit}.`)
        return
      }
      const porLocal = balances
        .filter((b) => b.product_id === produtoNaFrase.id && Math.abs(b.balance) > 0.004)
        .sort((a, b) => b.balance - a.balance)
      const total = saldoDe(produtoNaFrase.id)
      bot(porLocal.length
        ? `${produtoNaFrase.name} — total ${total} ${produtoNaFrase.unit}:\n${porLocal.slice(0, 10).map((b) => `· ${b.stock_location_name}: ${b.balance}`).join('\n')}${porLocal.length > 10 ? `\n…e mais ${porLocal.length - 10} locais.` : ''}`
        : `${produtoNaFrase.name}: sem saldo em lugar nenhum agora.`)
      return
    }

    bot('Não entendi. 🐝 Tenta "quanto tem de [produto]?", "o que tem na Privilege?", "o que tá acabando?" — ou "ajuda" pra lista completa.')
  }

  function enviar(texto?: string) {
    const frase = (texto ?? input).trim()
    if (!frase) return
    setMsgs((m) => [...m, { de: 'eu', texto: frase }])
    setInput('')
    setAcao(null)
    // setTimeout 0 pra bolha do usuário renderizar antes da resposta.
    window.setTimeout(() => responder(frase), 50)
  }

  async function confirmarAcao() {
    if (!acao) return
    setBusy(true)
    try {
      if (acao.tipo === 'mov') {
        await createStockMovement({
          product_id: acao.productId, stock_location_id: acao.locId, event_id: null,
          movement_type: acao.movement, quantity: acao.qty, unit_cost: null,
          notes: 'Lançado pelo chat do estoque', created_by: userId ?? null
        })
        bot(`✅ ${acao.movement} de ${acao.qty} ${acao.unit} de ${acao.productName} em ${acao.locName} — registrado.`)
      } else {
        await transferStock({
          product_id: acao.productId, from_location_id: acao.fromId, to_location_id: acao.toId,
          quantity: acao.qty, notes: 'Pelo chat do estoque'
        })
        bot(`✅ Transferidos ${acao.qty} ${acao.unit} de ${acao.productName}: ${acao.fromName} → ${acao.toName}.`)
      }
      setAcao(null)
      setBalances(await getStockBalances())
    } catch (e) {
      bot(`❌ Não deu: ${e instanceof Error ? e.message : 'erro ao gravar.'} Nada foi alterado.`)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-beetz-dark/50">Acordando o estoque...</p>

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 flex flex-col" style={{ minHeight: '60vh' }}>
        <div className="dark-gradient text-white px-4 py-3 rounded-t-2xl">
          <p className="font-extrabold leading-tight">💬 Conversar com o estoque</p>
          <p className="text-[11px] text-white/60">
            Central: {central ? `📍 ${central.name}` : 'não definido'} · nada é gravado sem sua confirmação
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {msgs.map((m, i) => (
            <div key={i} className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-line ${
              m.de === 'eu' ? 'ml-auto honey-gradient text-beetz-dark font-medium' : 'bg-beetz-gray text-beetz-dark'
            }`}>
              {m.texto}
            </div>
          ))}

          {acao && (
            <div className="bg-beetz-dark text-white rounded-2xl p-4 max-w-[92%]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-beetz-yellow mb-1.5">Confirma?</p>
              {acao.tipo === 'mov' ? (
                <p className="text-sm leading-relaxed">
                  <strong>{acao.movement}</strong> de <strong>{acao.qty} {acao.unit}</strong> de{' '}
                  <strong>{acao.productName}</strong> em 📍 {acao.locName}
                  {acao.detalhe && <span className="block text-xs text-white/60 mt-1">{acao.detalhe}</span>}
                </p>
              ) : (
                <p className="text-sm leading-relaxed">
                  Transferir <strong>{acao.qty} {acao.unit}</strong> de <strong>{acao.productName}</strong>:{' '}
                  📍 {acao.fromName} → 📍 {acao.toName}
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <button onClick={confirmarAcao} disabled={busy}
                  className="honey-gradient text-beetz-dark text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60">
                  {busy ? 'Gravando...' : '✓ Confirmar'}
                </button>
                <button onClick={() => { setAcao(null); bot('Beleza, cancelei — nada foi gravado.') }}
                  className="text-white/60 text-sm font-semibold px-3 py-2 rounded-xl hover:bg-white/10">
                  Cancelar
                </button>
              </div>
            </div>
          )}
          <div ref={fimRef} />
        </div>

        <div className="p-3 border-t border-beetz-dark/5 space-y-2">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {SUGESTOES.map((s) => (
              <button key={s} onClick={() => enviar(s)}
                className="shrink-0 text-xs font-semibold bg-beetz-gray text-beetz-dark/70 px-3 py-1.5 rounded-full hover:bg-beetz-dark/10">
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 border border-beetz-dark/15 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-beetz-yellow"
              placeholder="Pergunta ou lança aqui..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
              enterKeyHint="send"
            />
            <button onClick={() => enviar()} onMouseDown={(e) => e.preventDefault()}
              className="honey-gradient text-beetz-dark font-bold px-4 rounded-xl" aria-label="Enviar">
              <Send size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

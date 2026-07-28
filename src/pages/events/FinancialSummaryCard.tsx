import { useEffect, useState } from 'react'
import { Building2, Copy, Printer, Save, ShieldCheck, UserRound } from 'lucide-react'
import { getClosingDossier, getEventFinancialSummary, listEventRepasses, updateEvent } from '../../lib/dataService'
import type { EventFinancialSummary, EventItem, EventRepasse } from '../../lib/types'
import { useAuth } from '../../contexts/AuthContext'
import { canExportClosingPdf } from '../../lib/permissions'

// Fechamento como PRESTAÇÃO DE CONTAS, em duas visões (pedido do dono):
// — Visão empresa: o resultado da Beetz no evento (receita − custos = lucro).
// — Visão produtor: o extrato que se apresenta à produtora — vendas, comissão,
//   acertos já feitos e o saldo. Formatada como documento, pronta pra mostrar.
// Os números vêm do mesmo cálculo (getEventFinancialSummary); o que muda é o
// ponto de vista de quem lê.

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dateBR(iso: string) {
  return new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR')
}

interface Props {
  event: EventItem
  onEventUpdated: (updated: EventItem) => void
}

export default function FinancialSummaryCard({ event, onEventUpdated }: Props) {
  const { accessRole, profile } = useAuth()
  const [summary, setSummary] = useState<EventFinancialSummary | null>(null)
  const [repasses, setRepasses] = useState<EventRepasse[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [dossieBusy, setDossieBusy] = useState(false)
  const [view, setView] = useState<'empresa' | 'produtor'>('empresa')

  const [salesAmount, setSalesAmount] = useState(event.sales_amount)
  const [percentage, setPercentage] = useState(event.commission_percentage)
  const [creditsBonus, setCreditsBonus] = useState(event.credits_bonus)
  // Vazio = usa a alíquota padrão de Configurações.
  const [taxPct, setTaxPct] = useState(event.tax_percentage != null ? String(event.tax_percentage) : '')

  async function load() {
    setLoading(true)
    const [s, r] = await Promise.all([
      getEventFinancialSummary(event.id),
      listEventRepasses(event.id)
    ])
    setSummary(s)
    setRepasses(r)
    setLoading(false)
  }

  useEffect(() => { load() }, [event.id])
  useEffect(() => {
    setSalesAmount(event.sales_amount)
    setPercentage(event.commission_percentage)
    setCreditsBonus(event.credits_bonus)
    setTaxPct(event.tax_percentage != null ? String(event.tax_percentage) : '')
  }, [event])

  async function handleSave() {
    setSaving(true)
    const updated = await updateEvent(event.id, {
      sales_amount: salesAmount, commission_percentage: percentage, credits_bonus: creditsBonus,
      tax_percentage: taxPct.trim() ? Number(taxPct.replace(',', '.')) : null
    })
    onEventUpdated(updated)
    await load()
    setSaving(false)
  }

  const toggle = (
    <div className="flex gap-1 bg-black/20 rounded-xl p-1 w-fit">
      <button
        onClick={() => setView('empresa')}
        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
          view === 'empresa' ? 'bg-beetz-yellow text-beetz-dark' : 'text-white/60 hover:text-white'
        }`}
      >
        <Building2 size={13} /> Visão empresa
      </button>
      <button
        onClick={() => setView('produtor')}
        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
          view === 'produtor' ? 'bg-beetz-yellow text-beetz-dark' : 'text-white/60 hover:text-white'
        }`}
      >
        <UserRound size={13} /> Visão produtor
      </button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="bg-beetz-dark text-white rounded-2xl p-5 md:p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-beetz-yellow" />
            <h2 className="font-bold">Fechamento — prestação de contas</h2>
          </div>
          {toggle}
        </div>
        <p className="text-sm text-white/50 mt-2 mb-5">
          {view === 'empresa'
            ? 'O resultado da Beetz neste evento: receita da comissão menos os custos lançados.'
            : 'O extrato do evento do ponto de vista da produtora — pronto pra apresentar no acerto.'}
        </p>

        {view === 'empresa' && (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="text-xs text-white/60 block mb-1">Vendas (R$)</label>
                <input type="number" min={0} step="0.01" className={`${inputClass} bg-white/10 border-white/15 text-white`} value={salesAmount} onChange={(e) => setSalesAmount(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1">Percentual da Beetz (%)</label>
                <input type="number" min={0} max={100} step="0.1" className={`${inputClass} bg-white/10 border-white/15 text-white`} value={percentage} onChange={(e) => setPercentage(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1">Créditos ou bonificações (R$)</label>
                <input type="number" step="0.01" className={`${inputClass} bg-white/10 border-white/15 text-white`} value={creditsBonus} onChange={(e) => setCreditsBonus(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1">Imposto (%) — vazio usa o padrão</label>
                <input type="text" inputMode="decimal" placeholder={summary ? `Padrão: ${summary.taxaImposto}%` : 'Padrão'} className={`${inputClass} bg-white/10 border-white/15 text-white`} value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60 mb-5"
            >
              <Save size={14} /> {saving ? 'Salvando...' : 'Salvar valores'}
            </button>

            {loading || !summary ? (
              <p className="text-sm text-white/50">Calculando fechamento...</p>
            ) : (
              <div className="pt-4 border-t border-white/10 space-y-1.5">
                {/* Modelo da casa (batido ao centavo no fechamento antigo):
                    Lucro = Vendas × %Beetz − Impostos − Despesas − Custo do
                    VENDIDO − Perdas. Consumo e créditos são do produtor. */}
                <p className="text-[10px] font-bold uppercase tracking-widest text-beetz-yellow/70 pt-1">Receita</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/70">
                    Vendas do evento
                    <span className="text-white/35"> · {summary.vendasFonte === 'pdv'
                      ? 'relatório da máquina (Total faturado, sem taxa de serviço)'
                      : summary.vendasFonte === 'produtos' ? 'aba Produtos (vendido × preço)' : 'campo manual acima'}</span>
                  </span>
                  <span className="font-semibold text-white/70">{currency(summary.vendas)}</span>
                </div>
                <StatementRow label={`Receita Beetz (${summary.percentual}% das vendas)`} value={summary.receitaBeetz} />

                <p className="text-[10px] font-bold uppercase tracking-widest text-beetz-yellow/70 pt-2">Custos da casa</p>
                <StatementRow label={`Impostos (${summary.taxaImposto}% da receita Beetz)`} value={-summary.impostos} />
                <StatementRow label="Despesas do evento (sem compras de estoque)" value={-summary.despesas} />
                <StatementRow label="Custo do vendido (aba Produtos)" value={-summary.custoProdutos} />
                <StatementRow label="Perdas no evento (estoque: Perda/Quebra)" value={-summary.perdas} />
                {summary.comprasEstoque > 0 && (
                  <p className="text-[11px] text-white/40 bg-white/5 rounded-lg px-3 py-2 mt-1">
                    Compras de estoque ({currency(summary.comprasEstoque)}) ficam fora desta conta de propósito:
                    produto comprado é dinheiro virando estoque, e o gasto só entra quando vende (custo do vendido)
                    ou perde. Somar as duas pontas descontaria a mesma compra duas vezes.
                  </p>
                )}
                {summary.comissoesServico > 0 && (
                  <p className="text-[11px] text-white/40 bg-white/5 rounded-lg px-3 py-2 mt-1">
                    Comissões dos garçons ({currency(summary.comissoesServico)}) também ficam fora: são a taxa de
                    serviço que o cliente paga por fora — as vendas acima já entram SEM essa verba, então ela é
                    repasse, não custo. Descontar de novo tiraria os 10% duas vezes.
                  </p>
                )}

                <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/15">
                  <span className="font-bold">Lucro do evento</span>
                  <span className={`text-2xl font-extrabold ${summary.lucroOuPerda >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {currency(summary.lucroOuPerda)}
                  </span>
                </div>

                {(summary.consumoProducao > 0 || summary.creditosOuBonificacoes > 0) && (
                  <p className="text-[11px] text-white/40 bg-white/5 rounded-lg px-3 py-2 mt-1">
                    Conta do produtor (não entra no lucro Beetz):
                    {summary.consumoProducao > 0 ? ` consumo da produção ${currency(summary.consumoProducao)} desconta do saldo dele` : ''}
                    {summary.consumoProducao > 0 && summary.creditosOuBonificacoes > 0 ? ' · ' : ''}
                    {summary.creditosOuBonificacoes > 0 ? ` créditos ${currency(summary.creditosOuBonificacoes)} somam pro lado dele` : ''}.
                  </p>
                )}
                {/* Acerto com a produtora — modelo correto: os caixas da Beetz
                    arrecadam, a Beetz fica com a receita dela e o resto é da
                    produtora. Saldo positivo = falta repassar. */}
                <div className="flex flex-wrap gap-3 pt-4 mt-2 border-t border-white/10 text-sm">
                  <div className="bg-white/5 rounded-xl px-4 py-2.5 flex-1 min-w-[140px]">
                    <p className="text-xs text-white/50">Arrecadado pelos caixas</p>
                    <p className="font-bold text-white mt-0.5">{currency(summary.recebimentos)}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl px-4 py-2.5 flex-1 min-w-[140px]">
                    <p className="text-xs text-white/50">Já repassado</p>
                    <p className="font-bold text-beetz-yellow mt-0.5">{currency(summary.repasses)}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl px-4 py-2.5 flex-1 min-w-[140px]">
                    <p className="text-xs text-white/50">Saldo a repassar à produtora</p>
                    <p className={`font-bold mt-0.5 ${summary.saldoAPagarProdutora > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                      {currency(summary.saldoAPagarProdutora)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {view === 'produtor' && (loading || !summary ? (
          <p className="text-sm text-white/50">Montando a prestação de contas...</p>
        ) : (() => {
          // O extrato do produtor usa a MESMA base de vendas do resumo:
          //   Vendas        ← PDV (Total faturado, sem taxa de serviço) →
          //                   aba Produtos → campo manual, nessa ordem
          //   % do produtor ← 100 − Percentual Beetz
          //   Consumo       ← aba Consumo da produção (desconta do produtor)
          //   Repasses      ← aba Repasses (o que já foi pago)
          //   Saldo         = vendas × % + créditos − consumo − repasses
          const vendasBase = summary.vendas
          const vendasFonte = summary.vendasFonte === 'pdv'
            ? 'máquina, sem taxa de serviço'
            : summary.vendasFonte === 'produtos' ? 'aba Produtos' : 'campo do fechamento'
          const pctProdutor = Math.max(0, 100 - summary.percentual)
          const valorAReceber = vendasBase * (pctProdutor / 100)
          const saldoAReceber = valorAReceber + summary.creditosOuBonificacoes - summary.consumoProducao - summary.repasses

          const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          const meta = [
            event.event_date ? dateBR(event.event_date) : '',
            event.start_time ? event.start_time.slice(0, 5) : '',
            event.music_style ?? ''
          ].filter(Boolean).join(' · ')
          const endereco = [event.location, event.city].filter(Boolean).join(', ')

          // Exportar PDF: abre uma janela só com a folha e chama a impressão —
          // o "Salvar como PDF" do navegador (e do celular) faz o resto. Mesmo
          // desenho do fechamento antigo que os produtores já conhecem: ficha
          // do evento em cima, extrato linha a linha, saldo grande no fim.
          function exportPdf() {
            if (!summary) return
            const w = window.open('', '_blank')
            if (!w) { alert('O navegador bloqueou a janela do PDF. Libere pop-ups pra este site e tente de novo.'); return }
            const linhas: Array<{ k: string; v: string; neg?: boolean }> = [
              { k: `Vendas (${vendasFonte})`, v: currency(vendasBase) },
              { k: 'Percentual do produtor', v: `${pctProdutor}%` },
              { k: `Valor a receber (${pctProdutor}% das vendas)`, v: currency(valorAReceber) },
              { k: 'Créditos ou bonificações', v: currency(summary.creditosOuBonificacoes) },
              { k: 'Consumo da produção', v: `− ${currency(summary.consumoProducao)}`, neg: true },
              { k: 'Repasses já pagos', v: `− ${currency(summary.repasses)}`, neg: true }
            ]
            const rowsHtml = linhas.map((l) => `<tr><td class="k">${esc(l.k)}</td><td class="v${l.neg ? ' neg' : ''}">${esc(l.v)}</td></tr>`).join('')
            const repassesHtml = repasses.length
              ? `<h2>Repasses já recebidos da Beetz</h2><table>${repasses.map((r) =>
                  `<tr><td class="k">${esc(dateBR(r.paid_at))}${r.notes ? ` · ${esc(r.notes)}` : ''}</td><td class="v">${esc(currency(r.amount))}</td></tr>`).join('')}</table>`
              : ''
            w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(`Fechamento - ${event.name}`)}</title><style>
              body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #221f1a; margin: 40px auto; max-width: 640px; padding: 0 16px; }
              .head { display: flex; gap: 16px; align-items: flex-start; border-bottom: 2px solid #221f1a; padding-bottom: 16px; }
              .flyer { width: 84px; height: 84px; object-fit: cover; border-radius: 12px; }
              .kicker { font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #b08900; margin: 0; }
              h1 { font-size: 22px; margin: 2px 0 4px; } .meta { font-size: 12px; color: #777; margin: 1px 0; }
              h2 { font-size: 13px; margin: 26px 0 0; }
              table { width: 100%; border-collapse: collapse; margin-top: 8px; }
              td { padding: 9px 4px; border-bottom: 1px solid #eee; font-size: 13px; }
              .k { color: #666; } .v { font-weight: 600; text-align: right; white-space: nowrap; } .neg { color: #b91c1c; }
              .saldo { display: flex; justify-content: space-between; align-items: baseline; border-top: 2px solid #221f1a; margin-top: 4px; padding-top: 12px; }
              .saldo span { font-weight: 700; } .saldo strong { font-size: 22px; color: ${saldoAReceber >= 0 ? '#15803d' : '#b91c1c'}; }
              .foot { font-size: 10px; color: #aaa; margin-top: 32px; }
              @media print { body { margin: 0 auto; } }
            </style></head><body>
              <div class="head">
                ${event.flyer_url ? `<img class="flyer" src="${esc(event.flyer_url)}" alt="">` : ''}
                <div>
                  <p class="kicker">FECHAMENTO DO EVENTO</p>
                  <h1>${esc(event.name)}</h1>
                  ${meta ? `<p class="meta">${esc(meta)}</p>` : ''}
                  ${endereco ? `<p class="meta">${esc(endereco)}</p>` : ''}
                </div>
              </div>
              <table>${rowsHtml}</table>
              <div class="saldo"><span>Saldo a receber</span><strong>${esc(currency(saldoAReceber))}</strong></div>
              ${repassesHtml}
              <p class="foot">Gerado pela Colmeia Beetz em ${new Date().toLocaleDateString('pt-BR')}, a partir dos lançamentos deste evento.</p>
            </body></html>`)
            w.document.close()
            w.focus()
            // Respiro pro flyer carregar — sem ele a foto sai em branco no PDF.
            setTimeout(() => w.print(), 450)
          }

          // Resumo em texto no formato do WhatsApp (*negrito*), pra mandar
          // direto no chat do produtor sem gerar arquivo.
          async function copyResumo() {
            if (!summary) return
            const linhas = [
              `*Fechamento — ${event.name}*`,
              meta || null,
              '',
              `Vendas (${vendasFonte}): ${currency(vendasBase)}`,
              `Percentual do produtor: ${pctProdutor}%`,
              `Valor a receber: ${currency(valorAReceber)}`,
              summary.creditosOuBonificacoes > 0 ? `Créditos ou bonificações: ${currency(summary.creditosOuBonificacoes)}` : null,
              summary.consumoProducao > 0 ? `Consumo da produção: − ${currency(summary.consumoProducao)}` : null,
              summary.repasses > 0 ? `Repasses já pagos: − ${currency(summary.repasses)}` : null,
              '',
              `*Saldo a receber: ${currency(saldoAReceber)}*`,
              ...(repasses.length > 0
                ? ['', 'Acertos já feitos:', ...repasses.map((r) => `• ${dateBR(r.paid_at)}${r.notes ? ` (${r.notes})` : ''} — ${currency(r.amount)}`)]
                : []),
              '',
              '_Gerado pela Colmeia Beetz_'
            ].filter((l): l is string => l !== null)
            try {
              await navigator.clipboard.writeText(linhas.join('\n'))
              setCopied(true)
              setTimeout(() => setCopied(false), 2500)
            } catch {
              alert('Não consegui copiar automaticamente. Use o Exportar PDF ou copie da folha abaixo.')
            }
          }

          // ---- DOSSIÊ COMPLETO (Diretoria): o relatório nível Zoho, com o
          // design da casa. Busca todas as seções no banco numa chamada e
          // abre a folha pronta pra "Salvar como PDF". Documento interno:
          // carrega CPF da equipe — por isso vive atrás da flag da matriz.
          async function exportDossie() {
            if (!summary) return
            setDossieBusy(true)
            try {
              const d = await getClosingDossier(event.id)
              const w = window.open('', '_blank')
              if (!w) { alert('O navegador bloqueou a janela do PDF. Libere pop-ups pra este site e tente de novo.'); return }
              const cpfFmt = (c: string | null) => {
                const n = (c ?? '').replace(/\D/g, '')
                return n.length === 11 ? `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}` : (c ?? '—')
              }
              const linha = (k: string, v: string, neg = false) =>
                `<tr><td class="k">${esc(k)}</td><td class="v${neg ? ' neg' : ''}">${esc(v)}</td></tr>`
              const vazio = '<p class="vazio">Nenhum registro.</p>'

              const cardapioTotal = d.cardapio.reduce((s, c) => s + (c.total ?? 0), 0)
              const cardapioHtml = d.cardapio.length ? `<table class="grade">
                <thead><tr><th>Produto</th><th class="num">Vendidos</th><th class="num">Preço</th><th class="num">Total</th></tr></thead>
                <tbody>${d.cardapio.map((c) => `<tr><td>${esc(c.produto)}</td><td class="num">${c.vendidos || '—'}</td><td class="num">${esc(currency(c.preco))}</td><td class="num"><strong>${c.total ? esc(currency(c.total)) : '—'}</strong></td></tr>`).join('')}</tbody>
                <tfoot><tr><td colspan="3">Total do cardápio</td><td class="num">${esc(currency(cardapioTotal))}</td></tr></tfoot></table>` : vazio

              const equipeHtml = d.equipe.length ? `<table class="grade">
                <thead><tr><th>Nome</th><th>CPF</th><th>Função no evento</th></tr></thead>
                <tbody>${d.equipe.map((m) => `<tr><td>${esc(m.nome || 'Sem nome')}</td><td>${esc(cpfFmt(m.cpf))}</td><td>${esc(m.funcao ?? '—')}</td></tr>`).join('')}</tbody></table>` : vazio

              const recebTotal = d.recebimentos.reduce((s, x) => s + (x.total ?? 0), 0)
              const recebCom = d.recebimentos.reduce((s, x) => s + (x.comissao ?? 0), 0)
              const recebHtml = d.recebimentos.length ? `<table class="grade">
                <thead><tr><th>Colaborador(a)</th><th>Tipo</th><th class="num">Total apurado</th><th class="num">Comissão</th></tr></thead>
                <tbody>${d.recebimentos.map((x) => `<tr><td>${esc(x.nome ?? '—')}</td><td>${esc(x.tipo)}</td><td class="num">${esc(currency(x.total))}</td><td class="num">${x.comissao ? esc(currency(x.comissao)) : '—'}</td></tr>`).join('')}</tbody>
                <tfoot><tr><td colspan="2">Total</td><td class="num">${esc(currency(recebTotal))}</td><td class="num">${esc(currency(recebCom))}</td></tr></tfoot></table>` : vazio

              const consumoHtml = d.consumo.length ? `<table class="grade">
                <thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Custo</th><th>Informado por</th></tr></thead>
                <tbody>${d.consumo.map((c) => `<tr><td>${esc(c.produto)}${c.obs ? `<div class="obs">${esc(c.obs)}</div>` : ''}</td><td class="num">${c.qtd}</td><td class="num">${esc(currency(c.total))}</td><td>${esc(c.por ?? '—')}</td></tr>`).join('')}</tbody>
                <tfoot><tr><td>Total do consumo</td><td></td><td class="num">${esc(currency(Number(d.consumo_total)))}</td><td></td></tr></tfoot></table>` : vazio

              const transfHtml = d.transferencias.length ? `<table class="grade">
                <thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Devolvido</th><th>Status</th></tr></thead>
                <tbody>${d.transferencias.map((t) => `<tr><td>${esc(t.produto)}</td><td class="num">${t.qtd}</td><td class="num">${t.devolvido ?? '—'}</td><td>${esc(t.status)}</td></tr>`).join('')}</tbody></table>` : vazio

              const geradoPor = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() : ''
              // Identidade visual = RÉPLICA do cartão preto de fechamento do
              // app (visão produtor): o dossiê inteiro é uma pilha de cartões
              // #050505 arredondados sobre o papel, Poppins, kickers em
              // amarelo/45%, valores brancos, negativo #f87171, saldo em
              // green-400, minicards rgba(255,255,255,.07) e totais #fed417.
              w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(`Dossiê de fechamento — ${event.name}`)}</title>
              <link rel="preconnect" href="https://fonts.googleapis.com">
              <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
              <style>
                @page { margin: 10mm 9mm; }
                * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
                body { font-family: 'Poppins', -apple-system, 'Segoe UI', Arial, sans-serif; margin: 0 auto; max-width: 730px; padding: 0 4px; }
                .faixa { height: 6px; background: linear-gradient(135deg, #fed417 0%, #ffe985 100%); border-radius: 0 0 8px 8px; margin-bottom: 12px; }
                .card { background: #050505; color: #fff; border-radius: 22px; padding: 22px 26px; margin-bottom: 12px;
                        background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.035) 1px, transparent 0); background-size: 18px 18px;
                        -webkit-box-decoration-break: clone; box-decoration-break: clone; }
                .head { display: flex; gap: 16px; align-items: center; }
                .flyer { width: 74px; height: 74px; object-fit: cover; border-radius: 16px; flex-shrink: 0; }
                .kicker { font-size: 10px; font-weight: 700; letter-spacing: 2.5px; color: rgba(255,255,255,.45); margin: 0 0 3px; text-transform: uppercase; }
                .kicker .mel { color: #fed417; }
                h1 { font-size: 21px; font-weight: 800; margin: 0 0 4px; color: #fff; letter-spacing: .2px; }
                .meta { font-size: 11.5px; color: rgba(255,255,255,.5); margin: 1px 0; }
                .chip { display: inline-block; font-size: 10px; font-weight: 700; background: linear-gradient(135deg, #fed417 0%, #ffe985 100%); color: #050505; padding: 3px 11px; border-radius: 99px; margin-top: 6px; }
                .divisor { border: 0; border-top: 1px solid rgba(255,255,255,.1); margin: 16px 0 6px; }
                .kicker2 { font-size: 10px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: rgba(254,212,23,.8); margin: 0 0 8px; }
                table { width: 100%; border-collapse: collapse; }
                .conta td { padding: 8px 2px; border-bottom: 1px solid rgba(255,255,255,.08); font-size: 12.5px; }
                .k { color: rgba(255,255,255,.7); } .v { font-weight: 600; text-align: right; white-space: nowrap; color: #fff; } .neg { color: #f87171; }
                .saldo { display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid rgba(255,255,255,.15); margin-top: 6px; padding-top: 13px; }
                .saldo span { font-weight: 700; font-size: 13.5px; color: #fff; } .saldo strong { font-size: 24px; font-weight: 800; letter-spacing: .3px; }
                .minis { display: flex; gap: 10px; margin-top: 15px; }
                .mini { flex: 1; background: rgba(255,255,255,.07); border-radius: 14px; padding: 10px 13px; }
                .mini p { margin: 0 0 2px; font-size: 9.5px; color: rgba(255,255,255,.5); }
                .mini strong { font-size: 13.5px; color: #fff; } .mini .amarelo { color: #fed417; }
                .grade th { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,.4); text-align: left; padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,.15); }
                .grade td { font-size: 11px; color: rgba(255,255,255,.85); padding: 6.5px 8px; border-bottom: 1px solid rgba(255,255,255,.06); vertical-align: top; }
                .grade td strong { color: #fff; }
                .grade tbody tr:nth-child(even) td { background: rgba(255,255,255,.04); }
                .grade tfoot td { font-weight: 800; color: #fed417; border-top: 1.5px solid rgba(254,212,23,.55); border-bottom: 0; padding-top: 9px; }
                .grade tr { page-break-inside: avoid; }
                .num { text-align: right; white-space: nowrap; }
                .obs { font-size: 10px; color: rgba(255,255,255,.4); margin-top: 2px; font-weight: 400; }
                .vazio { font-size: 11px; color: rgba(255,255,255,.4); margin: 2px 0 0; }
                .foot { font-size: 9px; color: #a1a1aa; margin: 16px 4px 0; }
              </style></head><body>
                <div class="faixa"></div>

                <div class="card">
                  <div class="head">
                    ${event.flyer_url ? `<img class="flyer" src="${esc(event.flyer_url)}" alt="">` : ''}
                    <div>
                      <p class="kicker"><span class="mel">🐝 Beetz</span> · Dossiê de fechamento</p>
                      <h1>${esc(event.name)}</h1>
                      ${meta ? `<p class="meta">${esc(meta)}</p>` : ''}
                      ${endereco ? `<p class="meta">📍 ${esc(endereco)}</p>` : ''}
                      <span class="chip">${esc(event.status)}</span>
                    </div>
                  </div>
                  <hr class="divisor">
                  <table class="conta">
                    ${linha(`Vendas (${vendasFonte})`, currency(vendasBase))}
                    ${linha('Percentual do produtor', `${pctProdutor}%`)}
                    ${linha(`Valor a receber (${pctProdutor}% de ${currency(vendasBase)})`, currency(valorAReceber))}
                    ${linha('Créditos ou bonificações', currency(summary.creditosOuBonificacoes))}
                    ${linha('Consumo da produção', `− ${currency(summary.consumoProducao)}`, true)}
                    ${linha('Repasses já pagos', `− ${currency(summary.repasses)}`, true)}
                  </table>
                  <div class="saldo"><span>Saldo a receber</span><strong style="color:${saldoAReceber >= 0 ? '#4ade80' : '#f87171'}">${esc(currency(saldoAReceber))}</strong></div>
                  <div class="minis">
                    <div class="mini"><p>Arrecadado pelos caixas</p><strong>${esc(currency(summary.recebimentos))}</strong></div>
                    <div class="mini"><p>Comissões da equipe</p><strong class="amarelo">${esc(currency(recebCom))}</strong></div>
                    <div class="mini"><p>Já repassado</p><strong class="amarelo">${esc(currency(summary.repasses))}</strong></div>
                  </div>
                </div>

                <div class="card"><p class="kicker2">Cardápio do evento</p>${cardapioHtml}</div>
                <div class="card"><p class="kicker2">Equipe escalada · ${d.equipe.length}</p>${equipeHtml}</div>
                <div class="card"><p class="kicker2">Recebimentos da equipe · ${d.recebimentos.length}</p>${recebHtml}</div>
                <div class="card"><p class="kicker2">Consumo da produção</p>${consumoHtml}</div>
                <div class="card"><p class="kicker2">Transferências da produção</p>${transfHtml}</div>

                <p class="foot">Documento interno da Beetz — contém dados pessoais da equipe. Gerado pela Colmeia em ${new Date().toLocaleString('pt-BR')}${geradoPor ? ` por ${esc(geradoPor)}` : ''}.</p>
              </body></html>`)
              w.document.close()
              w.focus()
              // Poppins e flyer precisam carregar antes do print — senão a
              // folha sai com fonte trocada ou foto em branco. fonts.ready
              // cobre a fonte; o timeout de segurança dispara mesmo offline.
              let disparado = false
              const disparar = () => {
                if (disparado) return
                disparado = true
                try { w.focus(); w.print() } catch { /* janela já fechada */ }
              }
              try { w.document.fonts.ready.then(() => setTimeout(disparar, 400)) } catch { /* sem suporte */ }
              setTimeout(disparar, 1800)
            } catch {
              alert('Não deu pra montar o dossiê agora — tenta de novo em instantes.')
            } finally {
              setDossieBusy(false)
            }
          }

          return (
          <>
          <div className="flex flex-wrap gap-2 mb-3">
            <button onClick={exportPdf} className="flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm">
              <Printer size={14} /> Exportar PDF
            </button>
            {canExportClosingPdf(accessRole) && (
              <button
                onClick={exportDossie}
                disabled={dossieBusy}
                title="Documento interno completo: conta, cardápio, equipe com CPF, recebimentos e consumo"
                className="flex items-center gap-1.5 bg-beetz-dark text-white font-bold px-4 py-2 rounded-xl text-sm border border-white/20 hover:bg-black disabled:opacity-60"
              >
                <ShieldCheck size={14} /> {dossieBusy ? 'Montando...' : 'Dossiê completo (PDF)'}
              </button>
            )}
            <button onClick={copyResumo} className="flex items-center gap-1.5 bg-white/10 text-white font-bold px-4 py-2 rounded-xl text-sm hover:bg-white/15">
              <Copy size={14} /> {copied ? 'Copiado ✓' : 'Copiar pro WhatsApp'}
            </button>
          </div>
          {/* Documento branco de propósito: é a folha que se mostra pra
              produtora, destacada do painel interno escuro. */}
          <div className="bg-white text-beetz-dark rounded-2xl p-5 md:p-6">
            <div className="flex items-start gap-4 mb-4 pb-4 border-b border-beetz-dark/10">
              {event.flyer_url && (
                <img src={event.flyer_url} alt="Flyer" className="w-20 h-20 object-cover rounded-xl border border-beetz-dark/10 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-beetz-dark/40">Fechamento do evento</p>
                <p className="font-extrabold text-lg leading-tight mt-0.5">{event.name}</p>
                <p className="text-xs text-beetz-dark/50 mt-1">
                  {event.event_date ? dateBR(event.event_date) : ''}{event.start_time ? ` · ${event.start_time.slice(0, 5)}` : ''}
                  {event.music_style ? ` · ${event.music_style}` : ''}
                </p>
                {(event.location || event.city) && (
                  <p className="text-xs text-beetz-dark/50">📍 {[event.location, event.city].filter(Boolean).join(', ')}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <StatementRowLight label={`Vendas (${vendasFonte})`} value={vendasBase} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-beetz-dark/70">Percentual do produtor</span>
                <span className="font-semibold">{pctProdutor}%</span>
              </div>
              <StatementRowLight label={`Valor a receber (${pctProdutor}% de ${currency(vendasBase)})`} value={valorAReceber} />
              <StatementRowLight label="Créditos ou bonificações" value={summary.creditosOuBonificacoes} />
              <StatementRowLight label="Consumo da produção (aba Consumo)" value={-summary.consumoProducao} />
              <StatementRowLight label="Repasses já pagos (aba Repasses)" value={-summary.repasses} />
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-beetz-dark/15">
                <span className="font-bold">Saldo a receber</span>
                <span className={`text-xl font-extrabold ${saldoAReceber >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {currency(saldoAReceber)}
                </span>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-beetz-dark/10">
              <p className="text-sm font-bold mb-2">Repasses já recebidos da Beetz</p>
              {repasses.length === 0 ? (
                <p className="text-xs text-beetz-dark/45">Nenhum acerto lançado ainda.</p>
              ) : (
                <div className="space-y-1">
                  {repasses.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-sm bg-beetz-gray/60 rounded-lg px-3 py-2">
                      <span className="text-beetz-dark/70">
                        {dateBR(r.paid_at)}{r.notes ? ` · ${r.notes}` : ''}
                      </span>
                      <span className="font-semibold">{currency(r.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[11px] text-beetz-dark/35 mt-5">
              Gerado automaticamente a partir dos lançamentos deste evento na Colmeia Beetz.
            </p>
          </div>
          </>
          )
        })())}
      </div>
    </div>
  )
}

function StatementRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/70">{label}</span>
      <span className={`font-semibold ${value < 0 ? 'text-red-300' : 'text-white'}`}>
        {value < 0 ? `− ${currency(Math.abs(value))}` : currency(value)}
      </span>
    </div>
  )
}

function StatementRowLight({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-beetz-dark/70">{label}</span>
      <span className={`font-semibold ${value < 0 ? 'text-red-600' : ''}`}>
        {value < 0 ? `− ${currency(Math.abs(value))}` : currency(value)}
      </span>
    </div>
  )
}

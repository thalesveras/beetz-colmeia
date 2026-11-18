# Revisão do estoque 01 — Movimentações, saldo e custo

Escopo: `StockMovementForm.tsx`, `BulkStockEntry.tsx`, `ProductCatalog.tsx`, `Stock.tsx` (Resumo e R$), e em `dataService.ts` as funções `createStockMovement`, `createStockMovementsBulk`, `updateStockMovement`, `getStockBalances`, `listProductAvgCosts`, `listStockAvailability`, `isPositiveMovementType` (mais `updateCompraMovement` e as duas `propagate…`, que mexem no custo).
Revisão somente de leitura. Nenhum arquivo existente foi alterado.

**Limite importante:** `supabase/schema.sql` (176 linhas) e `seed.sql` não têm nenhuma tabela, view ou trigger de estoque (`grep -i stock` volta vazio). As views `stock_balances`, `stock_available`, `product_avg_costs`, as RPCs `transfer_stock` / `transfer_event_leftover` e o trigger `check_movement_event_coherence` **não estão no repositório**. Tudo que depende do que o banco calcula está marcado como **(hipótese)**.

## 1. Resumo em 5 linhas

1. O saldo na tela é só leitura da view `stock_balances`. No código o sinal de cada tipo está em `POSITIVE_MOVEMENT_TYPES`, que só se confere com o banco se alguém abrir a view lá.
2. O pior risco está no custo: o valor de um preço digitado muda conforme a tela. "1.250" vira R$ 1,25 no formulário e R$ 1.250 na carga em lote.
3. O modo fardo reaproveita o campo de preço sem convertê-lo: o custo de referência por unidade vira "preço do fardo" e é dividido de novo por 12.
4. A regra "Compra sem preço não existe" só vale no formulário. A carga em lote, a edição na lista e o cancelamento contornam a regra.
5. As trilhas de sincronização com Financeiro e Produtos do evento têm desvios silenciosos: edição sem despesa não propaga custo, cancelar Compra não cancela a despesa (no cliente), a conferência da virada pode ser rejeitada pelo banco (hipótese).

## 2. Achados por gravidade

### CRÍTICO

Nenhum achado confirmado só pelo código nesta categoria. O mais próximo é o ALTO-1, porque erra o valor em R$ de forma silenciosa. Se a hipótese do ALTO-4 se confirmar no banco, a virada com contagem diferente quebra em produção e ele sobe para Crítico.

### ALTO

**ALTO-1 — Parser de preço diferente em 4 lugares: o mesmo texto vale coisas diferentes**
- `src/components/stock/StockMovementForm.tsx:86` (`parseCost`), `src/components/stock/BulkStockEntry.tsx:15-21` (`num`), `src/pages/Stock.tsx:514` (`saveEdit`), `src/components/stock/ProductCatalog.tsx:110` e `:141`.
- O que acontece: o formulário faz só `Number(c.replace(',', '.')) || 0`. A carga em lote tem regra de milhar (`/^\d{1,3}(\.\d{3})+$/`). A edição na lista e o catálogo usam o mesmo formato do formulário.
- Exemplo: preço de um fardo de uísque digitado como `1.250` (mil duzentos e cinquenta).
  - Formulário: `Number('1.250') = 1.25`, vira R$ 1,25 por fardo; em modo fardo de 12, R$ 0,10/un.
  - Carga em lote: `num('1.250') = 1250`, vira R$ 1.250.
  - `1.250,00` no formulário: `'1.250.00'` vira NaN, depois 0, o botão "Adicionar" fica desabilitado sem mensagem.
- Correção: extrair um único `parseMoneyBR()` em `src/lib` (a regra do `num` de BulkStockEntry, que é a mais completa), usado nos 4 lugares. Quando o texto não vira número, mostrar "Preço inválido" em vez de zerar. Recusar custo ≤ 0 em Compra.

**ALTO-2 — Modo fardo divide de novo o custo de referência, que já é por unidade**
- `src/components/stock/StockMovementForm.tsx:364` (preenche `unitCost` com `reference_cost`, em R$/un), `:380` (`setEmFardos(true)` não converte o campo), `:111-113` (divide por `upp`).
- O que acontece: ao escolher o produto, o campo "Preço" recebe o custo de referência POR UNIDADE. Ao clicar "Fardos de 12", o rótulo vira "Preço do fardo" mas o valor continua o mesmo, e é dividido por 12.
- Exemplo: referência R$ 4,50/un, fardo de 12. Escolhe o produto, clica "Fardos de 12", quantidade 3. O sistema grava 36 un a R$ 0,375/un (total R$ 13,50). O correto seria R$ 4,50/un (total R$ 162,00). A despesa Pendente sai com R$ 13,50. O custo médio do produto cai e o valor em R$ do estoque fica subavaliado. A única pista é o texto "· R$ 0,38/un" na linha de conversão (`:389`).
- Correção: ao alternar Unidades/Fardos, converter o campo (`unitCost × upp` ao ir para fardos, `÷ upp` ao voltar). Ou, em modo fardo, pré-preencher `reference_cost × upp`.

**ALTO-3 — Carga em lote aceita Compra sem preço e com preço inválido (e a linha de nome vazio cai no 1º produto)**
- `src/components/stock/BulkStockEntry.tsx:74` (`good` só exige produto e `qty > 0`), `:50` e `:89` (custo opcional), `:15-21` e `:52-55` (parser e casamento de nome).
- O que acontece:
  - `Compra` sem custo entra com `unit_cost: null`, contra a regra do formulário ("Compra sem preço não existe mais", `StockMovementForm.tsx:116`).
  - `Água; 100; abc` vira custo `0` (não `null`) e é gravado como `unit_cost: 0`.
  - `Água; 100; -4` grava `unit_cost: -4` (o regex do `num` mantém o `-`).
  - Linha sem nome (`; 12` ou só `12`): `name = ''`, e `norm(p.name).includes('')` é sempre verdadeiro, então casa com o PRIMEIRO produto do catálogo.
  - O casamento "contém" usa `find`: `Água` casa com o primeiro produto que contiver "agua" (por exemplo "Água com gás 500ml") quando o certo era "Água 500ml".
- Exemplo: colar `Heineken; 6000` como Compra grava 6.000 un com custo nulo. O estoque soma saldo, mas o valor em R$ desse produto não sobe (o produto fica no aviso "sem custo"). Colar `; 12` joga 12 un no primeiro produto do catálogo, e só o chip verde mostra o nome.
- Correção:
  - Em `good`, exigir `cost > 0` quando `movementType === 'Compra'`; caso contrário a linha vai para `bad` com "falta preço".
  - Recusar custo negativo ou zero.
  - Exigir `name` não vazio e só aceitar o casamento por "contém" quando houver UMA candidata. Com duas ou mais, marcar "ambíguo: Água 500ml / Água com gás".

**ALTO-4 (hipótese) — Conferência da virada grava Ajuste com `event_id`, e o banco pode recusar**
- `src/pages/Stock.tsx:422-430` (`createStockMovement` com `movement_type: 'Ajuste (entrada|saída)'` e `event_id: turnFromEventId`); contraste com `src/components/stock/StockMovementForm.tsx:77-82`, que diz que o banco RECUSA vínculo de Compra e Ajuste com evento (trigger `check_movement_event_coherence`).
- O que acontece: dois trechos do código afirmam coisas opostas sobre a mesma regra. O trigger não está no repo, então não consegui confirmar qual lado está certo.
- Exemplo: sobra do evento com sistema 24 e contagem física 22. O ajuste de 2 un é rejeitado, cai no `catch` (`:450`) e mostra só o texto do erro. Se acontecer no 2º produto, o 1º já foi transferido (as chamadas são uma a uma, não atômicas) e o evento fica meio virado.
- Correção: testar no banco (inserir Ajuste com `event_id`). Se for recusado, gravar o ajuste com `event_id: null` no almoxarifado do evento (o local já diz de quem é) e guardar o evento só na nota. Em qualquer caso, fazer o conjunto numa RPC atômica, como `transfer_event_leftover` já é.

### MÉDIO

**MÉDIO-1 — Editar Compra permite apagar o preço (burla a regra) e zerar a despesa**
- `src/pages/Stock.tsx:514` e `src/lib/dataService.ts:1561`.
- O que acontece: `Number(editCost.replace(',', '.')) || null` — campo vazio, `0` ou texto inválido viram `null`. `updateCompraMovement` grava `unit_cost: null` e, se a despesa está Pendente, `unit_value: patch.unit_cost ?? 0`.
- Exemplo: Compra de 36 un a R$ 4,50 (despesa R$ 162,00). Alguém apaga o preço e salva: a Compra fica sem custo e a despesa Pendente passa a R$ 0,00.
- Correção: na edição de Compra exigir preço > 0 (mesma validação do formulário); se vier `null`, não chamar o update.

**MÉDIO-2 — Editar quantidade sem validação (0, negativa, decimal)**
- `src/pages/Stock.tsx:1082` e `:515`/`:520`. O `<input type="number" min={0}>` não está dentro de um `<form>`, então o `min` não bloqueia nada.
- Exemplo: digitar `0` e confirmar grava quantidade 0 (Compra com despesa de quantidade 0). Digitar `-5` grava −5 e o sinal do tipo passa a produzir o saldo ao contrário (hipótese: o banco pode ter CHECK `quantity > 0`).
- Correção: validar `editQuantity > 0` antes de salvar; mostrar erro no lugar.

**MÉDIO-3 — Editar Compra sem despesa (ou com despesa já paga) não propaga o custo ao produto do evento**
- `src/lib/dataService.ts:1555` (`if (!exp) return 'none'`) e `:1556` (`return 'locked'`), antes da chamada `propagateCompraCostToEventProduct` (`:1571`).
- O que acontece: a propagação do custo médio para `event_products.unit_price` só roda no caminho `synced`. Compra lançada com a opção "Gerar despesa" desmarcada, ou com despesa já aprovada/paga, atualiza o estoque e deixa o "Preço de custo" da aba Produtos do evento velho.
- Exemplo: Compra no almoxarifado do evento de R$ 4,00 para R$ 5,00, sem despesa vinculada. `product_avg_costs` (banco) mostra 5; `event_products.unit_price` continua 4. Os dois deveriam bater (o comentário da função diz que é esse o objetivo).
- Correção: chamar a propagação independentemente do resultado da despesa (fora dos retornos antecipados).

**MÉDIO-4 — `propagateEventProductCostToMovements` considera o espelho de transferência como "a única entrada"**
- `src/lib/dataService.ts:1612-1621`: filtra `Compra`, `Entrada` e `Ajuste (entrada)` no local do evento, sem excluir `mirror_of` e sem exigir `unit_cost`.
- O que acontece: o evento recebeu 24 un por transferência (uma linha `Entrada` espelho). Ao editar o custo do produto na aba Produtos, a função acha "exatamente uma entrada", grava o custo nessa linha-espelho (que a regra diz que não se edita) e responde `'synced'`. O custo real (a Compra no almoxarifado central) não muda.
- Correção: excluir `mirror_of IS NOT NULL` e linhas sem `unit_cost` desse filtro; se não restar Compra, devolver `'none'`.

**MÉDIO-5 — Cancelar/reativar Compra: sem tratamento de erro, sem tocar na despesa vinculada (no cliente)**
- `src/pages/Stock.tsx:526-528` (`toggleStatus`).
- O que acontece: só troca `status`. Não há `try/catch` (erro vira promessa rejeitada e a tela não avisa), não pede confirmação, e o código cliente não cancela a despesa ligada (`expenses.stock_movement_id`). Se existir trigger no banco que cuide disso, **(hipótese)**, não está no repo.
- Exemplo: Compra de R$ 162,00 cancelada: o estoque perde as 36 un e a despesa Pendente de R$ 162,00 continua no Financeiro.
- Correção: confirmar antes de cancelar; ao cancelar Compra, avisar/cancelar a despesa Pendente vinculada (ou impedir se já paga); envolver em `try/catch` com mensagem.

**MÉDIO-6 — "Perdas do mês" no Resumo usa só as 800 movimentações mais recentes**
- `src/pages/Stock.tsx:346-361` (`perdasMes` percorre `movements`) e `src/lib/dataService.ts:1480` (`else query = query.limit(800)`).
- O que acontece: em mês de operação intensa (muitas Compras, transferências e perdas), as primeiras do mês saem do corte e a soma fica menor que a real, sem aviso. O mesmo corte vale para os filtros de data da aba Movimentações: um período antigo aparece vazio, parecendo que não houve nada.
- Exemplo: 950 movimentações no mês; as 150 mais antigas, incluindo R$ 600 de Quebra do dia 2, não entram. O card mostra R$ 600 a menos.
- Correção: calcular perdas do mês no banco (consulta agregada `status='Ativo'`, tipos de perda, `created_at >= início do mês`) ou, no mínimo, avisar "mostrando as 800 mais recentes" quando o corte for atingido.

**MÉDIO-7 (hipótese) — Custo médio é histórico, não acompanha o que sobrou**
- `src/pages/Stock.tsx:168-176` e `:331-336` multiplicam o saldo atual pelo `avg_cost` da view. A definição da view não está no repo; os comentários (`types.ts:803`, `dataService.ts:1649`) dizem "média ponderada das Compras com preço".
- Se a média considera todas as Compras de sempre: Jan: 100 un a R$ 2; hoje: 100 un a R$ 4. As 100 de janeiro já foram consumidas, mas a média continua R$ 3, então o saldo de 100 un vale R$ 300 em vez de R$ 400. Confirmar a definição da view e decidir se esse é o critério desejado.
- Verificar também se a view exclui `status = 'Cancelado'`, `unit_cost IS NULL` e `unit_cost <= 0`. O código JS de `propagateCompraCostToEventProduct` (`:1592-1603`) faz esses filtros, então os dois devem bater.

### BAIXO

**BAIXO-1 — Valor em R$ ignora saldo negativo e usa custo único por produto**
- `src/pages/Stock.tsx:168-172` e `:331-334`: `cost && a.balance > 0`. Soma só saldos positivos de cada local.
- Exemplo: Central −10 e Evento +10 do mesmo produto a R$ 5: o físico líquido é 0, o painel mostra R$ 50. É uma escolha (o resumo já tem um texto "negativo explicado", commit c4461d9), mas o número total não bate com a soma dos saldos. `cost` também é falso quando `avg_cost` é 0, tratado como "sem custo".

**BAIXO-2 — Arredondamento do custo por unidade no modo fardo**
- `src/components/stock/StockMovementForm.tsx:111-113`: custo/un arredondado a 4 casas; a despesa usa `quantity × unit_value` (`:219-222`).
- Exemplo: fardo de 12 por R$ 50,00, 100 fardos: 1.200 un × R$ 4,1667 = R$ 5.000,04 na despesa contra R$ 5.000,00 pagos. Com fardo de 7 a R$ 100: 7 × 14,2857 = R$ 99,9999. Hipótese: a precisão da coluna `unit_cost` / `unit_value` no banco.
- Correção: para Compra em fardo, gerar a despesa com quantidade de fardos e valor do fardo, ou guardar o total da compra.

**BAIXO-3 — Stepper de quantidade arredonda para inteiro**
- `src/components/stock/StockMovementForm.tsx:400` e `:407`: `Math.round(q + 1)`. Com 2,5 o "+" leva a 4 (`Math.round(3.5)`) e o "−" leva a 2.

**BAIXO-4 — Fluxo da virada não recarrega a tela em caso de erro parcial**
- `src/pages/Stock.tsx:448-450`: `load()` só roda no caminho de sucesso. Se um item falhar no meio, as transferências já feitas não aparecem até recarregar a página.

**BAIXO-5 — `updateStockMovement` aceita qualquer campo; a proteção do espelho é só visual**
- `src/lib/dataService.ts:1527`: `Partial<Omit<StockMovement,'id'|'created_at'>>` aceita `movement_type`, `status`, `mirror_of`. Só `Stock.tsx:1106` (`!m.mirror_of`) esconde o botão. A proteção real depende de trigger no banco (hipótese).

**BAIXO-6 — Modo demo diverge do banco**
- `src/lib/dataService.ts:1665` (`listProductAvgCosts` demo devolve `avg_cost: null` para todos) e `:1631-1646` (demo devolve linhas de saldo para todo produto × local, o banco só para quem tem movimentação, hipótese). No demo o valor em R$ sempre mostra zero.

**BAIXO-7 — Busca linear por produto a cada render**
- `src/components/stock/ProductCatalog.tsx:72` (`avgCosts.find` por produto, dentro do render). Com centenas de produtos vale um `Map`, como `Stock.tsx:168` já faz.

### Código morto / duplicação

- `src/components/stock/BulkStockEntry.tsx:96`: `catch (e: any)`; padrão do resto do código é `unknown`.
- A lógica de sinal por tipo existe em dois lugares (`POSITIVE_MOVEMENT_TYPES`, `dataService.ts:1355`, e a view `stock_balances`). O próprio comentário diz "mantém os dois lugares em sincronia" mas não há teste nem como conferir sem a view no repo.
- `['Compra', 'Entrada', 'Ajuste (entrada)']` aparece duas vezes (`dataService.ts:1592` e `:1618`); sugestão: uma constante `COST_ENTRY_TYPES`.
- Quatro parsers de número monetário (ver ALTO-1).

## 3. Até 5 melhorias para simplificar o uso

1. **Um campo de preço só e claro:** um componente `PrecoInput` (mesmo parser, mensagem "Preço inválido", mostra a conversão por unidade/fardo ao vivo). Resolve ALTO-1, ALTO-2 e BAIXO-2 de uma vez.
2. **Versionar as views e RPCs no repo:** colocar `stock_balances`, `stock_available`, `product_avg_costs`, `transfer_stock`, `transfer_event_leftover` e os triggers em `supabase/migrations/`. Hoje metade dos achados fica em hipótese por falta disso.
3. **Cancelar Compra com 1 passo guiado:** o botão pergunta "Cancelar também a despesa de R$ 162,00 (Pendente)?" e faz tudo junto. Evita MÉDIO-5.
4. **Prévia da carga em lote com o total:** mostrar por linha "Quantidade × custo = R$" e o total, e marcar em vermelho o que está sem preço ou ambíguo. O usuário vê o erro antes de lançar.
5. **Aviso de "mostrando as 800 mais recentes"** na aba Movimentações e no card de perdas, com atalho "ver o mês inteiro". Evita MÉDIO-6.

## 4. O que conferi e o que não deu para conferir

- Conferido no código: o sinal de cada tipo no cliente, o fluxo do formulário (cesta, fardo, despesa vinculada), a carga em lote, a edição/cancelamento, as propagações de custo e as contas de R$ do Resumo.
- Não conferido (fora do repo): definição das views, triggers, RPCs, tipos e CHECKs das colunas `quantity` e `unit_cost`. Qualquer afirmação sobre eles está marcada como hipótese.

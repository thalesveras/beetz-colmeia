# Revisão de estoque 03 — Ligação PDV → Estoque

Escopo: vendas do PDV (relatório/Dex) → Vendido, baixa de estoque, consumo da produção e as contas de Reconciliação.
Revisão somente de leitura. Tudo abaixo foi conferido no código; o que não deu para confirmar está marcado **[HIPÓTESE]**.

## 1. Resumo

1. A baixa automática do front (`syncStockFromPdv`, `src/lib/dataService.ts:2619`) é uma `Saída` no almoxarifado **do evento** (nunca do central), refeita do zero a cada import/exclusão.
2. As duas telas de conta (`EventStockSection` e `StockReconciliationCard`) tratam qualquer `Saída` no almoxarifado do evento como "Voltou". Como a baixa do PDV é uma `Saída`, a venda aparece como devolução e a conta do evento fica errada.
3. `sync_event_pdv_stock` **não existe em lugar nenhum do repositório**: nem código, nem `supabase/` (só `schema.sql` e `seed.sql`, sem tabelas de estoque), nem histórico git (`git log -S`), nem nos 5 `.zip`. Não dá para dizer se baixa duas vezes. Precisa ser verificada direto no banco.
4. A regra de "relatório substituído" só enxerga um sentido (novo cobre antigo). Subir um relatório mais antigo depois do mais novo soma os dois.
5. Há buracos de sincronia: vincular produto não baixa estoque, excluir o único relatório deixa o Vendido velho, erros de sincronização são engolidos (`.catch(() => 0)`).

## 2. Achados

### CRÍTICO

**C1. A baixa do PDV vira "Voltou" e a conta de Entrou/Voltou/Vendido sai errada**
- `src/pages/events/EventStockSection.tsx:102` e `:115`; `src/pages/events/StockReconciliationCard.tsx:53` e `:63`; origem da `Saída` em `src/lib/dataService.ts:2644-2652`.
- O que acontece: a baixa é `movement_type: 'Saída'` no almoxarifado do evento. Os dois cards somam toda `Saída`/`Ajuste (saída)` do almoxarifado do evento em "Voltou/sobrou" (`in_event_location`).
  - `EventStockSection` ainda subtrai `sold_quantity` (que vem do mesmo PDV), então a venda sai **duas vezes**: `sobra = entrou − voltou − perdas − consumo − vendido`.
  - `StockReconciliationCard` não usa o PDV: o "Vendido*" é `enviado − sobra − perda`, e a venda já foi parar em `sobra`.
- Exemplo: entrou 100 garrafas; o PDV vendeu 80. A baixa lança Saída de 80. `EventStockSection`: Voltou = 80, Vendido = 80, Sobra = 100 − 80 − 80 = **−60** (o certo é 20). `StockReconciliationCard`: Voltou = 80, "Vendido*" = 100 − 80 = **20**, Retorno = **80%** (o certo é Vendido 80, Voltou 0, Retorno 0%). O saldo de `getEventStockByProduct` (`dataService.ts:2915-2931`) continua certo (net = 20), então as telas se contradizem.
- Correção: distinguir a baixa do PDV nos cards (a nota `PDV_BAIXA_NOTA` já a identifica; o melhor é um `movement_type` próprio, como 'Venda PDV'). Contar como "Vendido", não como "Voltou". `Voltou` deve ser só `Devolução do Evento` e a virada/retirada explícita. Fazer os dois cards usarem a mesma função de cálculo.
- Observação **[HIPÓTESE]**: o trigger que espelha o `Envio para Evento` no almoxarifado do evento (comentado em `dataService.ts:3059`) não está no repositório. Se esse espelho for `Entrada` dentro do almoxarifado do evento, `StockReconciliationCard:49-50` soma o envio **duas vezes** em "Entrou" (o envio original e o espelho). Conferir no banco.

**C2. `sync_event_pdv_stock` (nota 'Baixa automatica - venda PDV') — risco de baixa em dobro não verificável**
- Busca feita: `grep` por `sync_event_pdv_stock`, `Baixa automatica`, `venda PDV` e `.rpc(` no repositório inteiro (os `rpc` existentes são só os listados em `dataService.ts`; nenhum é esse), `git log --all -S"sync_event_pdv_stock"` e `-G`, e os 5 `.zip`: **zero ocorrências**. `supabase/` tem só `schema.sql` (176 linhas, sem estoque/vendas) e `seed.sql`.
- Quem chama o quê (confirmado): só o front chama `syncStockFromPdv` (`dataService.ts:2550` no import de vendas e `:2607` na exclusão). Ninguém no front chama a função de banco.
- Risco **[HIPÓTESE]**: se existir no banco (migração aplicada fora do repo) e for disparada por trigger em `event_sales_lines`/`event_sales_imports` ou por cron, a mesma venda baixa duas vezes. O cancelamento do front filtra por `notes = 'Baixa automática do PDV (vendas oficiais)'` (`dataService.ts:2641`). A nota do banco é outra ('Baixa automatica - venda PDV', sem acento), então o front **nunca cancela nem refaz** as baixas do banco.
- De qual estoque baixa: o front, do almoxarifado do evento (`stock_locations.event_id = eventId`, `:2620-2623`). A função de banco: **desconhecido**.
- Como verificar (no SQL do Supabase): `select proname, prosrc from pg_proc where proname = 'sync_event_pdv_stock'`; `select tgname, tgrelid::regclass from pg_trigger where not tgisinternal`; `select notes, status, count(*), sum(quantity) from stock_movements where notes ilike 'Baixa autom%' group by 1,2`. Mais de uma nota por evento ⇒ duplicidade.
- Correção: trazer a migração para `supabase/`, escolher UM mecanismo (o do banco, em transação, é o mais robusto) e remover o outro.

**C3. Relatório mais antigo subido depois soma por cima do mais novo**
- `dataService.ts:2561-2593` (`supersedeCoveredImports`); chamada em `:2545`.
- O que acontece: só se verifica "o upload **novo** cobre algum antigo". Nunca "o novo está **coberto** por um antigo". O relatório do PDV é cumulativo; se o das 23h já está oficial e alguém sobe o das 2h (subconjunto), nenhum deles é marcado como substituído e os dois entram na soma de `syncSoldQuantitiesFromPdv` (`:2671-2676`) e de `syncStockFromPdv` (`:2629-2634`).
- Exemplo: oficial das 23h = 120 cervejas. Sobe-se o de 2h = 50. Vendido = 170 e a baixa é Saída de 170: saldo errado em 50 unidades, custo do vendido e repasse inflados.
- Correção: no mesmo laço, se o novo está coberto por um antigo (`novo ≤ antigo` em todos os nomes e total), marcar o NOVO como `superseded_by = antigo.id`. Avisar na tela "Este arquivo é mais antigo que o oficial".

### ALTO

**A1. Vincular um produto não dá baixa no estoque**
- `dataService.ts:2837-2838` (`mapPosNameToProduct` chama só `syncSoldQuantitiesFromPdv` e `syncProductionConsumptionFromPdv`; falta `syncStockFromPdv`). A própria tela promete baixa automática (`SalesReportCard.tsx:~250`).
- Exemplo: sobe o relatório com 40 "Heineken LN" sem vínculo → baixa 0. O usuário vincula → Vendido da aba Produtos vira 40, mas o saldo do estoque continua 100 até o próximo upload ou exclusão. Produtos e Estoque divergem em 40.
- Correção: chamar `syncStockFromPdv(eventId, userId)` no fim de `mapPosNameToProduct` (e receber o `userId`).

**A2. Excluir o único relatório deixa o Vendido velho (baixa some, Vendido fica)**
- `dataService.ts:2680` (`if (s == null) continue`, comentado em `:2662` como "vendas informadas na mão sobrevivem") e `:2605-2607`.
- O que acontece: a exclusão recalcula; produto sem nenhuma linha oficial é ignorado. Resultado: a baixa é cancelada (correto, `esperado` vazio), mas `sold_quantity` fica com o valor antigo e as linhas criadas pelo PDV (`notes: 'Criado pelo relatório da máquina (PDV)'`, `:2724`) ficam.
- Exemplo: relatório com 80 vendidas → Vendido 80 e baixa 80. Exclui-se o relatório: baixa 0 (saldo volta a 100), Vendido continua **80** e o custo do vendido/repasse continua contando 80.
- Correção: marcar a origem do `sold_quantity` (ex.: coluna `sold_from_pdv boolean`). No sync, zerar/limpar só os que vieram do PDV e não têm mais linha oficial; manter os digitados à mão.

**A3. Dia seguinte "cobre" o dia anterior e apaga venda**
- `dataService.ts:2585-2586`.
- O que acontece: a regra é "todo nome do antigo aparece no novo com contagem ≥ e o total não caiu". Isso vale também para dois relatórios de **dias diferentes** (não cumulativos) quando o segundo dia vendeu mais de tudo. O comentário em `:2554-2556` afirma que dias diferentes "não se cobrem", mas isso não é garantido pela regra.
- Exemplo: sexta = 100 cervejas, 60 águas (R$ 3.000). Sábado = 120 cervejas, 70 águas (R$ 3.600). O sábado cobre a sexta, que é marcada como substituída: some a venda de sexta (100 cervejas) da conta e da baixa.
- Correção: comparar também `report_date`/janela de horário, ou exigir confirmação do usuário ("este arquivo substitui o de dd/mm?") quando as datas forem diferentes. O envio da Dex (`SalesReportCard.tsx:~478`) grava a data local do upload e não a do relatório, então a data não ajuda hoje.

**A4. Falhas são engolidas e a baixa pode ficar zerada em silêncio**
- `dataService.ts:2545-2550`, `:2605-2607` (todos com `.catch(() => 0)`) e `:2636-2654` (cancela as vigentes e só depois insere).
- O que acontece: se o `insert` falhar (rede, RLS, coluna inteira — ver M3), as baixas antigas já foram canceladas e nada é lançado; a UI mostra "os produtos vinculados tiveram baixa automática" (`SalesReportCard.tsx:~252`) mesmo assim. Não há transação.
- Exemplo: 5 produtos com baixa; o upload novo cai no insert. Estoque volta a 100% (as 5 baixas canceladas) e ninguém é avisado.
- Correção: levar o "cancelar + inserir" para uma função de banco (transação única) e mostrar o erro na tela quando o sync falhar.

**A5. Baixa automática editável/reativável à mão duplica ou é sobrescrita**
- `src/pages/events/StockTab.tsx:70` (editar quantidade) e `:77` (`toggleStatus` reativa); `dataService.ts:2636-2642`.
- O que acontece: a baixa do PDV aparece na lista de movimentações como qualquer outra. Reativar uma baixa cancelada (histórico do sync anterior) soma ao saldo uma baixa a mais até o próximo sync; editar a quantidade é desfeito no sync seguinte.
- Exemplo: baixa vigente de 80; o usuário reativa uma antiga cancelada de 50: saldo cai 130 até o próximo upload.
- Correção: bloquear edição/reativação de movimentos com `PDV_BAIXA_NOTA` (ou marcar `auto=true`) e mostrar "gerada pelo PDV — mude o relatório".

### MÉDIO

**M1. Venda maior que o enviado gera saldo negativo sem aviso**
- `dataService.ts:2644-2654`: nenhum teste de saldo antes de inserir a Saída. Se o banco também não barra **[HIPÓTESE]**, entra negativo.
- Exemplo: enviou 50, PDV vendeu 60: saldo −10. `EventStockSection` mostra Sobra negativa; `StockReconciliationCard` mostra o ícone de alerta em "Vendido" apenas quando `consumo < 0`.
- Correção: aceitar a baixa (é fato físico), mas destacar "vendeu 10 a mais do que entrou — falta registrar reforço/entrada" no card do PDV.

**M2. `limit(1)` pega "um" almoxarifado do evento**
- `dataService.ts:2620-2623`: sem `order`. Se houver mais de um estoque ligado ao evento (virada de evento cria o do destino), a baixa pode ir para o errado. **[HIPÓTESE]** de que existam dois; a restrição de unicidade não está no repositório.
- Correção: usar `ensureEventStockLocation` / garantir `unique(event_id)`.

**M3. Dose × garrafa: quantidades fracionadas sem arredondar na baixa**
- `dataService.ts:2632` (`quantity × units_per_sale`) vs. `:2681` (o Vendido arredonda a 2 casas, a baixa não).
- Exemplo: 37 doses × 0,1 = 3,7000000000000003 na baixa e 3,7 no Vendido. Se `stock_movements.quantity` for inteiro **[HIPÓTESE]**, o insert falha e o erro é engolido (A4).
- Correção: `Math.round(x * 100) / 100` também em `esperado`; checar o tipo da coluna.

**M4. Produto sem vínculo some da conta de estoque**
- `dataService.ts:2630` (`!l.product_id` descarta) e `:2673`.
- O que acontece: a linha só aparece no painel "sem vínculo" do `SalesReportCard`. Reconciliação e saldo não mostram o gap.
- Exemplo: 300 "Gin Tônica" sem vínculo = 300 doses fora da baixa; o saldo da garrafa não cai.
- Correção: aviso no topo da aba Estoque e da Reconciliação ("há R$ X do PDV sem vínculo").

**M5. Consumo da produção vindo do PDV não baixa estoque, mas as duas telas tratam diferente**
- `dataService.ts:2737` (explícito: sem baixa no saldo físico) e `ProductionConsumptionTab.tsx:61` (só o lançamento manual baixa, com `deductFromEventStock`).
- `StockReconciliationCard:56` conta `Consumo Interno` (movimento) como perda e ignora a tabela de consumo; `EventStockSection` faz o contrário (`:106` comentário, e soma `consumption`). O mesmo consumo de produtora do PDV aparece em uma e não na outra.
- Correção: um único critério (tabela `production_consumption`) nas duas, com a baixa física feita no encerramento.

**M6. Efeito de `posSoldByProduct` inclui relatório substituído e de produção**
- `src/pages/events/ProductsTab.tsx:100-107`: não filtra `superseded_by` nem `kind`, ao contrário de `pdvOficial` (`:119-133`).
- Exemplo: 2h = 50 (substituído) + 23h = 120 + produção = 10: `posSold` = 180; o Vendido real é 120. O valor vai para o modal de edição (`:560`). Não conferi como o modal o usa **[HIPÓTESE]: pode induzir o usuário a gravar 180**.
- Correção: reaproveitar o conjunto `oficiais` de vendas.

**M7. A Reconciliação nunca compara com o PDV**
- `StockReconciliationCard.tsx:59-66`: "Vendido*" é sempre derivado. Não existe alerta quando `derivado ≠ PDV`.
- Exemplo: derivado 78, PDV 80: ninguém vê os 2 de diferença (quebra não lançada, furto, erro de contagem).
- Correção: coluna "PDV" e "Diferença" ao lado, em destaque quando ≠ 0.

### BAIXO

**B1.** `deleteEventSalesImport` chama `syncStockFromPdv(eventId, null)` (`dataService.ts:2607`): as baixas refeitas perdem o autor (`created_by = null`). Passar o usuário.

**B2.** Cada sync cancela **todas** as baixas e relança todas (`:2636-2654`): N produtos × cada upload = histórico enche de `Cancelado`. Fazer diff (ajustar só o que mudou).

**B3.** Alias é global por nome (`:2822-2823`). O mesmo "Chopp" com outra medida em outra casa herda o `units_per_sale` errado. Trocar o alias não corrige as linhas de eventos antigos (de propósito, `:2812`), mas os novos importam com o alias novo. Mostrar o `units_per_sale` herdado ao importar.

**B4.** `Perda`/`Quebra`: `StockReconciliationCard:55` conta de qualquer almoxarifado; `EventStockSection:104` só do almoxarifado do evento. Padronizar.

**B5.** Race: dois uploads simultâneos (duas abas, Dex + arquivo) rodam o cancelar+relançar em paralelo. **[HIPÓTESE]**, sem lock no código.

## 3. Melhorias para simplificar o uso

1. **Um único "Venda PDV"** como tipo de movimento próprio, aparecendo como "Vendido" nas telas, em vez de uma Saída genérica (resolve C1 e A5 de uma vez).
2. **Painel "pendências do PDV"** no topo da aba Estoque: produtos sem vínculo, vendas acima do enviado, relatório mais antigo ignorado, diferença PDV × derivado.
3. **Vincular + baixar num clique:** ao vincular, rodar também a baixa e mostrar "baixou 40 un. de Heineken do estoque do evento".
4. **Pergunta ao subir o arquivo:** "Este relatório substitui o de dd/mm hh:mm?" com resumo (itens, total), em vez da regra silenciosa de cobertura.
5. **Uma função de banco só para refazer a baixa** (`sync_event_pdv_stock` dentro de transação, com lock por evento), chamada pelo front via `rpc`. Uma fonte de verdade, sem duas notas diferentes.

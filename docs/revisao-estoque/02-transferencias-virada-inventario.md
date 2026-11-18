# Revisão 02 — Transferências, virada de evento, devolução, reservas, inventário e chat

Escopo: leitura do código, nenhum arquivo existente alterado.
Commit lido: `891a1d1` (branch `main`).

**Limite importante:** as funções SQL (`transfer_stock`, `transfer_event_leftover`, `get_or_create_event_location`), os triggers de espelho e as views (`stock_balances`, `stock_available`) **não estão no repositório**. `supabase/schema.sql` só tem perfis/usuários (176 linhas). Tudo que depende do que o banco faz é marcado como **[hipótese]**. O que está marcado **[confirmado]** foi lido no código TypeScript.

---

## 1. Resumo em 5 linhas

1. O fluxo de aprovar/devolver pedido de transferência é feito em 2 escritas soltas (movimento e depois status) e sem trava de estado. Mexer no seletor de status duplica a saída de estoque.
2. A virada com contagem editada roda em loop, sem transação, e não recarrega os saldos quando falha no meio. Tentar de novo repete os ajustes.
3. A devolução não compara com o que foi enviado nem com o que já foi devolvido. A tela da virada e a devolução por pedido fazem coisas parecidas sem se enxergar.
4. A conta do evento (`EventStockSection`) subtrai a venda do PDV duas vezes: uma como "Vendido" e outra como "Voltou", porque a baixa automática do PDV é uma `Saída` no almoxarifado do evento.
5. O chat tem boa prévia e confirmação, mas lê o primeiro número da frase (`1.000` vira 1), trata "caixa" como unidade quando o produto não tem fardo cadastrado e diz "Nada foi alterado" mesmo depois de gravar.

---

## 2. Achados por gravidade

### CRÍTICO

#### C1. Aprovar o mesmo pedido de transferência mais de uma vez gera saída em dobro
- `src/pages/Stock.tsx:223-229` e `src/pages/events/TransferRequestsTab.tsx:69-76` (idêntico, copiado).
- `src/lib/dataService.ts:3061-3106` (`approveTransferRequest`), especialmente a atualização de status em `3103-3104`.
- **O que acontece [confirmado]:** o seletor de status deixa ir de qualquer valor para qualquer valor. `handleTransferStatusChange` chama `approveTransferRequest` sempre que o novo valor é `Aprovado`, sem checar o status atual. Voltar para `Pendente` ou `Negado` só troca o texto (`updateTransferRequestStatus`) e **não estorna** o movimento já criado. A segunda aprovação gera um segundo par de movimentos. O `UPDATE` final também não tem `.eq('status','Pendente')`. Duas pessoas com a tela aberta (ambas veem `Pendente`) aprovam e geram dois lançamentos.
- **Segundo caminho [confirmado]:** o movimento é gravado primeiro e o status depois. Se o `UPDATE` do status falhar (rede, RLS), o erro sobe, o pedido continua `Pendente` com o movimento já gravado, e a nova tentativa duplica.
- **Exemplo:** pedido de 40 Red Bull do Central para a Samba. Aprovado: Central −40, Samba +40. Alguém muda para `Negado` (por engano) e depois para `Aprovado`: Central −80, Samba +80. Os pedidos mostram "Aprovado 40", o saldo mostra 80 transferidos.
- **Correção proposta:**
  1. Fazer a aprovação em uma única RPC no banco (`approve_transfer_request(id)`) que faz `UPDATE ... SET status='Aprovado' WHERE id=$1 AND status='Pendente' RETURNING *` e só cria os movimentos se esse update afetou 1 linha, na mesma transação.
  2. No front, travar as transições: `Aprovado` não volta para `Pendente`/`Negado` (ou, se voltar, cancelar os movimentos vinculados; hoje não existe vínculo, ver M3).
  3. Guardar `approved_movement_id` no pedido.

#### C2. Virada com contagem corrigida: falha no meio + tentar de novo repete os ajustes
- `src/pages/Stock.tsx:390-455` (loop em `410-440`, `catch` em `449-451`).
- **O que acontece [confirmado]:** no ramo "contagem diferente", cada produto faz `createStockMovement` (ajuste) e depois `transferStock`, um por vez, sem transação. Se o produto 5 falha, os produtos 1 a 4 já foram ajustados e transferidos. O `catch` só mostra a mensagem: **não chama `load()`**, então `balances` e `eventLeftovers` continuam com os números antigos. Os campos de contagem (`turnCounts`) também continuam preenchidos. Clicar de novo recalcula `diff = b.balance - conferido` com o saldo velho e lança o ajuste outra vez nos produtos 1 a 4. Em seguida tenta transferir `conferido` de novo.
- Pior: o ajuste é gravado **antes** da transferência de cada produto. Se a transferência falha, fica um ajuste sem transferência.
- **Exemplo:** Heineken, sistema 30, contado 28, destino Central. Ajuste (saída) 2 gravado, saldo do evento vai a 28. A transferência de 28 falha (queda de rede). Na nova tentativa a tela ainda mostra "sistema 30", lança outro Ajuste (saída) de 2 (saldo 26) e transfere 28, mas só há 26 → o evento fica em −2, ou o banco recusa [hipótese: depende de `transfer_stock` bloquear saldo negativo].
- **Correção proposta:**
  1. Mover o ramo editado para uma RPC `transfer_event_leftover_counted(p_from_event, p_dest, p_counts jsonb)` que faz ajuste e par espelhado em uma transação só (hoje só o ramo "sem edição" é atômico).
  2. Enquanto isso não existir: no `catch`, chamar `await load()` e limpar `turnCounts` dos itens já processados, e gravar o ajuste só depois da transferência bem-sucedida ou dentro da mesma RPC.
  3. Mostrar na mensagem de erro quais produtos já foram processados.

#### C3. "A conta do evento" subtrai a venda do PDV duas vezes
- `src/pages/events/EventStockSection.tsx:102` (soma de `Saída` do almoxarifado do evento em `voltou`) e `:115` (`sobra = entrou − voltou − perdas − consumo − vendido`). Origem da `Saída`: `src/lib/dataService.ts:2619-2656` (`syncStockFromPdv`), chamada automática em `dataService.ts:2550` (import de vendas) e `2607`.
- **O que acontece [confirmado no código]:** cada import oficial do PDV vira uma `Saída` no almoxarifado do evento (nota `PDV_BAIXA_NOTA`). O cartão trata toda `Saída` em `in_event_location` como "voltou ao depósito". Ao mesmo tempo, `vendido` vem de `event_products.sold_quantity`, que o `syncSoldQuantitiesFromPdv` preenche com a mesma venda. A mesma venda entra em `voltou` e em `vendido`.
- **Exemplo:** entrou 100 Heineken, PDV vendeu 80. Baixa automática: `Saída` 80. Conta: voltou 80, vendido 80, sobra = 100 − 80 − 80 = **−60** (aparece em vermelho com alerta). O saldo real do estoque do evento é 20. A virada (que usa `stock_balances`) mostra 20, e a aba "A conta" mostra −60: duas "sobras" diferentes para o mesmo evento, justamente na tela que a produção usa para conferir.
- Também afeta `Ajuste (saída)` da própria conferência da virada: é contado como "devolvido ao depósito" (`:102`), quando é diferença de contagem (perda).
- **Correção proposta:** o cartão deve usar o saldo do almoxarifado do evento como fonte única (`stock_balances` do local do evento), ou então excluir de `voltou` as `Saída` com `notes === PDV_BAIXA_NOTA` e tratar `Ajuste (saída)` como perda/ajuste, não como devolução. Mostrar a linha "Diferença de contagem" separada.

---

### ALTO

#### A1. Devolução sem teto e sem controle do acumulado
- `src/lib/dataService.ts:3108-3138` (`registerTransferReturn`); UI em `Stock.tsx:1422-1439` e `TransferRequestsTab.tsx:176-198`.
- **O que acontece [confirmado]:** só valida `returnedQuantity > 0`. Não compara com `request.quantity` (enviado) nem com o saldo do evento. `returned_quantity` é **sobrescrito** pelo valor digitado (`3136`), não somado. O input aceita `step="0.01"` e qualquer valor (o `min={0}` é só da UI). Depois de registrar, a UI troca o campo por "Devolvido: N" e não deixa devolver mais nada (devolução parcial em dois momentos é impossível).
- **Exemplo:** pedido de 50 caixas de água. Digitam 500 por engano: entram +500 no Central (movimento `Devolução do Evento`, tipo positivo, ver `dataService.ts:1352`). O pedido mostra "Devolvido: 500" e o botão some. Não dá para corrigir pela tela; só cancelando o movimento na aba Movimentações, e o pedido continua "Devolvido: 500".
- **Correção proposta:** validar `0 < qtd ≤ enviado − já devolvido` (e, de preferência, `≤ saldo atual do estoque do evento`) no front e na RPC; trocar `returned_quantity` por soma de devoluções (ou guardar uma linha por devolução vinculada ao pedido); permitir mais de uma devolução parcial.

#### A2. Devolução por pedido e Virada de evento são dois caminhos para a mesma coisa, sem se enxergarem
- `dataService.ts:3108` (devolução) × `Stock.tsx:390` e `dataService.ts:3172` (virada).
- **O que acontece:**
  - A devolução grava `Devolução do Evento` (+ no estoque de origem) com `event_id`. A tela do histórico dá a entender que isso tem um espelho (`Stock.tsx:1036`: "Devolução do Evento é ENTRADA... o fluxo veio do espelho pra cá"). **[hipótese]** que um trigger do banco cria a saída correspondente no almoxarifado do evento; esse trigger não está no repositório.
  - A virada usa `Saída`+`Entrada` por `transfer_stock` e ignora quais pedidos já tiveram devolução. Nenhuma das duas atualiza o outro lado: `returned_quantity` do pedido não muda na virada, e a virada não pergunta se já houve devolução.
- **Exemplo [dependente da hipótese acima]:** enviados 100, devolvidos 30 pelo pedido (saldo do evento 70). A virada vai pegar 70, o que está certo. Mas se o trigger de espelho **não** existir para esse caso, o saldo do evento continua 100, a virada leva 100 para o Central e o Central ganha 130 de um lote de 100. Confirmar no banco.
- No caso de pedido **entre estoques** (A → B, onde B não é evento), `registerTransferReturn` devolve para `from_location_id` com tipo `Devolução do Evento`, mas B não perde nada, a menos que o trigger cubra isso **[hipótese, provável que não]** (o comentário em `dataService.ts:3051-3054` fala em trigger só para envios para evento).
- **Correção proposta:** um caminho só. A devolução por pedido vira "Devolver sobra deste pedido" e usa a mesma RPC `transfer_stock` (B → A) com `p_notes` apontando para o pedido; a virada passa a mostrar, por produto, o "já devolvido por pedido" e o pedido ganha status "Encerrado" quando a virada leva o restante.

#### A3. Pedido sem estoque de origem: erro silencioso
- Campo opcional em `Stock.tsx:1356-1368` e `TransferRequestsTab.tsx:122-127` (sem `required`); `dataService.ts:3062-3064` lança erro; `Stock.tsx:225` e `TransferRequestsTab.tsx:71` **sem `try/catch`**.
- **O que acontece [confirmado]:** quem pede (`from_location_id` vazio) cria um pedido que ninguém consegue aprovar. Ao escolher "Aprovado", a função lança `Esse pedido não tem estoque de origem definido...` dentro de um `onChange`; vira *unhandled rejection*, nenhuma mensagem aparece e o seletor volta para o valor antigo.
- **Correção proposta:** tornar a origem obrigatória no formulário (ou deixar o aprovador escolher a origem no momento de aprovar), e envolver todos os handlers de transferência em `try/catch` com mensagem na tela.

#### A4. Handlers de transferência/devolução sem `try/catch`: botão travado em "Salvando..."
- `Stock.tsx:205-220` (`handleAddTransfer`), `Stock.tsx:235-243` (`handleRegisterReturn`), `TransferRequestsTab.tsx:52-65` e `81-89`.
- **O que acontece [confirmado]:** `setSavingTransfer(true)` / `setSavingReturnId(t.id)` é desligado depois do `await`, mas não em `finally`. Se o `await` lançar, o estado fica preso: o botão "Enviar solicitação" fica `disabled` em "Salvando..." até recarregar a página, sem erro visível. Na devolução, o mesmo (`savingReturnId` preso).
- **Fica pela metade [confirmado]:** em `registerTransferReturn` o movimento é gravado (`3127`) e só depois o `returned_quantity` (`3135`). Se o segundo falhar, o estoque já recebeu a devolução e o pedido continua sem "Devolvido" → o usuário digita de novo → devolução em dobro.
- **Correção proposta:** `try/catch/finally` com mensagem; e juntar os dois passos de devolução numa RPC atômica.

#### A5. Saldo negativo na origem não é barrado em transferência, devolução, virada e reserva
- Chat: transferência não avisa (a saída tem aviso em `StockChat.tsx:180-185`; a transferência em `134-153` não tem nenhum). Pedido aprovado: `dataService.ts:3061` não olha saldo. Virada editada: `Stock.tsx:432-440` usa o saldo carregado na abertura da tela (`b.balance`), que pode estar velho (vendas do PDV entram a qualquer hora via `syncStockFromPdv`).
- **O que acontece:** nenhum desses caminhos consulta o saldo atual. Se o `transfer_stock` do banco não recusar saldo negativo **[hipótese; o SQL não está no repo]**, a origem fica negativa e "o dinheiro do estoque" some.
- **Exemplo:** Central com 10 Red Bull. Chat: "transfere 20 red bull pra samba". Prévia sem aviso, confirma: Central −10, Samba +20 (criou 10 do nada).
- **Correção proposta:** `transfer_stock` deve recusar quando `saldo_origem < qtd` (com opção explícita "permitir negativo" só para quem for admin), e o front deve mostrar o aviso que o chat já mostra para saída.

---

### MÉDIO

#### M1. Chat: "Nada foi alterado" depois de ter gravado
- `src/components/stock/StockChat.tsx:241-266`.
- **[Confirmado]** `getStockBalances()` (`:260`) está dentro do mesmo `try` que a gravação. Se a gravação der certo e a releitura de saldos falhar, o `catch` escreve "❌ Não deu... Nada foi alterado.". A mensagem de sucesso (`251`/`257`) já tinha sido exibida e o cartão já foi fechado (`setAcao(null)`, `259`). Resultado: duas mensagens contraditórias no chat e a pessoa tende a repetir o comando.
- Também não há `if (busy) return` no início de `confirmarAcao` (só `disabled` do botão).
- **Correção:** separar a releitura num `try` próprio; deixar a mensagem de erro dizer "gravou, mas não consegui atualizar o saldo".

#### M2. Chat interpreta números e unidades errado
- `StockChat.tsx:112-114` e `146-147`, `161-162`, `178-179`.
- **[Confirmado]**
  - Regex `(\d+(?:[.,]\d+)?)` pega o **primeiro** número. "entrada de 1.000 latas de heineken" → 1,000 → `Number("1.000".replace(',', '.'))` = **1**. "1,5" funciona, mas "1.000" (milhar BR) vira 1.
  - Produto com número no nome (ex. "Heineken 600", "Red Bull 250") ou local com número: "transfere heineken 600 20 pra samba" → quantidade 600.
  - "10 caixas" para um produto sem `units_per_pack` > 1 vira **10 unidades** (`upp = 1` em `146`, `161`, `178`) e o `detalhe` só aparece se `upp > 1`. A prévia mostra "10 un" e ninguém é avisado de que "caixa" foi ignorada. Na transferência (`148-151`) a prévia nunca mostra o cálculo de fardo.
  - "repor 20 heineken" cai na regra de "o que tá acabando" (`/(...|repor|...)/` em `:123`) antes da regra de entrada: devolve uma lista de baixo estoque em vez de lançar.
- **Correção:** converter milhar BR antes de parsear (`1.000` com 3 dígitos após ponto = milhar), tirar o número do nome do produto/local antes de procurar a quantidade, e avisar "esse produto não tem fardo cadastrado, usei 10 unidades" na prévia (nas 3 ações).

#### M3. Pares de transferência perdem vínculo com o pedido e com o evento
- `dataService.ts:3086-3091` (`transfer_stock` sem `event_id`) × `3093-3099` (`Envio para Evento` com `event_id`).
- **[Confirmado]** quando o pedido é entre estoques, o par gerado pela RPC não leva `event_id` nem o id do pedido; só vai o texto `Transferência aprovada (#xxxxxxxx)` em `notes` (`3067`). Quando o destino é "o evento", sai um movimento com `event_id`. A mesma intenção ("mandar produto para a festa") gera lançamentos diferentes conforme o campo "Para" (vazio ou preenchido com o estoque do evento). Nos filtros por evento, o `listEventStockMovementsWide` (`2884-2895`) acaba cobrindo o segundo caso só por `in_event_location`; o par fora do almoxarifado do evento não aparece na conta do evento.
- O vínculo pedido ↔ movimento é só texto em `notes` (8 primeiros caracteres do UUID). Qualquer edição de nota perde a ligação.
- **Correção:** coluna `transfer_request_id` nos movimentos (ou no par) e `event_id` aceito pela RPC.

#### M4. Virada: itens com saldo negativo ou zero ficam de fora, e números velhos
- `Stock.tsx:371-379` (`balance > 0`), `390-455`.
- **[Confirmado]** só entram produtos com saldo positivo. Produto negativo no evento (vendeu mais que entrou, ou a venda do PDV chegou depois da virada) nunca é listado nem "zerado". A pessoa não pode digitar "achei 3 que o sistema diz que são 0". A contagem digitada que não é número válido ou é negativa cai **silenciosamente** para o saldo do sistema (`383-388`): digitar `abc` ou `-2` não gera erro e a tela destaca o campo como "diferente" (`1262-1265` usa `Number(...) !== b.balance`, que dá `NaN !== x` verdadeiro) enquanto a conta usa o saldo do sistema.
- O número do sistema vem de `balances` carregado na abertura. Se o PDV lança uma baixa enquanto a pessoa conta, o `diff` e a transferência usam o saldo antigo.
- **Correção:** listar também saldo ≤ 0 (com opção "achei sobra"), validar o campo (borda vermelha e botão bloqueado), e buscar os saldos de novo no momento de confirmar.

#### M5. Virada: ramo rápido e ramo editado se comportam diferente
- `Stock.tsx:397-408` × `409-445`.
- **[Confirmado]** sem edição, usa a RPC atômica. Com UMA edição, o código inteiro muda para o loop manual e perde atomicidade, nota da virada padrão e o `event_id` nos movimentos de transferência (o `transferStock` não recebe `event_id`). A nota da transferência também difere (`Virada: X` × `Virada: X (sobra conferida)`).
- **Correção:** a RPC aceitar contagem por produto (ver C2), para existir um caminho só.

#### M6. Inventário físico: ajuste calculado com saldo da abertura da tela
- `InventoryCount.tsx:28-30`, `51-75`.
- **[Confirmado]** `system` vem de `balances` (prop), `diff = contado − sistema`. Se entrou uma venda/transferência depois de abrir a tela, o ajuste corrige para o número antigo e o saldo final não bate com o contado.
- O ajuste é gravado por produto em loop, sem tag de lote. A tela avisa "Parou no meio... confira antes de repetir" mas depois do erro os campos `counts` continuam preenchidos (só `setCounts({})` no sucesso). Repetir recalcula sobre `balances` atualizado por `onDone()`; nesse caso é seguro, porque o `diff` é recalculado. Só o texto "confira antes de repetir" é desnecessariamente assustador. Duplo clique: `saving` bloqueia após render (React 18 processa o clique de forma síncrona; risco baixo).
- Sem trava de "evento em andamento": inventário em estoque de evento ativo concorre com baixa do PDV.
- **Correção:** ler saldos frescos no clique de confirmar (ou uma RPC `apply_inventory(location, counts jsonb)` que ajusta contra o saldo no momento e em transação única).

#### M7. Reservas: atender não é atômico e não impede dupla atendimento
- `ReservationsSection.tsx:61-74`.
- **[Confirmado]** grava `Envio para Evento` e depois muda o status da reserva. O comentário diz "se a segunda falhar... dá pra atender de novo sem duplicar porque o erro aparece na tela" — mas atender de novo **duplica** o envio, porque a primeira escrita já gravou. Não há trava no `UPDATE` (`updateStockReservationStatus` sem `.eq('status','Reservado')`, `dataService.ts:1690-1694`), então duas pessoas atendendo ao mesmo tempo geram dois envios.
- A reserva também não checa saldo: o texto avisa "vai registrar mesmo assim" quando promete mais que o disponível (`:121-124`). O atendimento (`createStockMovement` de `Envio para Evento`) tampouco verifica saldo.
- **Exemplo:** reserva de 24 latas. Atender grava Envio 24; `UPDATE` falha; clicar de novo grava Envio 24 outra vez → 48 enviados para uma reserva de 24.
- **Correção:** RPC `fulfill_reservation(id)` que faz `UPDATE ... WHERE status='Reservado' RETURNING` e cria o envio na mesma transação.

---

### BAIXO

- **B1. Quantidade 0 ou vazia em pedido de transferência.** `Stock.tsx:1347` e `TransferRequestsTab.tsx:117` usam `min={0}` e `Number(e.target.value)` (vazio vira 0). O formulário envia pedido com quantidade 0 (`:1390`, sem validação). Se aprovado, gera movimentação de 0 ou erro do banco [hipótese: constraint]. Usar `min=1`/`required` e validar no handler.
- **B2. Chat: `acharLocal` casa "casa", "sede", "central" por substring** (`StockChat.tsx:91`, regex sem `\b`). "Casa de Shows", "casamento", "sedento" caem silenciosamente no estoque central. O casamento de produto/local por substring (`f.includes(w)` em `80` e `97`) faz "bar" casar com "barril" e "gin" com "ginger".
- **B3. Chat: saldo carregado só uma vez.** `carregar()` roda no mount (`:58-65`) e só é atualizado depois de gravar pelo próprio chat. Outro usuário ou o PDV movimentando deixa o aviso "vai ficar negativo" e as respostas de saldo desatualizados.
- **B4. Chat: `Entrada` vira `Compra` sem preço** (`:164`, `unit_cost: null` em `:248`). Em `StockMovementForm.tsx:166-172` a Compra sem preço é barrada ("sem preço o estoque não vale dinheiro"); no chat essa trava não existe. A compra feita pelo chat entra sem custo e não gera despesa. Também serve para dar entrada em estoque de evento sem ser compra.
- **B5. Duplicação de código.** `Stock.tsx:205-243` e `TransferRequestsTab.tsx:52-89` são a mesma lógica copiada; qualquer correção dos achados C1/A1/A3/A4 precisa ser feita nos dois lugares.
- **B6. Reativar movimento cancelado** (`Stock.tsx:527`) pode deixar a origem negativa; não faz checagem [fora do escopo principal, anotado].
- **B7. Ajuste da conferência da virada é `Ajuste (saída)`, não `Perda`.** Fica no histórico com os dois números na nota (bom), mas relatórios por tipo (perdas × ajustes) não separam falta por quebra de falta por erro de contagem.

---

## 3. Até 5 melhorias para simplificar o uso

1. **Um só botão "Devolver sobra" por evento**, no lugar de "Registrar devolução" por pedido + "Virada" separados. Ele mostra por produto: enviado, vendido (PDV), contado, e o destino sugerido (Privilege). Encerra os pedidos automaticamente.
2. **Aprovar pedido com 1 clique e uma tela de confirmação** ("Vai sair 40 Red Bull do Central, que tem 25. Aprovar mesmo assim?"). Tira o seletor de status que hoje permite ir e voltar.
3. **Virada com contagem num único passo atômico**, com resumo antes de confirmar: "N produtos, X unidades, Y ajustes (perdas) e Z que o sistema tem como zero mas você achou".
4. **Chat com prévia mais explícita**: mostrar "10 caixas × 24 = 240 un" (ou "sem fardo cadastrado, usando 10 un") também na transferência, e acrescentar um botão "Desfazer" por 1 minuto depois de gravar.
5. **Inventário por área/prateleira**: salvar a contagem como rascunho no navegador e confirmar depois de ler o saldo fresco, em vez de ajustar contra o saldo da hora de abrir.

---

## 4. O que não deu para confirmar (hipóteses a checar no banco)

- `transfer_stock` e `transfer_event_leftover` recusam saldo insuficiente? (A5, C2)
- Existe trigger que espelha `Envio para Evento`/`Devolução do Evento` no almoxarifado do evento, e ele cobre a devolução de pedido entre estoques (não-evento)? (A2)
- `transfer_event_leftover` é realmente atômica e olha o saldo no momento da execução? (O comentário em `dataService.ts:3165-3171` diz que sim.)
- Há constraint `quantity > 0` em `stock_movements` e `transfer_requests`? (B1)
- RLS impede dois aprovadores de aprovar o mesmo pedido? (C1: não há nada no front que impeça.)

Sugestão: exportar do Supabase as funções/triggers (`pg_dump --schema-only`) para `supabase/` e rodar esta revisão de novo sobre elas.

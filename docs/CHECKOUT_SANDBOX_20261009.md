# Inscrição e pagamento em sandbox — 09/10/2026

## Âmbito e acesso

Percurso executável reservado à conta administradora verificada `circ.chuc@gmail.com`:
**seleção → preço calculado no servidor → pedido Eupago sandbox → notificação assinada → inscrição de teste no My CIRC → complementos**.

Página `/conta/inscricoes-teste`; atalho `/admin/inscricoes-teste`. Disponível nos módulos de administração e na área de gestão do My CIRC. A consola técnica de 1 € mantém-se em `/admin/pagamentos-teste`, sem migração das tentativas existentes.

Não é o checkout público nem confirma inscrições reais. Não ocupa vagas reais, não resgata vouchers, não dá acesso ao congresso/streaming, não gera certificados, não envia emails e não emite documentos no TOConline. O valor do pedido usa as tarifas do catálogo: **não é limitado ao teste técnico de 1 €**. Nunca pagar referências da sandbox no banco ou na aplicação MB WAY real.

## Teste técnico MB WAY já confirmado

O percurso técnico de 1 € ficou confirmado pelo suporte (HTTP 200 após reenvio) e pelo organizador no CIRC, com notificação recebida/validada em 09/10/2026 às 17:50:55. A correção da entidade MB WAY está preservada. As verificações externas abaixo referem-se ao novo percurso de inscrição e complementos, não à repetição desse teste concluído.

## Dados e transações

Cada ensaio fica num documento separado `settings/circ-checkout-sandbox-{uid}-{uuid}`, com `kind=checkout-test`, `environment=sandbox` e `eventId=circ-2027`. Inclui o histórico de pedidos, recibos de notificações e os direitos da inscrição de teste. Não há escritas em `registrations`, `registrationOrders`, vagas, vouchers, perfis ou faturação. As regras existentes de `settings` restringem a leitura/escrita ao administrador; a API volta a verificar a identidade e exige origem igual à do servidor nas escritas.

A criação da sessão utiliza a sessão Firebase do administrador, não novas permissões IAM de criação. As notificações usam a identidade de serviço já existente, apenas para ler/atualizar documentos de teste existentes. Histórico usa o índice do nome do documento, limitado a 100 resultados por consulta; os restantes não são apagados. Endereços com `?teste={uuid}` permitem recuperar um ensaio. O navegador só guarda identificadores, nunca o telefone ou credenciais.

O orçamento é calculado por `quote.mjs` a partir de `registration2027.js`. O navegador não envia montantes nem aprova elegibilidade. ULS exige elegibilidade, associação MEC e lista ativa; estudante exige aprovação e correspondência com o nome atual do perfil. Estes dados são lidos no servidor. No momento de reservar um pedido com tarifa condicionada, são relidos numa transação Firestore `batchGet/newTransaction` e o `commit` escreve apenas o documento sandbox; uma alteração de elegibilidade interrompe a criação.

O número de pedidos é limitado a 20 por ensaio e os jantares a 20 acumulados, como limites de segurança dos testes, não como capacidade do evento. Só pode existir um pedido em curso por ensaio. Antes da chamada de criação à Eupago, o pedido é persistido com precondição de versão. Mesmo perante concorrência, o mesmo UUID não cria duas referências. Não há repetição automática de criação em caso de timeout.

## Notificação e recuperação

Mantém-se **o mesmo URL de webhook 2.0, canal e secrets** da consola técnica. Os pedidos deste ensaio têm identificador `circ_order_{uuid_sem_hifens}_{sequência}`; os testes antigos mantêm `circ_test_…` e a exigência de 100 cêntimos. O parser só aceita o novo formato quando o handler de checkout está explicitamente ligado.

A assinatura HMAC sobre os bytes originais é validada antes de consultar a base de dados. Canal, proprietário, referência, identificador completo, método, montante, moeda, transação e dados guardados têm de corresponder. A referência é consultada na API autenticada da sandbox. A entidade MB WAY omitida na criação é reconciliada por essa consulta, sem constantes do canal nem remoção da verificação.

Recibo, pagamento e direitos da inscrição de teste são guardados numa única escrita com precondição de versão. HTTP 200 só após persistência ou perante repetição já validada. Notificações simultâneas e reenvios não duplicam cursos ou jantares. Uma consulta manual apenas atualiza a informação devolvida pela Eupago; não confirma a inscrição.

A página lê o registo interno a cada 5 segundos enquanto aguarda confirmação; este polling não consulta a Eupago nem cria pagamentos. Falhas de leitura param a atualização e mostram um aviso. A notificação é processada pelo servidor independentemente de o navegador estar aberto.

Respostas de criação incertas preservam o pedido e o diagnóstico seguro. Uma referência encontrada no backoffice pode ser recuperada sem gerar outra, após validação autenticada do identificador. Um callback pode ultrapassar a resposta de criação e completar o pedido sem ser apagado por essa resposta tardia. Estados expirado/cancelado/erro só encerram pedidos por informação da API. Pagamentos tardios que colidam com direitos já concedidos ficam pagos mas `review_required`, sem duplicar os direitos e bloqueando novos complementos nesse ensaio.

## Complementos e vouchers

Após confirmação, podem ser adicionados cursos ainda não incluídos e mais jantares. O pagamento de um complemento confirma apenas os itens desse pedido, uma única vez. As verificações de elegibilidade continuam a aplicar-se.

Existe uma opção de copiar, apenas para este ensaio, a inscrição real confirmada/paga da própria conta administradora. Inclui inscrições pagas por voucher de empresa. O ID é obtido do caminho autenticado do documento; não é necessário que o documento guarde um campo `id`. Cópias de inscrições de teste, não pagas ou de outros utilizadores são rejeitadas. A inscrição original e o voucher permanecem inalterados. Não existe criação de um voucher fictício nem acesso às inscrições de outras contas.

## Verificações executadas

- Testes de servidor: **145 casos, 144 aprovados, 1 ignorado por configuração preexistente do teste de cookie Media Center, 0 falhas**. Incluem 38 casos do checkout e 13 do adaptador Firestore, além das regressões existentes, incluindo MB WAY e Multibanco.
- Frontend: **31 suites e 131 testes aprovados**. Incluem 9 casos da nova página e os 5 da consola técnica existente.
- Compilação integral React: executada localmente; a CI também verifica a compilação antes da publicação.

Todos os testes de pagamentos usam transporte e armazenamento simulados e chaves de teste. Não foram criados pedidos reais na conta Eupago para validar este novo percurso. Não há credenciais de produção nas execuções de CI. A CI não faz deploy de regras Firebase nem altera secrets.

## Ensaio externo a executar pela organização

1. Entrar na conta administradora e abrir My CIRC → Inscrição e pagamento — teste.
2. Criar nova inscrição de teste. Selecionar, por exemplo, Externo, presencial, curso da manhã e um jantar; rever o preço calculado no servidor. Confirmar o aviso de sandbox e criar **uma única vez** o pedido MB WAY ou Multibanco.
3. Na sandbox Eupago, localizar a referência e o identificador completos `circ_order_…` e simular o pagamento dessa operação. Não usar a app MB WAY real.
4. Sem consultar manualmente o estado, observar a notificação validada e a inscrição de teste confirmada. Recarregar a página e confirmar persistência.
5. Comprar um complemento, por exemplo o curso da tarde, e simular esse pagamento. Confirmar que o congresso e os itens anteriores não são cobrados/atribuídos novamente.
6. Repetir para o outro meio de pagamento e testar reenvio da mesma notificação e confirmação com navegador fechado. Os registos reais devem permanecer inalterados.

Esses ensaios ainda precisam de confirmação na conta real da organização. Erros devem ser investigados com o identificador do pedido e o código de diagnóstico, sem publicar tokens, chaves ou corpos com dados pessoais.

## Fora deste bloco

Checkout aberto a participantes, permissões de pagamentos de produção, reserva/libertação de capacidade real, expiração/reembolsos automáticos, integração contabilística TOConline e emissão de documentos. TOConline depende de credenciais, série, produtos, enquadramento fiscal e contexto de testes validados. A conclusão deste ensaio não autoriza a abertura dos pagamentos reais.

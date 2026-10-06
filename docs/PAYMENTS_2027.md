# Pagamentos CIRC 2027 — estado em 06/10/2026

Eupago é o prestador escolhido; TOConline será usado para faturação. O organizador confirmou acesso à sandbox e indicou ter guardado `EUPAGO_SANDBOX_API_KEY` como Secret no Worker Cloudflare `circ`. A presença da chave só fica comprovada na resposta autenticada de `/api/payments/sandbox/config`; a sua validade depende de uma chamada real de teste.

## Disponível nesta etapa: consola de testes da organização

Página `/admin/pagamentos-teste`, protegida pela autorização de administração de inscrições existente. APIs do servidor verificam independentemente o token Firebase e exigem `email_verified` e a conta `circ.chuc@gmail.com`, tal como `isAdmin` nas regras Firestore.

- `GET /api/payments/sandbox/config`: indica apenas presença da chave, ambiente sandbox e valor de teste.
- `POST /api/payments/sandbox/attempts`: recebe UUID v4, método (`multibanco`/`mbway`) e telefone de teste MB WAY. O servidor fixa o valor em 100 cêntimos; não recebe preços do navegador.
- `GET /api/payments/sandbox/attempts/{uuid}`: recupera o registo existente.
- `POST /api/payments/sandbox/attempts/{uuid}/inspect`: consulta o estado na Eupago, sem confirmar qualquer inscrição.

O token Firebase do administrador é encaminhado exclusivamente para a API REST Firestore, sujeita às regras existentes. As tentativas ficam em `settings/circ-eupago-sandbox-{uid}-{uuid}`, coleção já reservada ao administrador. Não se escrevem registos em inscrições, pagamentos reais ou faturação. Nenhuma alteração de permissões Firestore é necessária para esta consola.

A tentativa é persistida antes da chamada à Eupago, com precondição de inexistência. Atualizações usam precondição `updateTime`. Uma repetição com o mesmo UUID devolve o registo existente; seleção diferente é rejeitada. Pedidos simultâneos com o mesmo UUID não criam duas referências. A página retém o UUID na sessão do navegador e recupera-o ao recarregar. Preparar outro teste gera deliberadamente outro UUID.

O host do adaptador é fixo `sandbox.eupago.pt`; não existe caminho para produção. Não há retries automáticos de criação. Timeout, erro de transporte ou resposta incerta deixam `creation_unknown` (ou `creating` se nem a atualização puder ser gravada): consultar o backoffice e reconciliar antes de qualquer nova tentativa. O botão de novo teste só é mostrado após referência criada. Respostas brutas do prestador, tokens e chaves não são devolvidos nem registados em logs. O telefone MB WAY não é persistido; apenas um fingerprint da seleção evita reutilização do UUID com dados diferentes.

## Como validar com a conta

1. Entrar no site com a conta administradora e abrir `/admin/pagamentos-teste`.
2. Confirmar que a página não indica falta da chave.
3. Criar um teste Multibanco de 1 €. Verificar entidade/referência no canal sandbox.
4. Recarregar a página e confirmar que recupera a mesma referência; consultar o estado.
5. Usar apenas os mecanismos de simulação disponibilizados pela Eupago. Não pagar referências de sandbox no banco/app real.
6. Testar MB WAY com números indicados pela Eupago. A documentação indica `987654321` para uma referência em erro e `999999999` para alias inexistente.

Esta consola testa criação e consulta. Não substitui um teste completo de inscrição, callback e confirmação automática. O estado devolvido pela consulta permanece uma pista de reconciliação: a documentação de `multibanco/info` não inclui prova completa de montante/moeda/transação liquidados.

## Preparado, mas ainda desligado do checkout público

- `quote.mjs`: cálculo no servidor a partir do catálogo atual, validações ULS/estudante e complementos (incluindo titulares de voucher). Os registos de elegibilidade têm de ser lidos no servidor e revalidados na transação final.
- `eupago-notification.mjs`: validação pura de callback 1.0 contra tentativa persistida (chave/canal/referência/identificador/montante/método/entidade). Não está exposta como rota e não concede direitos.

Não ativar ainda a notificação URL no backoffice. O URL definitivo só será fornecido após implementação da rota autenticada e persistência/reconciliação sem sessão humana. Callback 1.0 inclui chave na query: avaliar webhook 2.0 e configurar observabilidade sem URLs com segredos antes de o publicar.

## Falta para inscrições e faturação automáticas

1. Autorizar o backend a ler/escrever os registos necessários sem depender da sessão de administrador: identidade de serviço com permissões limitadas e credenciais no servidor.
2. Definir consulta autenticada de transações Eupago para verificar montante, moeda, canal e transação; confirmar credenciais necessárias e resposta real da sandbox.
3. Implementar checkout autenticado, orçamento com dados de servidor, reservas de vagas, bloqueios transacionais e idempotência por compra (não apenas por tentativa técnica).
4. Confirmar pagamento numa transação, aplicar direitos exatamente uma vez, tratar repetições/eventos fora de ordem/pagamentos tardios e criar tarefa durável de faturação.
5. Ligar My CIRC, compras posteriores de cursos/jantar, estados de falha/expiração e trilho de auditoria.
6. TOConline: acesso API, autorização OAuth, série, produtos/serviços, taxas de IVA ou motivos de isenção, conta de recebimento e contexto de testes validados com contabilidade. A criação de documentos pela API pode finalizá-los: não testar documentos fictícios em produção.
7. Testar circuito completo antes da abertura pública prevista para 15/11/2026. Uma falha na faturação não pode apagar um pagamento confirmado; emissões incertas exigem reconciliação antes de repetir.

## Validação local

- `node --test server/test/*.test.mjs`: inclui 8 testes de orçamento, 8 de transporte/notificação e 8 de API/persistência, além das proteções existentes do servidor.
- `CI=true npm test -- --watchAll=false --runInBand src/pages/AdminSandboxPaymentsPage.test.js`: criação explícita e recuperação sem nova cobrança.
- `npm run build`.

Os testes de prestador usam respostas simuladas e não comprovam acesso real à conta. O primeiro pedido sandbox deve ser feito pelo organizador na página autenticada. Nunca colocar segredos em REACT_APP, repositório, capturas, anexos ou mensagens.

## Documentação oficial

- https://docs.eupago.pt/reference/multibanco
- https://docs.eupago.pt/reference/mb-way
- https://docs.eupago.pt/reference/reference-information
- https://docs.eupago.pt/reference/webhooks
- https://firebase.google.com/docs/firestore/use-rest-api
- https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/patch
- https://api-docs.toconline.pt/setup-do-postman
- https://api-docs.toconline.pt/apis/vendas/documentos-de-venda

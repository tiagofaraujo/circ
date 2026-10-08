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
- `eupago-notification.mjs`: validação pura do formato antigo 1.0, sem rota pública. A nova rota sandbox usa exclusivamente webhook 2.0 assinado, descrito abaixo.

Não configurar callback 1.0 nesta rota: inclui uma chave na query e não é aceite. A configuração do webhook 2.0 abaixo continua dependente das credenciais de servidor e da validação real do formato entregue pela sandbox.

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


## Webhook 2.0 de sandbox — implementação de 07/10/2026

A criação de uma referência Multibanco e a mudança manual Pendente → Pago foram observadas no site e na sandbox em 07/10/2026. Isto não testa a notificação automática. A nova rota abaixo tem testes locais com assinaturas e respostas simuladas; o teste real depende da configuração externa.

`POST /api/payments/sandbox/notifications/{ownerBase64url}` é tratada antes da autenticação de sessão. A consola administrativa apresenta o URL específico da conta autenticada. O sufixo identifica o proprietário do teste, não é segredo nem substitui a assinatura. O webhook funciona sem navegador aberto.

Contrato atualmente implementado:

- HTTPS, POST JSON sem encriptação (`encrypt=false`), apenas evento PAID.
- `X-Signature`: base64 de HMAC-SHA256 sobre os bytes exatos do corpo, com a chave de assinatura do canal. A verificação ocorre antes de qualquer acesso ao Firebase/Eupago. Não aceitar ausência de assinatura, digest hexadecimal ou callback 1.0 como alternativa.
- Corpo limitado a 16 KiB; objeto `transactions` da documentação (ou objeto singular `transaction`, exclusivamente um deles); listas e mensagens encriptadas são rejeitadas.
- `channel.name` corresponde exatamente ao canal configurado. `identifier` tem o formato `circ_test_{uuid_sem_hifens}`. Métodos `PC:PT`/`MW:PT` normalizados para Multibanco/MB WAY, mantendo os rótulos anteriores `Multibanco`/`Mbway`; `reference`, `entity`, `trid`; estado `Paid`; `amount.value=1` (incluindo `"1.00000"`) e `amount.currency=EUR`. Datas com segundos, com UTC explícito ou sem fuso, são validadas também quanto ao calendário.
- Em 08/10/2026, o suporte da Eupago forneceu o JSON da entrega anteriormente rejeitada com 422: objeto singular `transaction`, método `PC:PT`, montante textual `"1.00000"` e data `2026-10-07T14:58:25` sem fuso. O parser anterior rejeitava o método e a data. A correção aceita explicitamente esses formatos, mantendo as restantes validações. A data sem fuso é conservada tal como recebida em `paidAt`; não se assume UTC nem Europe/Lisbon. `receivedAt` e `verifiedAt` continuam a ser instantes UTC do servidor. O digest inclui a data preservada; alterações nessa data continuam sujeitas à deteção de conflito.
- Os testes de regressão usam a estrutura do suporte com identificadores fictícios e uma assinatura de teste. Campos `fees`, `local` e `channel.account` não autorizam confirmação e não são usados para contabilização. Esta validação local não comprova uma nova entrega real assinada; é necessário reenvio pela Eupago ou novo teste sandbox após a publicação.
- Confere todos os dados com a tentativa já persistida, que deve pertencer ao proprietário do URL e ser `kind=gateway-test`, `environment=sandbox` e 100 cêntimos. Nunca cria uma tentativa a partir do callback.
- Persiste um recibo autenticado mínimo (digest, transação, data e hora de receção). Consulta novamente a referência na API da sandbox. Só com pista de estado paga/pago/transferida altera o estado interno para `sandbox_paid`, estritamente no registo técnico de testes.
- O recibo assinado contém o montante/moeda/transação; a consulta de referência é apenas a verificação adicional do estado. Não representa reconciliação contabilística nem prova de liquidação bancária.
- Escritas usam `updateTime` para impedir perdas por concorrência. Notificação igual já validada devolve HTTP 200 sem novas escritas; transação diferente não substitui a anterior. Falhas de armazenamento/prestador e estado ainda pendente devolvem 503, permitindo reenvio. HTTP 200 só após confirmação persistida ou duplicado já concluído.
- Não escreve inscrições, direitos, pagamentos de produção ou faturas. Eventos de reembolso/cancelamento/expiração ainda não estão implementados nesta rota de teste.
- O navegador lê o registo a cada 10 segundos se as configurações estiverem presentes e o teste aguardar notificação; este polling não consulta a Eupago nem cria pagamentos. Para ao validar o teste ou ao ocorrer erro de atualização.

### Configuração externa necessária

No Worker Cloudflare `circ`, acrescentar (nunca em `REACT_APP`, no git ou neste documento):

| Nome | Tipo | Conteúdo |
| --- | --- | --- |
| `FIREBASE_SANDBOX_SERVICE_ACCOUNT` | Secret | JSON da conta de serviço dedicada a este teste, do projeto `circ-coimbra` |
| `EUPAGO_SANDBOX_WEBHOOK_KEY` | Secret | Chave de assinatura correspondente ao canal sandbox, exatamente como configurada na Eupago |
| `EUPAGO_SANDBOX_CHANNEL` | Variável de servidor | Nome completo e exato do canal sandbox |

Mantém-se `EUPAGO_SANDBOX_API_KEY`, já usada na criação/consulta. A chave de assinatura não deve ser presumida igual à chave API.

A conta de serviço deve ter apenas as permissões de leitura e atualização necessárias (`datastore.entities.get`, `datastore.entities.update` numa função IAM dedicada), sem administração de utilizadores, criação ou eliminação de documentos. Tokens OAuth de conta de serviço usam IAM e não as regras de segurança Firestore; estas permissões não se limitam a uma coleção pelo código IAM. O adaptador desta rota restringe os caminhos a documentos existentes `settings/circ-eupago-sandbox-{uid}-{uuid}`. Não atribuir Owner/Editor nem reutilizar uma credencial de administração geral. Para isolamento adicional, a evolução deve usar uma base/projeto dedicado aos pagamentos de teste.

O servidor valida `project_id`, assina um JWT RS256 com scope datastore e troca-o apenas em `https://oauth2.googleapis.com/token`. Ignora `token_uri` do JSON; rejeita redirects e usa timeout. O token fica apenas em memória, com renovação antes de expirar. Credenciais, corpos de callbacks, respostas brutas e URLs com segredos nunca são registados pelo código.

Na Eupago sandbox, editar o canal correto e configurar webhook 2.0 POST JSON, PAID, `encrypt=false`, assinatura e URL copiado da consola. Se o ecrã só mostrar callback 1.0, não o apontar à nova rota; obter a configuração 2.0 com a Eupago. Os indicadores da consola confirmam presença de variáveis, não validade das credenciais, permissões IAM ou configuração externa.

### Teste real após a correção de 08/10/2026

1. Manter a identidade de serviço, o nome do canal e a chave de assinatura configurados no Worker; confirmar a publicação da correção.
2. Manter o webhook 2.0 sandbox com o URL apresentado no site.
3. Solicitar à Eupago o reenvio da notificação anterior ou criar um novo teste Multibanco. Não reconstruir nem assinar manualmente uma notificação para a rota real: o JSON formatado do email não recupera os bytes originais da assinatura. A referência previamente marcada paga não comprova uma entrega posterior à correção.
4. Marcar a nova referência como paga na sandbox. Sem clicar em Consultar estado, observar notificação recebida e estado `Pagamento de teste validado por notificação e consulta à Eupago`.
5. Confirmar persistência depois de recarregar; testar reenvio da mesma notificação e confirmação com o navegador fechado. Inscrições reais devem permanecer inalteradas.

Documentação: https://docs.eupago.pt/reference/realtime-webhooks-20 e https://developers.google.com/identity/protocols/oauth2/service-account .

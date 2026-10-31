# CIRC 2027 — ativação controlada de pagamentos reais e faturação automática

Estado: **ensaio privado temporário autorizado**. O Worker exige `LIVE_CHECKOUT_ENABLED=true` para criar pagamentos reais. A variável `LIVE_PILOT_UNTIL` fecha automaticamente a criação no prazo UTC definido em `wrangler.jsonc`.

Enquanto `LIVE_PILOT_UNTIL` estiver definida, o checkout fica exclusivo da conta de administração, mesmo após a abertura pública. Apenas o cenário de 95 € é aceite; a tarifa continua a ser calculada no servidor, sem substituição do preço. Prazo inválido, vazio ou expirado bloqueia a criação. O diagnóstico apresenta o prazo em hora de Lisboa.

O fecho da criação (por prazo ou `LIVE_CHECKOUT_ENABLED=false`) permite continuar a consultar pedidos próprios e a receber notificações de pagamentos já existentes. O webhook exige sempre HMAC válido, pedido de produção persistido, correspondência dos dados e reconciliação na EuPago antes de confirmar e tentar emitir a FR. Uma notificação não cria uma inscrição nem um pagamento novo.

## Primeira fase suportada

A primeira ativação está deliberadamente limitada a:
- inscrição principal CIRC 2027;
- modalidade presencial;
- sem cursos;
- sem jantar;
- pagamento Multibanco via EuPago;
- Fatura-recibo CIRC2027 no TOConline;
- serviço CIRC27-CONG-P, ID 55;
- ISE / M07, motivo de isenção ID 9.

Outras combinações permanecem bloqueadas até repetirem o mesmo ensaio de aceitação fiscal.

## Configuração privada necessária no Worker

Nunca colocar valores secretos no repositório, em REACT_APP, capturas ou mensagens.

Secrets:
- `FIREBASE_PAYMENTS_SERVICE_ACCOUNT` — conta de serviço dedicada aos pagamentos/faturação.
- `EUPAGO_LIVE_API_KEY` — chave API do canal de produção EuPago.
- `EUPAGO_LIVE_WEBHOOK_KEY` — chave HMAC do webhook 2.0 de produção.

Variável de servidor:
- `EUPAGO_LIVE_CHANNEL` — nome exato do canal EuPago de produção.

Já existentes para TOConline:
- `TOCONLINE_OAUTH_CLIENT_ID`
- `TOCONLINE_OAUTH_CLIENT_SECRET`
- `TOCONLINE_OAUTH_URL`
- `TOCONLINE_API_URL`
- `TOCONLINE_SESSION_KEY`
- `TOCONLINE_REDIRECT_URL`

Webhook EuPago 2.0:
`https://circ-coimbra.org/api/payments/live/notifications`

Configurar apenas evento **PAID**, POST JSON sem encriptação e assinatura HMAC-SHA256 em `X-Signature`.

## Diagnóstico antes da ativação

Em **Recibos — teste**, a secção **Preparação EuPago — produção** consulta
`GET /api/checkout/live/diagnostics`, restrito ao administrador verificado
`circ.chuc@gmail.com`. Funciona com `LIVE_CHECKOUT_ENABLED=false`.

Mostra apenas presença/ausência das configurações, correspondência exata do nome
`CIRC 2027` e o estado do interruptor de pagamentos. Não devolve valores de segredos,
não contacta os fornecedores nem o armazenamento e não cria pagamentos/documentos.
Presença não comprova validade das chaves, aprovação da conta ou entrega de webhooks.
A disponibilidade da sessão TOConline continua na secção de ligação já existente.

### Pré-visualização do ensaio privado

O botão **Pré-visualizar ensaio privado**, na mesma página, usa
`POST /api/checkout/live/pilot-preview`, exclusivo do administrador verificado.
O único parâmetro aceite é o perfil (`external`, `uls` ou `student`). A seleção fica
limitada a presencial, Multibanco, sem cursos/jantar. A tarifa e a elegibilidade
são calculadas pelas regras existentes, com dados lidos do servidor.

Funciona com os pagamentos reais desativados: lê apenas os registos da própria
conta e mostra o valor e os dados de faturação. Não guarda a pré-visualização,
não chama a EuPago/TOConline, não cria referências/inscrições nem emite documentos.
Uma inscrição existente, dados incompletos ou elegibilidade não validada bloqueiam
a preparação.

### Geração e recuperação do pedido privado

Após a pré-visualização existe uma ação explícita **Gerar referência Multibanco real**.
Permanece bloqueada com `LIVE_CHECKOUT_ENABLED=false` ou configurações em falta.
Exige confirmação da aprovação EuPago, conferência do valor/dados e uma confirmação
final que explica a inscrição real e a tentativa de emissão fiscal após pagamento.

O pedido administrativo inclui impressões dos dados de faturação e da tarifa
apresentados. O servidor volta a ler o perfil e recalcula a tarifa; alterações
bloqueiam a criação antes de reservar a inscrição ou contactar a EuPago. A impressão
é independente da ordem dos campos devolvidos pelo Firestore, preservando a
idempotência após uma leitura do pedido.

O navegador guarda apenas o UUID do pedido em `sessionStorage`, por utilizador,
antes de enviar o POST. Uma resposta perdida não permite criar outro pedido pela
interface: **Consultar este pedido** usa apenas GET, inclusive depois de desligar
os pagamentos. Também permite recuperar o pedido sem uma nova pré-visualização,
que poderia estar bloqueada pela inscrição entretanto criada. A leitura mantém
a verificação de proprietário e exige um pagamento de produção.

A ativação temporária deste ensaio e a geração de uma referência de 95 € foram autorizadas pelo administrador. A geração continua a exigir a ação explícita na conta autenticada. O pagamento é realizado pelo próprio utilizador.

## Sequência de ativação

1. Criar a identidade Firebase dedicada e atribuir apenas as permissões Firestore necessárias ao backend de pagamentos.
2. Guardar os três secrets e `EUPAGO_LIVE_CHANNEL` no Worker.
3. Manter `LIVE_CHECKOUT_ENABLED=false`.
4. Entrar com `circ.chuc@gmail.com` em Recibos — teste e renovar uma vez a autorização TOConline. A sessão de backend fica cifrada em Firestore.
5. Confirmar no diagnóstico que a automação no servidor indica sessão segura disponível.
6. Configurar o webhook de produção na EuPago.
7. Após autorização, publicar `LIVE_CHECKOUT_ENABLED=true` com `LIVE_PILOT_UNTIL` em UTC e confirmar o prazo no diagnóstico. Este ensaio não autoriza a abertura pública nem a remoção do limite.
8. Fazer o primeiro pagamento real controlado.
9. Confirmar: pagamento `paid`, inscrição `confirmed`, documento fiscal `issued` e número/ID TOConline guardados.
10. Só depois expandir para cursos, jantar, virtual e MB WAY.

## Proteções implementadas

- Nenhuma criação live quando o interruptor está desligado.
- Registo de pagamento e inscrição reservado antes de contactar a EuPago.
- Idempotência pelo UUID do pedido: repetir o mesmo pedido não cria nova referência.
- Dados de faturação congelados no momento da criação do pagamento.
- Webhook PAID validado por HMAC e reconciliado com a EuPago antes da confirmação.
- Tarifa recalculada pela data efetiva do pagamento.
- Datas sem fuso na fronteira 31/01–01/02 vão para revisão manual.
- Pagamento confirmado é persistido antes da tentativa de faturação.
- TOConline: resultado de POST ambíguo nunca é repetido automaticamente.
- TOConline: HTTP 200/201 só conta como emissão aceite quando a resposta contém o identificador do documento. Respostas vazias, ilegíveis, sem identificador ou HTTP 202 ficam em `outcome_unknown`; exigem conferência no TOConline antes de qualquer nova tentativa.
- Callback duplicado não emite uma segunda Fatura-recibo.
- Estados fiscais distintos: `pending`, `issued`, `pending_authorization`, `review_required`, `outcome_unknown`.

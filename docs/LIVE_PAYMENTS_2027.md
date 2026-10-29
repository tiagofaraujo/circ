# CIRC 2027 — ativação controlada de pagamentos reais e faturação automática

Estado: **desativado por defeito**. O Worker exige `LIVE_CHECKOUT_ENABLED=true` para criar pagamentos reais.

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

## Sequência de ativação

1. Criar a identidade Firebase dedicada e atribuir apenas as permissões Firestore necessárias ao backend de pagamentos.
2. Guardar os três secrets e `EUPAGO_LIVE_CHANNEL` no Worker.
3. Manter `LIVE_CHECKOUT_ENABLED=false`.
4. Entrar com `circ.chuc@gmail.com` em Recibos — teste e renovar uma vez a autorização TOConline. A sessão de backend fica cifrada em Firestore.
5. Confirmar no diagnóstico que a automação no servidor indica sessão segura disponível.
6. Configurar o webhook de produção na EuPago.
7. Alterar `LIVE_CHECKOUT_ENABLED` para `true` apenas numa alteração revista e publicada.
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

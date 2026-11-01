# CIRC 2027 — validação real MB WAY, 1 de novembro de 2026

## Ponto de partida

O ensaio técnico EuPago de 1 € foi confirmado em sandbox em 09/10/2026, incluindo
notificação recebida e validada. Esse resultado mantém-se; não comprovava uma
operação com dinheiro real nem a emissão de uma FR MB WAY no TOConline.
Multibanco, transferência e recibos reais já foram confirmados pelo organizador.

A aplicação bloqueava MB WAY por ter um mapeamento fiscal `null`. A ausência de
um exemplo específico na documentação foi tratada de forma demasiado restritiva.
Não foi encontrada uma rejeição documentada do método pelo prestador.

## Validação controlada

`LIVE_MBWAY_ENABLED=true` e `LIVE_MBWAY_VALIDATION_ONLY=true` disponibilizam MB WAY
apenas à conta administradora verificada, no checkout real habitual. Os restantes
participantes conservam Multibanco e transferência. Só uma configuração explícita
`LIVE_MBWAY_VALIDATION_ONLY=false` pode abrir o método ao público.

O participante revê o montante do catálogo e os dados de faturação, introduz o
seu número português e confirma a criação. A aprovação na aplicação MB WAY é uma
ação do titular do telemóvel. Não se criam pedidos ao abrir a página, nem existem
novos pedidos fictícios de 1 €, inscrições duplicadas ou documentos de demonstração.
Uma inscrição já paga só admite compras adicionais próprias do catálogo.

## Categoria genérica no TOConline

A FR usa `OU` e acrescenta às notas «MB WAY via EuPago», conservando o método
financeiro `mbway`. A AT descreve OU como outros meios não assinalados e a
documentação oficial TOConline de pagamentos enumera OU como «outro».

**A aplicação dessa categoria a MB WAY é uma inferência técnica explicitada.**
Não é um código dedicado MB WAY documentado pelo TOConline, nem comprovação de
aceitação prévia pelo endpoint de vendas. O registo versionado mantém
`status: documented-generic` e `salesApiValidated: false` até existir evidência real.
Preços, IVA, isenções, serviços, série e payloads Multibanco/TR não são alterados.

Se o TOConline rejeitar o pedido, a faturação fica em conferência. Um resultado
incerto nunca é reenviado automaticamente; não se troca silenciosamente OU por
MB, TR ou numerário. O pagamento que foi confirmado pela EuPago permanece pago,
com a inscrição e direitos confirmados, mesmo que o documento fiscal necessite
de intervenção. A aceitação real exige um identificador de documento emitido.

## Estado e nova tentativa

- Assinatura HMAC, referência, identificador, método, valor, moeda e consulta
  autenticada à EuPago continuam obrigatórios para confirmar o pagamento.
- O telefone só é enviado na criação; o pedido guarda uma impressão associada
  ao UUID, sem expor o número no objeto público do pagamento.
- O prazo de quatro minutos corresponde ao endpoint legacy utilizado. É
  informativo: o relógio do navegador não encerra pedidos nem autoriza cobranças.
- Uma consulta explícita ao prestador fecha apenas um pedido comprovadamente
  expirado/cancelado e sem evidência de pagamento ou faturação.
- Uma nova tentativa exige rever novamente valor, faturação, telefone e consentimento.
  O servidor volta a consultar o pedido anterior antes de reservar outro UUID,
  mantendo o histórico e protegendo a substituição por precondições de versão.
- Uma resposta de criação incerta sem referência continua bloqueada. O tempo
  decorrido não comprova que o prestador não criou o pedido.
- Pagamentos tardios de pedidos substituídos ficam para conferência durável,
  preservando o pedido atual e impedindo duplicação de direitos.
- Os novos trabalhos fiscais MB WAY usam claim exclusiva antes do POST fiscal,
  com a mesma proteção contra duplicação utilizada nas transferências.

## Confirmação necessária para abrir ao público

Depois da publicação, verificar na conta administradora um pedido real aprovado
no telemóvel, a atualização automática para pago/confirmada e a FR identificada
com o respetivo PDF. Só depois se deve registar a aceitação de vendas e alterar
a abertura pública. Os testes automáticos não substituem essa confirmação.
Esta revisão não envia pedidos de pagamento nem emite documentos reais por si.

## Fontes primárias

- Ensaio anterior: `CHECKOUT_SANDBOX_20261009.md`.
- EuPago legacy MB WAY: <https://docs.eupago.pt/reference/mb-way>.
- EuPago Webhooks 2.0: <https://docs.eupago.pt/reference/realtime-webhooks-20>.
- TOConline, categoria OU: <https://api-docs.toconline.pt/apis/versoes-anteriores/compras/pagamentos>.
- TOConline, documentos de venda: <https://api-docs.toconline.pt/apis/vendas/documentos-de-venda>.
- AT, Portaria 302/2016, campo 4.1.4.20.6.1:
  <https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_302_2016.pdf>.

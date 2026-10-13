# Stripe Checkout — cartões em sandbox (13/10/2026)

## Âmbito

Método `stripe_card` no percurso administrativo `/conta/inscricoes-teste`, para a conta verificada `circ.chuc@gmail.com`. Reutiliza os preços, elegibilidade, armazenamento isolado e complementos existentes. Mantém MB WAY/Multibanco na Eupago e a conferência da transferência bancária. Não abre checkout público nem modifica inscrições reais, vagas, vouchers, faturação, Firebase rules ou credenciais.

Usa Checkout alojado em `checkout.stripe.com`, `mode=payment`, EUR e preços enviados pelo servidor. Na versão `2026-09-30.endive`, os métodos de pagamento são geridos pelas definições da Stripe no Dashboard; o CIRC não envia `payment_method_types`. Não recolhe números de cartão ou CVC no CIRC. A chave publicável não é necessária neste redirecionamento. Impostos automáticos, Adaptive Pricing e criação de faturas estão desligados neste ensaio; isso não determina o enquadramento fiscal da associação. A API Stripe é fixada em `2026-09-30.endive`.

## Configuração que falta concluir na conta da organização

O organizador informou que guardou `STRIPE_SANDBOX_SECRET_KEY` no Worker Cloudflare `circ`. Não foram lidas as credenciais nem verificada a chave contra a API real durante este desenvolvimento.

1. Na **mesma sandbox Stripe da chave**, abrir Workbench → Webhooks → Adicionar destino. Escolher eventos da própria conta e formato **Snapshot**, não Thin/Connect. Quando permitido, usar a versão `2026-09-30.endive`.
2. Selecionar apenas `checkout.session.completed` e `checkout.session.expired`.
3. Endpoint HTTPS: `https://circ-coimbra.org/api/payments/stripe/sandbox/notifications`.
4. Guardar o segredo de assinatura do destino (`whsec_…`) na Cloudflare, tipo Secret, nome **STRIPE_SANDBOX_WEBHOOK_SECRET**. Publicar a configuração. Não reutilizar a chave da API, da CLI ou da Eupago.
5. Na inscrição de teste, usar **Atualizar configuração Stripe**. A opção de cartão só é disponibilizada quando há chave de teste, segredo de assinatura e identidade de serviço Firebase. Estes indicadores verificam presença/formato, não a validade externa das credenciais ou a entrega do webhook.

Permissão inicial da chave restrita: Checkout Sessions → Write (inclui leitura). Na sandbox, manter cartões ativos nas definições de métodos de pagamento da Stripe; outros métodos dinâmicos devem ser desativados se não forem desejados no Checkout. A integração não chama APIs de Customers, PaymentIntents, Webhook Endpoints, refunds ou payouts. Se a Stripe devolver 403 ou recusar um parâmetro, consultar os registos da API para identificar a permissão/dependência concreta; não conceder acesso total por tentativa.

## Pagamento e confirmação

Cada sessão Stripe associa metadados de ambiente, evento, proprietário, inscrição e pedido, mais `client_reference_id`. Só são usadas chaves `rk_test_`/`sk_test_`, sessões `cs_test_` e objetos `livemode=false`. A configuração Stripe é independente da presença de credenciais Eupago.

Reserva do pedido antes da chamada externa, precondição de versão e Idempotency-Key impedem criação duplicada por concorrência. Não há repetição automática de criação. Uma falha inequívoca de parâmetros/autenticação/permissão encerra a tentativa com diagnóstico seguro; timeouts e falhas incertas preservam a tentativa sem criar outra. Pode recuperar-se um ID `cs_test_` encontrado na Stripe, após consulta autenticada e comparação integral dos dados.

O webhook verifica HMAC-SHA256 sobre os bytes originais, assinatura v1 e tolerância temporal de 300 segundos, antes de qualquer acesso ao armazenamento. Aceita múltiplas assinaturas v1 para rotação. Valida a sessão assinada e consulta-a novamente na API Stripe. Confirma apenas `status=complete` e `payment_status=paid`, com correspondência de montante, moeda, método, IDs, metadados e PaymentIntent. Recibo e direitos da inscrição de teste são gravados juntos, com controlo de versão; repetições não duplicam a confirmação. Pagamentos tardios incompatíveis ficam `review_required`, sem duplicar direitos.

O URL de regresso e a consulta manual apenas mostram/consultam informação; não concedem direitos. A página continua a atualizar o registo interno enquanto aguarda notificação. A confirmação funciona no servidor mesmo com o navegador fechado. A navegação de cancelamento não apaga nem expira a sessão: o participante pode retomar a sessão ainda aberta. Expiração só encerra a tentativa depois de confirmação pela API Stripe.

Eventos não suportados ou amostras sem a identificação desta integração devolvem `received=true, ignored=true`. Esse HTTP 200 não prova um pagamento. Um evento do pedido correto só confirma após a gravação; falhas temporárias devolvem 503 para reenvio. Não reconstruir notificações reais com segredos no chat.

## Verificações locais executadas

- Servidor: 225 testes, 224 aprovados, zero falhas, 1 teste preexistente do Media Center ignorado. Inclui 33 testes Stripe: assinatura/tempo, estado pago, confirmação independente, metadados, segregação de ambientes, criação concorrente, reenvios, expiração, créditos tardios, falhas e recuperação.
- Interface: 37 suites, 184 testes aprovados, incluindo 9 novos casos de configuração, escolha do cartão, cópia do URL, segurança do destino, recuperação e ausência de campos locais de cartão.
- Compilação React integral concluída com sucesso. Transportes, identidades e armazenamento de pagamentos foram simulados. Não foram criados pagamentos na conta Stripe da organização nem usadas chaves reais.
- A CI deve confirmar estes resultados antes de integrar e publicar. A publicação não substitui o ensaio externo com Stripe/Firebase reais.

## Ensaio externo de aceitação

Depois de configurar o webhook: criar uma inscrição de teste, rever o total, selecionar cartão Stripe, criar o pedido e abrir **Pagar na Stripe — teste**. Usar cartões fictícios da documentação Stripe, nunca cartões pessoais: Visa `4242 4242 4242 4242`, Mastercard `5555 5555 5555 4444`, validade futura e CVC de teste. Confirmar notificação validada, inscrição e persistência após recarregar. Ensaiar cartão recusado, autenticação 3D Secure, regresso sem pagar, expiração, reenvio e um complemento sem repetir o congresso. O primeiro ensaio também valida a permissão da chave restrita com os preços inline. Estes ensaios ainda não foram executados na conta da organização.

## Fontes

- https://docs.stripe.com/api/checkout/sessions/create
- https://docs.stripe.com/checkout/fulfillment
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/api/idempotent_requests
- https://docs.stripe.com/testing

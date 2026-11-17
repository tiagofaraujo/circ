# CIRC 2027 — preparação Stripe em produção

## Estado atualizado em 17 de novembro de 2026

O organizador confirmou que o pagamento real MB WAY funciona corretamente.
Esta confirmação refere-se ao pagamento; não inclui o identificador da respetiva FR.
Multibanco, transferência bancária e respetivos recibos já tinham sido confirmados.

O Stripe anterior era exclusivamente sandbox. O novo percurso usa o ledger real,
e mantém a abertura restrita a validação. A conta live e uma sessão real de 95 €
criada pelo participante foram consultadas: a sessão estava aberta e não paga.
A ligação `/g/pay/` era rejeitada pelo validador anterior. Esta alteração corrige
o formato e recupera a sessão existente sem criar outra cobrança. A confirmação
do pagamento e a emissão real da FR permanecem por validar.

## Âmbito e abertura

O método `stripe_card` abre Stripe Checkout alojado em `checkout.stripe.com`.
Visa, Mastercard, American Express, Discover e as carteiras Apple Pay/Google Pay elegíveis usam o percurso de
cartões. A apresentação de cada carteira depende da conta, navegador, dispositivo
e cartão configurado pelo participante. Não existem campos de cartão no CIRC.

`LIVE_STRIPE_ENABLED=true`, `LIVE_STRIPE_VALIDATION_ONLY=true` e a allowlist de
validação limitam o método à administração verificada e à conta designada para
validar pagamentos. Esta autorização não concede permissões administrativas.
O método só aparece quando há configurações live com formato válido.

A API fica fixada em `2026-10-28.endive`. A criação limita os métodos dinâmicos com
`allowed_payment_method_types[]=card,link,paypal`; não envia `payment_method_types`.
MB WAY mantém o percurso EuPago. A configuração da conta decide a disponibilidade
final: em 17/11, cartões, Apple Pay, Google Pay e Link estavam disponíveis; PayPal
ainda não estava ativado. Os restantes métodos da conta não entram neste checkout.
O regresso/cancelamento no navegador não confirma pagamentos nem cria sessões.

## Configuração da organização

Consultar `/admin/faturacao`, secção «Stripe · cartões e carteiras digitais».
O diagnóstico indica apenas presença e formato; nunca apresenta os segredos.

1. Na conta Stripe da organização, em produção, preparar uma chave restrita:
   Checkout Sessions — escrita; Payment Intents — leitura; Payment Methods —
   leitura para a expansão do instrumento. Conferir recusas de permissões nos
   registos da API; não conceder acesso total por tentativa.
2. Guardar diretamente no Worker `circ`, como Secret,
   `STRIPE_LIVE_SECRET_KEY`. A integração rejeita chaves de teste.
3. Criar um destino de webhook da própria conta, formato Snapshot, versão
   `2026-10-28.endive` para novos destinos, com este endpoint (o destino existente
   em `2026-09-30.endive` mantém o formato compatível):

   `https://circ-coimbra.org/api/payments/stripe/live/notifications`

4. Subscrever `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed` e `checkout.session.expired`.
5. Guardar o segredo de assinatura desse destino como Secret
   `STRIPE_LIVE_WEBHOOK_SECRET`. É independente do segredo sandbox e da API key.
6. Conferir as definições live dos meios de pagamento, incluindo Google Pay,
   e atualizar o diagnóstico CIRC. A chave publicável não é usada neste
   redirecionamento. Os valores permanecem na Stripe e nos Secrets da Cloudflare.

O botão Google Pay fica na página alojada da Stripe. O CIRC não apresenta
botões de carteira incorporados nem exige registar o domínio para Elements.

## Confirmação financeira e faturação

O servidor reserva o UUID, a cotação e os dados de faturação antes do POST à
Stripe. Usa uma chave de idempotência estável; respostas incertas conservam o
pedido. Não se volta a cobrar por abrir a página, regressar ou atualizar o estado.

O webhook verifica assinatura sobre os bytes originais e o ambiente live.
Confere identidade, metadados, montante, EUR, sessão e PaymentIntent e volta a
consultar a sessão na Stripe. Só um evento de pagamento confirmado e uma sessão
`complete`/`paid` podem confirmar a inscrição. A tarifa usa a data do evento de
pagamento, convertida para Lisboa, e não a criação da sessão ou a receção HTTP.

A consulta do instrumento devolve apenas `funding` e o tipo de carteira/método. Crédito
usa CC e débito usa DC no TOConline. Não se deduz crédito pela marca Visa ou
Mastercard. Um instrumento desconhecido/pré-pago ou uma leitura sem permissão
deixa a faturação em conferência e conserva o pagamento e os direitos confirmados.
Link e PayPal usam a categoria genérica documentada OU, sem deduzir que a origem
dos fundos seja crédito ou débito. A aceitação de OU na emissão real destes métodos
ainda precisa de validação; não foram emitidas FR para testar esta alteração.
Uma emissão ainda não iniciada pode ser retomada pela administração após nova
leitura do instrumento e claim exclusiva; resultados fiscais incertos não são
reenviados. A FR usa o TOConline, com os preços e regras fiscais já existentes.

Não são guardados PAN, CVC, validade, últimos dígitos ou impressão do cartão.
IDs da sessão/PaymentIntent permitem rastrear o pagamento. Pagamentos históricos
e os respetivos PDFs mantêm-se acessíveis e não ocupam a nova inscrição ativa.

A expiração usa o prazo devolvido pela Stripe, distinto dos quatro minutos MB WAY.
Um pedido expirado não provoca nova cobrança automática. Uma criação incerta pode
recuperar a ligação do mesmo pedido: consulta GET limitada a cinco minutos antes/depois
da reserva, no máximo duas páginas, correspondência única de identidade, metadados,
montante e moeda, seguida de nova leitura. Não repete o POST nem confirma pagamentos.
A referência é associada atomicamente à inscrição ativa; resultados ambíguos bloqueiam
a recuperação. São aceites exclusivamente os caminhos `/c/pay/`, `/g/pay/` e `/pay/`
da origem HTTPS Checkout Stripe, com o ID exato, sem credenciais nem query strings.
Uma criação definitivamente recusada também exige intervenção administrativa;
esta etapa não disponibiliza repetição autónoma dessas tentativas.

## Validação real pendente

Depois de configurar a conta e as credenciais, usar o checkout habitual de uma
conta autorizada e uma compra efetivamente pretendida. Confirmar o pagamento,
a atualização automática da inscrição e a FR/PDF; verificar Apple Pay e Google
Pay em dispositivos elegíveis. Uma inscrição paga admite compras adicionais,
sem duplicar a inscrição principal. Testes automáticos não comprovam estas etapas.

Verificação de 17/11: 811 testes de servidor (810 aprovados e um ignorado);
776 testes de interface em 90 suites; compilação de produção e `git diff --check`.
Cobertura inclui rejeição de sessões ambíguas, proprietário/montante divergentes,
URLs externas, resposta perdida, recuperação do mesmo pedido e confirmação única
com cartão, Link e PayPal. Todos os pagamentos destes testes usam adaptadores locais.

## Fontes primárias

- <https://support.stripe.com/questions/fix-the-payment-method-types-error>
- <https://docs.stripe.com/api/checkout/sessions/create>
- <https://docs.stripe.com/checkout/fulfillment.md?ui=full-page>
- <https://docs.stripe.com/webhooks>
- <https://docs.stripe.com/api/idempotent_requests>
- <https://docs.stripe.com/keys/restricted-api-keys>
- <https://docs.stripe.com/api/payment_intents/retrieve>
- <https://docs.stripe.com/api/payment_methods/object>
- <https://docs.stripe.com/apple-pay?platform=web>
- <https://docs.stripe.com/google-pay?platform=web>
- <https://api-docs.toconline.pt/apis/vendas/recibos-de-venda>

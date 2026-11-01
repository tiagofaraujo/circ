# CIRC 2027 — preparação Stripe em produção

## Estado em 1 de novembro de 2026

O organizador confirmou que o pagamento real MB WAY funciona corretamente.
Esta confirmação refere-se ao pagamento; não inclui o identificador da respetiva FR.
Multibanco, transferência bancária e respetivos recibos já tinham sido confirmados.

O Stripe anterior era exclusivamente sandbox. O novo percurso usa o ledger real,
mas a presença das credenciais na Cloudflare, a aprovação da conta Stripe e a
aceitação de um pagamento real não foram verificadas durante esta implementação.
Não foram criadas sessões, cobranças ou faturas reais pelas ferramentas.

## Âmbito e abertura

O método `stripe_card` abre Stripe Checkout alojado em `checkout.stripe.com`.
Visa/Mastercard e as carteiras Apple Pay/Google Pay elegíveis usam o percurso de
cartões. A apresentação de cada carteira depende da conta, navegador, dispositivo
e cartão configurado pelo participante. Não existem campos de cartão no CIRC.

`LIVE_STRIPE_ENABLED=true`, `LIVE_STRIPE_VALIDATION_ONLY=true` e a allowlist de
validação limitam o método à administração verificada e à conta designada para
validar pagamentos. Esta autorização não concede permissões administrativas.
O método só aparece quando há configurações live com formato válido.

A API fica fixada em `2026-09-30.endive`. A criação envia
`allowed_payment_method_types[0]=card`; não envia o parâmetro removido
`payment_method_types`. PayPal, Revolut Pay e Klarna não são abertos nesta etapa.
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
   `2026-09-30.endive`, com este endpoint:

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

A consulta do instrumento devolve apenas `funding` e o tipo de carteira. Crédito
usa CC e débito usa DC no TOConline. Não se deduz crédito pela marca Visa ou
Mastercard. Um instrumento desconhecido/pré-pago ou uma leitura sem permissão
deixa a faturação em conferência e conserva o pagamento e os direitos confirmados.
Uma emissão ainda não iniciada pode ser retomada pela administração após nova
leitura do instrumento e claim exclusiva; resultados fiscais incertos não são
reenviados. A FR usa o TOConline, com os preços e regras fiscais já existentes.

Não são guardados PAN, CVC, validade, últimos dígitos ou impressão do cartão.
IDs da sessão/PaymentIntent permitem rastrear o pagamento. Pagamentos históricos
e os respetivos PDFs mantêm-se acessíveis e não ocupam a nova inscrição ativa.

A expiração usa o prazo devolvido pela Stripe, distinto dos quatro minutos MB WAY.
Um pedido expirado não provoca nova cobrança automática; uma criação incerta
continua bloqueada para conferência pela organização.
Uma criação definitivamente recusada também exige intervenção administrativa;
esta etapa não disponibiliza repetição autónoma dessas tentativas.

## Validação real pendente

Depois de configurar a conta e as credenciais, usar o checkout habitual de uma
conta autorizada e uma compra efetivamente pretendida. Confirmar o pagamento,
a atualização automática da inscrição e a FR/PDF; verificar Apple Pay e Google
Pay em dispositivos elegíveis. Uma inscrição paga admite compras adicionais,
sem duplicar a inscrição principal. Testes automáticos não comprovam estas etapas.

Verificação local: 620 testes de servidor, 619 aprovados e um ignorado;
457 testes de interface em 66 suites; compilação de produção, ESLint dos
componentes alterados e `git diff --check` aprovados. A revisão independente
não encontrou bloqueadores no código deste percurso controlado.

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

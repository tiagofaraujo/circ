# Arquitetura de faturação automática — CIRC 2027

## Estado desta fase

Esta é a base técnica da integração. **A emissão real permanece desativada** até serem confirmados pelo contabilista o tipo de documento, a série, o enquadramento de IVA, os artigos/serviços e as contas de caixa.

O segredo da API apresentado durante a configuração deve ser revogado e substituído antes de qualquer teste. Nenhuma credencial TOConline pode ser guardada no React, no Firestore, no GitHub ou em ficheiros `.env` versionados.

## Princípios

- O frontend Cloudflare nunca comunica diretamente com o TOConline.
- A integração corre em Cloud Functions for Firebase de 2.ª geração, no mesmo projeto do Firestore.
- As credenciais OAuth e os tokens são guardados no Google Cloud Secret Manager.
- Uma confirmação de pagamento cria uma ordem de faturação; não emite diretamente no navegador.
- Cada pagamento origina, no máximo, um processo fiscal, mesmo que um evento seja entregue mais de uma vez.
- Registos de teste e pagamentos de valor zero nunca são enviados ao TOConline.
- Um reembolso ou cancelamento nunca anula automaticamente um documento fiscal: fica pendente de validação administrativa/contabilística.

## Fluxo

1. O pagamento em `payments/{paymentId}` muda para `paid`.
2. Uma função verifica a inscrição/pedido complementar, o montante e se é um registo real.
3. É criado `billingJobs/{paymentId}`, usando o ID do pagamento como chave de idempotência.
4. O perfil de faturação é copiado para um snapshot imutável no pedido.
5. O backend procura/cria o cliente no TOConline, com controlo de duplicação por NIF.
6. O backend emite o documento aprovado:
   - `FT` e posteriormente `RC`, quando existe fatura antes do pagamento; ou
   - `FR`, quando o contabilista confirmar que a operação deve ser faturada e recebida no mesmo momento.
7. O PDF finalizado é obtido através da API e guardado em Storage privado.
8. O TOConline envia o documento por email, se esta opção estiver ativa.
9. O resultado é registado em `billingDocuments/{paymentId}` e em `auditLogs`.

## Estados do pedido

```text
queued
  -> validating
  -> blocked_profile
  -> issuing
  -> issued
  -> emailing
  -> completed

Qualquer etapa pode terminar em retryable_error ou manual_review.
```

A transição para `live` depende de uma configuração administrativa explícita:

```text
billingMode: off | test | live
```

- `off`: não cria pedidos.
- `test`: valida e simula, sem emitir documentos fiscais.
- `live`: permite emissão real depois de todas as confirmações.

## Coleções Firestore

### `billingJobs/{paymentId}`

Apenas o backend escreve. O administrador pode consultar.

```text
eventId, paymentId, registrationId, orderId?, userId,
sourceType: registration | supplementary,
status, billingMode, attempts,
amountCents, currency, paymentMethod,
billingSnapshot,
missingFields,
externalReference,
createdAt, updatedAt, nextRetryAt?, lastError?
```

A referência externa deve ser determinística, por exemplo `CIRC-2027-{paymentId}`.

### `billingDocuments/{paymentId}`

O participante pode ler apenas os próprios documentos. Apenas o backend escreve.

```text
eventId, paymentId, registrationId, orderId?, userId,
documentType, documentNumber, series,
amountCents, currency, status,
tocOnlineCustomerId, tocOnlineSalesDocumentId, tocOnlineReceiptId?,
storagePath, fileName, issuedAt, emailedAt?,
createdAt, updatedAt
```

Não guardar respostas integrais da API, tokens OAuth ou credenciais.

## Snapshot de faturação

O snapshot é criado quando o pagamento é confirmado, para que alterações posteriores ao perfil não modifiquem um documento já emitido:

```text
name, email, taxNumber,
billingAddress, billingPostalCode, billingCity, billingCountry
```

Antes da emissão devem ser validados os campos obrigatórios, o formato do NIF/IVA, o montante e a moeda.

## TOConline

Configuração privada necessária:

```text
TOCONLINE_CLIENT_ID
TOCONLINE_CLIENT_SECRET
TOCONLINE_OAUTH_BASE
TOCONLINE_API_BASE
TOCONLINE_REDIRECT_URI
TOCONLINE_OAUTH_TOKENS
```

O OAuth usa `access_token` e `refresh_token`. A URI de callback de produção deve apontar para uma função HTTPS do CIRC; a callback temporária do Postman serve apenas para testes manuais.

Rotas relevantes confirmadas na documentação disponibilizada:

```text
POST  /api/customers
POST  /api/v1/commercial_sales_documents
POST  /api/v1/commercial_sales_receipts
GET   /api/url_for_print/{id}
PATCH /api/email/document
```

## Proteções obrigatórias

- Transação Firestore para criar um único `billingJobs/{paymentId}`.
- Verificação do estado anterior e novo do pagamento.
- Bloqueio de `isTest` e `testMode`.
- Bloqueio de valores nulos, negativos ou diferentes do pagamento confirmado.
- Pesquisa por `externalReference` antes de repetir uma emissão após timeout.
- Limite de tentativas e espera progressiva.
- Logs sem NIF completo, morada, token ou payload integral.
- Ação administrativa separada para repetir, anular ou enviar novamente.
- Confirmação explícita no painel antes de mudar a integração para `live`.

## Decisões necessárias antes da emissão real

1. Emitir `FT + RC` ou `FR`?
2. O documento é emitido para todos os pagamentos ou apenas quando o participante pede faturação?
3. Qual é a série documental exclusiva do CIRC 2027?
4. Qual é o enquadramento de IVA e a respetiva menção legal?
5. Quais são os códigos/designações dos serviços: congresso, curso e jantar?
6. Que caixa/conta e meios de pagamento do TOConline correspondem a transferência, MB WAY, Multibanco e cartão?
7. Como tratar participantes sem NIF ou com número fiscal estrangeiro?
8. O email sai automaticamente pelo TOConline e com que remetente/assunto?

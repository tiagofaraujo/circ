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

## Regra documental proposta

A interface do TOConline confirma a disponibilidade de `Fatura-recibo` e `Fatura simplificada`. Para o CIRC, a escolha automática deve ser:

| Situação | Documento |
|---|---|
| Pagamento confirmado e emissão na mesma data | `FR` — fatura-recibo |
| Fatura emitida antes do pagamento | `FT`, seguida de `RC` quando o pagamento for confirmado |
| Pagamento registado numa data diferente da emissão | `FT + RC`, com revisão das datas |
| Fatura simplificada | Não utilizar no fluxo automático |

A fatura simplificada não será o documento padrão: as prestações de serviços podem ultrapassar o limite legal aplicável e o CIRC necessita de um modelo uniforme com identificação e morada de faturação. Mesmo quando o valor isolado permitir uma fatura simplificada, o backend continuará a emitir `FR` ou `FT + RC`.

Para impedir documentos com datas incorretas, o pagamento deve guardar `paidAt` como a data efetiva do recebimento. A data em que o administrador altera o estado para “Pago” não pode substituir automaticamente a data real do pagamento.

A série apresentada nas capturas continua selecionada como `2025`. Nenhum teste ou emissão de 2027 pode avançar enquanto a série correta não estiver criada e selecionada no TOConline.

## Evidência documental — edição 2025

Foram analisadas quatro faturas originais da edição anterior. Os dados pessoais dos clientes não são transpostos para o projeto; apenas se registam as características fiscais e operacionais relevantes.

| Elemento observado | Modelo de 2025 | Consequência para 2027 |
|---|---|---|
| Tipo e numeração | Fatura `FT 2025/n` | A série de 2027 tem de ser criada/confirmada antes da ativação |
| IVA | Taxa única de 23% nos exemplos | Usar 23% apenas após reconfirmação contabilística para cada artigo |
| Vencimento | Igual à data de emissão | Pode servir de predefinição, sujeita a confirmação |
| Cursos | Cada curso é uma linha/artigo autónomo | Manhã e tarde devem manter códigos e linhas independentes |
| Jantar | Artigo autónomo, com quantidade | Permite faturar um ou vários jantares no mesmo pedido |
| Formalidades | Original, ATCUD, QR e referência ao software certificado | Devem ser produzidas pelo TOConline, nunca pelo frontend |

Os exemplos históricos mostram:

- dois cursos na mesma fatura, cada um com o seu código e linha;
- uma fatura com apenas um curso;
- uma fatura autónoma de jantar;
- valores históricos de 40,00 € por curso e 35,01 € por jantar, que **não** devem ser reutilizados como preços de 2027.

Não foi fornecido qualquer recibo `RC` nem fatura-recibo `FR`. Assim, estes documentos confirmam o modelo de artigos e a utilização de `FT`, mas não demonstram como o recebimento foi fiscalmente liquidado em 2025.

## Mapeamento proposto de artigos para 2027

O backend deve construir as linhas a partir do snapshot imutável do pedido, sem aceitar descrições ou preços livres enviados pelo navegador:

| Chave interna | Artigo TOConline | Quantidade |
|---|---|---:|
| `congress_in_person` | Inscrição presencial CIRC 2027 | 1 |
| `congress_virtual` | Inscrição virtual CIRC 2027 | 1 |
| `course_morning` | Curso Pré-Congresso — manhã | 0 ou 1 |
| `course_afternoon` | Curso Pré-Congresso — tarde | 0 ou 1 |
| `dinner` | Jantar CIRC 2027 | 0 ou mais |

Os códigos TOConline, preços líquidos/brutos e taxa de IVA ficam numa configuração privada e versionada do backend. Pedidos complementares reutilizam os mesmos artigos; nunca criam uma segunda inscrição principal.

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

1. O contabilista confirma a regra proposta: `FR` apenas quando emissão e pagamento coincidirem; nos restantes casos, `FT + RC`?
2. O documento é emitido para todos os pagamentos ou apenas quando o participante pede faturação?
3. Qual é a série documental exclusiva do CIRC 2027? Em 2025 foi usada a série `2025`.
4. Confirma-se a taxa de IVA de 23% observada em 2025 para todos os artigos de 2027?
5. Quais são os códigos definitivos dos cinco artigos de 2027: congresso presencial, congresso virtual, curso da manhã, curso da tarde e jantar?
6. Que caixa/conta e meios de pagamento do TOConline correspondem a transferência, MB WAY, Multibanco e cartão?
7. Como tratar participantes sem NIF ou com número fiscal estrangeiro?
8. O email sai automaticamente pelo TOConline e com que remetente/assunto?

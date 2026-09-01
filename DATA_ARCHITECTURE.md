# Arquitetura de dados CIRC 2027

## Serviços

- Firebase Authentication: contas e sessões; nunca armazena palavras-passe na aplicação.
- Cloud Firestore: perfis, inscrições, estado de pagamentos, fila de faturação e metadados documentais.
- Cloud Functions for Firebase: operações privadas, confirmação de pagamentos e integração com o TOConline.
- Google Cloud Secret Manager: credenciais OAuth e tokens do TOConline.
- Cloud Storage for Firebase: ficheiros privados, como diplomas, recibos e comprovativos.
- Cloudflare: frontend estático; não deve conter dados pessoais nem segredos.

## Coleções Firestore

### `users/{uid}`

Perfil do participante: nome, email, contacto, instituição, profissão e dados de faturação estritamente necessários. O documento pertence ao UID autenticado.

### `registrations/{registrationId}`

```text
eventId, userId, participantName, participantEmail,
registrationType, status,
payment: { status, amountCents, currency, method, reference, updatedAt, updatedBy },
documentCount, consentVersion, createdAt, updatedAt
```

O objeto `payment` é um resumo para o painel. O registo financeiro detalhado fica em `payments`.

### `registrationOrders/{orderId}`

Pedidos complementares posteriores à inscrição principal: cursos ainda não adquiridos e um ou mais jantares. Cada pedido tem pagamento próprio e não cria uma segunda inscrição principal.

### `payments/{paymentId}`

Estado, montante em cêntimos, moeda, método, referência externa e quem confirmou. Não guardar número de cartão, CVV, credenciais bancárias ou payloads integrais do prestador de pagamentos.

A transição para `paid` inicia a fila de faturação no backend. O ID deve ser estável e identificar inequivocamente o pagamento da inscrição principal ou do pedido complementar.

### `billingJobs/{paymentId}`

Fila privada e idempotente da emissão fiscal. O ID do documento é igual ao ID do pagamento. Apenas Cloud Functions escreve; o administrador pode consultar.

```text
eventId, paymentId, registrationId, orderId?, userId,
sourceType, status, billingMode, attempts,
amountCents, currency, paymentMethod,
billingSnapshot, externalReference,
missingFields, lastError?, createdAt, updatedAt
```

### `billingDocuments/{paymentId}`

Resultado da integração com o TOConline e metadados do documento fiscal. O participante pode consultar apenas os próprios documentos; apenas o backend escreve.

```text
eventId, paymentId, registrationId, orderId?, userId,
documentType, documentNumber, series,
amountCents, currency, status,
tocOnlineCustomerId, tocOnlineSalesDocumentId, tocOnlineReceiptId?,
storagePath, fileName, issuedAt, emailedAt?,
createdAt, updatedAt
```

Nunca guardar tokens OAuth, segredos ou respostas integrais da API nestas coleções.

### `documents/{documentId}`

Metadados sem conteúdo binário: `eventId`, `registrationId`, `userId`, `type`, `storagePath`, `fileName`, `contentType`, `size`, `issuedAt`, `createdAt`, `createdBy`.

### `auditLogs/{logId}`

Registo imutável das alterações administrativas: ação, inscrição, valor anterior, valor novo, utilizador administrador e data/hora do servidor. A emissão, reenvio, erro e anulação fiscal devem gerar eventos próprios, sem incluir NIF completo, morada ou tokens.

## Pastas privadas no Storage

```text
private/participants/{uid}/receipts/
private/participants/{uid}/invoices/
private/participants/{uid}/diplomas/
private/registrations/{registrationId}/{uid}/
private/payment-proofs/{uid}/
```

Os ficheiros aceites são PDF, JPEG ou PNG, com limite de 15 MB. Os caminhos são autorizados por UID e pelo email administrativo verificado.

## Conservação recomendada para validação jurídica/contabilística

- Perfis sem inscrição: apagar após um período de inatividade definido pela organização.
- Dados operacionais do evento: conservar apenas pelo período necessário à gestão e suporte pós-evento.
- Diplomas: disponibilizar enquanto a conta/arquivo do evento justificar a finalidade.
- Recibos, faturas e registos contabilísticos: aplicar o prazo legal confirmado pelo contabilista da associação.
- Logs de segurança: prazo curto e documentado, suficiente para investigação de incidentes.

Os prazos definitivos devem constar da Política de Privacidade e do registo de atividades de tratamento. Evitar recolher dados de saúde ou outras categorias especiais sem necessidade e fundamento jurídico específico.

## Recuperação e continuidade

- Exportação ou backup diário do Firestore quando as inscrições abrirem.
- Cópia dos documentos para um bucket de backup com acesso restrito e política de retenção.
- Alertas de orçamento e utilização.
- Teste de restauro antes do início do evento e novamente antes da emissão de diplomas.
- Reconciliação diária entre pagamentos `paid`, pedidos de faturação e documentos emitidos no TOConline.
- Exportação contabilística final e verificação de falhas, duplicados e documentos pendentes.

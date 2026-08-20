# Arquitetura de dados CIRC 2027

## Serviços

- Firebase Authentication: contas e sessões; nunca armazena palavras-passe na aplicação.
- Cloud Firestore: perfis, inscrições, estado de pagamentos e metadados documentais.
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

### `payments/{registrationId}`

Estado, montante em cêntimos, moeda, método, referência externa e quem confirmou. Não guardar número de cartão, CVV, credenciais bancárias ou payloads integrais do prestador de pagamentos.

### `documents/{documentId}`

Metadados sem conteúdo binário: `eventId`, `registrationId`, `userId`, `type`, `storagePath`, `fileName`, `contentType`, `size`, `issuedAt`, `createdAt`, `createdBy`.

### `auditLogs/{logId}`

Registo imutável das alterações administrativas: ação, inscrição, valor anterior, valor novo, utilizador administrador e data/hora do servidor.

## Pastas privadas no Storage

```text
private/participants/{uid}/receipts/
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

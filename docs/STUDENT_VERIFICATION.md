# Validação documental de estudantes — CIRC 2027

## Comportamento

O participante escolhe **Estudante IMR**, confirma o email da conta e guarda o nome completo no perfil. Indica escola e curso e envia comprovativo de matrícula de **2026/2027**, com nome completo, instituição e curso visíveis. Não existe limite de idade nem lista fechada de escolas.

O estado inicial é **Comprovativo em análise**. Em `/admin/estudantes`, o secretariado autorizado consulta o ficheiro e pode **aprovar**, **pedir correção** ou **recusar**. As duas últimas decisões exigem motivo, visível na conta do estudante. A aprovação desbloqueia a seleção de participação na categoria estudante. O documento deve mostrar matrícula em IMR ou curso equivalente; a equivalência é apreciada pelo secretariado.

O estado atual aparece no site; esta versão não envia emails automáticos. O participante pode substituir o documento ou retirar o pedido. Uma substituição exige nova aprovação. Alterar o nome completo do perfil invalida a elegibilidade até nova análise. Cada conta tem um pedido para este evento. A análise é documental, não uma autenticação da identidade junto da escola.

## Compatibilidade com o estado atual do site

Este trabalho implementa a elegibilidade e o acesso dos estudantes aos cursos. O botão público de inscrição continua a indicar a abertura a 15 de novembro; o fluxo de pagamento não é ativado por esta alteração. As simulações administrativas continuam marcadas `isTest: true`. As regras também impedem a criação de inscrições reais na categoria estudante sem aprovação. As categorias ULS Coimbra e externa conservam o seu comportamento.

Após aprovação, os estudantes podem escolher o curso da manhã, o da tarde ou ambos, a **35 € por curso**, com congresso presencial/virtual ou na modalidade **Apenas cursos**. Podem acrescentar um curso ainda não incluído através de um pedido complementar; inscrições antigas de estudante sem `courseAffiliation` usam também a tarifa de 35 €. Um curso já incluído não é comprado novamente. A aprovação continua obrigatória nas regras para inscrições e pedidos complementares reais de estudante. Os jantares mantêm-se opcionais.

## Armazenamento e limites

- `studentVerifications/{uid}`: pedido, nome do perfil no momento do envio, escola, curso, ano letivo, revisão e última decisão (autor, data e nota).
- `studentProofs/{uid}`: ficheiro privado, em documento separado. Não tem URL pública nem índices. Não é descarregado ao consultar a lista: apenas ao abrir um pedido.
- PDF até 300 KiB; imagens JPG, PNG ou WebP até 10 MiB de entrada, comprimidas no navegador para JPEG até 300 KiB. O estudante confirma a legibilidade antes de enviar. O limite persistido de base64 é 409600 caracteres.
- O payload não é usado para renderizar HTML. Fotografias são recodificadas; PDFs são disponibilizados para descarregar, sem incorporação automática na página. A verificação de cabeçalho/formato não é um antivírus nem valida o conteúdo académico.
- Lista do secretariado paginada em grupos de 25. Um novo envio de um pedido existente espera pelo menos 60 segundos; isto limita reenvios acidentais, não constitui proteção completa contra abuso de múltiplas contas.
- Utiliza apenas Authentication e Firestore já existentes, sem Cloud Functions, Cloud Storage, APIs pagas ou mudança para Blaze. Está sujeito à quota gratuita partilhada com o resto do projeto: [limites oficiais do Firestore](https://firebase.google.com/docs/firestore/quotas). O Cloud Storage exige Blaze: [requisitos oficiais](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).

## Permissões e conservação

Só o titular e as contas autorizadas para o secretariado podem ler um comprovativo. A listagem de ficheiros é bloqueada mesmo para o secretariado. A comissão científica não recebe acesso por ter a permissão de submissões. Usa-se a permissão existente `users/{uid}.roles.secretariat = true`, preservando as restantes permissões; o administrador e a conta de secretariado já configurada continuam autorizados.

Um utilizador não pode conceder permissões a si próprio, aprovar o seu próprio pedido (mesmo que pertença ao secretariado), alterar os dados submetidos durante a revisão nem conservar aprovação ao substituir o ficheiro. A interface verifica também a revisão e o instante de atualização dentro de uma transação para impedir decisões sobre um pedido que mudou entretanto.

O titular pode retirar pedido e ficheiro numa operação atómica. A eliminação da conta também remove ambos. Após uma decisão, o secretariado pode apagar o ficheiro mediante confirmação, mantendo os dados do pedido e a decisão. Esta conservação é manual: não existe eliminação automática calendarizada. Organizar a limpeza de comprovativos após a fase de validação. Retirar a elegibilidade não cancela automaticamente uma inscrição histórica; cancelamentos/reembolsos continuam possíveis no painel existente.

## Ativação

Publicar primeiro as regras e os índices e só depois o frontend. Não é necessário importar escolas nem listas de estudantes.

1. No Cloud Shell autenticado no projeto `circ-coimbra`, obter a versão desta PR. Se já existir uma cópia do repositório, usar uma pasta nova para evitar alterações locais:

   ```bash
   CIRC_STUDENT_DIR="$(mktemp -d "$HOME/circ-estudantes.XXXXXX")"
   git clone --branch feature/student-proof-verification --single-branch https://github.com/tiagofaraujo/circ.git "$CIRC_STUDENT_DIR"
   cd "$CIRC_STUDENT_DIR"
   ```

2. Publicar apenas Firestore:

   ```bash
   npx --yes firebase-tools@15.30.0 deploy --only firestore:rules,firestore:indexes --project circ-coimbra --config firebase.json
   ```

   As regras incluem as validações ULS existentes. Se aparecer um pedido de remoção de índices remotos que não reconheça, cancelar e comparar esses índices antes de continuar.

3. No Firebase Console → Firestore → Índices, aguardar que os dois índices de `studentVerifications` fiquem disponíveis: `eventId + updatedAt` e `eventId + status + updatedAt`. Confirmar também a isenção de índices em `studentProofs`.
4. Integrar esta PR em `main` e aguardar o deployment Cloudflare de `main`. Não existem variáveis de ambiente novas para estudantes. Preservar a configuração ULS existente.
5. Na conta de estudante com email confirmado, enviar um comprovativo próprio, verificar **Comprovativo em análise**, e testar aprovação a partir de outra conta autorizada para o secretariado. Confirmar que a tarifa e os cursos ficam disponíveis: um curso custa 35 € e os dois custam 70 €; na modalidade **Apenas cursos** não se soma congresso. Testar também um pedido de correção e o reenvio.

Não voltar a executar um pacote antigo `CIRC_ULS_Final` que publique uma cópia anterior de `firestore.rules`: isso retiraria as regras de estudantes. A partir desta atualização, publicar sempre as regras e os índices do repositório atualizado.

## Validação local

```bash
npm ci
CI=true npm test -- --watchAll=false --runInBand
CI=true npm run build
cd rules-tests
npm install --no-audit --no-fund
npm test
```

Os testes das regras usam o emulador Firestore e Java 21. Os documentos de teste são sintéticos e não são enviados para produção. A suíte ULS existente deve continuar a passar.

# Validação documental de estudantes — CIRC 2027

## Comportamento

O participante escolhe **Estudante IMR**, confirma o email da conta e guarda o nome completo no perfil. Indica a escola e envia comprovativo de matrícula de **2026/2027**, com nome completo, instituição e ano letivo visíveis. Não é pedido o curso: a área do evento é Radiologia / Imagem Médica e Radioterapia. Não existe limite de idade nem lista fechada de escolas.

O estado inicial é **Comprovativo em análise**. Em `/admin/estudantes`, o secretariado autorizado consulta o ficheiro e pode **aprovar**, **pedir correção** ou **recusar**. As duas últimas decisões exigem motivo, visível na conta do estudante. A aprovação desbloqueia a seleção de participação na categoria estudante. O documento deve mostrar matrícula em IMR ou curso equivalente; a equivalência é apreciada pelo secretariado.

O estado atual aparece no site; esta versão não envia emails automáticos. O participante pode substituir o documento ou retirar o pedido. Uma substituição exige nova aprovação. Alterar o nome completo do perfil invalida a elegibilidade até nova análise. Cada conta tem um pedido para este evento. A análise é documental, não uma autenticação da identidade junto da escola.

No formulário, **Selecionar ficheiro** abre os ficheiros do dispositivo; também é possível arrastar um PDF ou fotografia para a área de upload. Aceita-se um ficheiro por pedido. A preparação e a confirmação de legibilidade acontecem antes de **Enviar para análise**. Só depois de o servidor guardar o pedido aparece a confirmação de envio. Uma falha mantém o ficheiro preparado para repetir a tentativa. No pedido guardado, **Ver comprovativo enviado** permite ao titular consultar e descarregar o documento privado, incluindo após voltar a entrar na conta. A leitura é feita apenas quando solicitada; uma substituição descarta a pré-visualização anterior.

## Compatibilidade com o estado atual do site

O acesso aos cursos a 35 € por curso já foi publicado separadamente na PR28. Esta PR acrescenta a validação documental e passa a exigir aprovação para a participação na categoria estudante, incluindo cursos. O botão público de inscrição continua a indicar a abertura a 15 de novembro; o fluxo de pagamento não é ativado por esta alteração. As simulações administrativas continuam marcadas `isTest: true`. As regras também impedem a criação de inscrições reais na categoria estudante sem aprovação. As categorias ULS Coimbra e externa conservam o seu comportamento.

Após aprovação, os estudantes podem escolher o curso da manhã, o da tarde ou ambos, a **35 € por curso**, com congresso presencial/virtual ou na modalidade **Apenas cursos**. Podem acrescentar um curso ainda não incluído através de um pedido complementar; inscrições antigas de estudante sem `courseAffiliation` usam também a tarifa de 35 €. Um curso já incluído não é comprado novamente. A aprovação continua obrigatória nas regras para inscrições e pedidos complementares reais de estudante. Os jantares mantêm-se opcionais.

## Armazenamento e limites

- `studentVerifications/{uid}`: pedido, nome do perfil no momento do envio, escola, ano letivo, revisão e última decisão (autor, data e nota). O campo legado `course` mantém o contexto fixo `Radiologia / Imagem Médica e Radioterapia` nos novos envios, para compatibilidade com as regras já publicadas. Não é uma resposta do estudante nem comprova habilitações; a elegibilidade depende da análise documental. Os pedidos existentes continuam válidos e não são migrados. Esta simplificação não exige nova publicação de regras ou índices.
- `studentProofs/{uid}`: ficheiro privado, em documento separado. Não tem URL pública nem índices. Não é descarregado ao consultar a lista: apenas ao abrir um pedido.
- PDF até 300 KiB; imagens JPG, PNG ou WebP até 10 MiB de entrada, comprimidas no navegador para JPEG até 300 KiB. O estudante confirma a legibilidade antes de enviar. O limite persistido de base64 é 409600 caracteres.
- O formato é identificado pelo cabeçalho dos bytes. PDFs e imagens selecionados com tipo MIME vazio ou genérico podem ser preparados; extensões ou tipos declarados incompatíveis com o conteúdo são recusados. Isto não substitui a análise do documento.
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

2. Publicar apenas Firestore e verificar o resultado, com o script da PR:

   ```bash
   bash scripts/activate-students.sh
   ```

   As regras incluem as validações ULS existentes. Se aparecer um pedido de remoção de índices remotos que não reconheça, cancelar e comparar esses índices antes de continuar.

3. O script compara as regras efetivamente publicadas com a cópia local, confirma os dois índices de `studentVerifications` em estado `READY` e a isenção de índices em `studentProofs`. Não lê documentos de participantes nem mostra credenciais. Se os índices estiverem ainda em construção, aguardar alguns minutos e executar, na mesma pasta:

   ```bash
   python3 scripts/check-students-deployment.py
   ```

   Só continuar quando aparecer **VERIFICADO: Firebase preparado para a PR de estudantes em circ-coimbra.** O script não integra a PR nem modifica o frontend. Se falhar a autenticação, autorizar o Cloud Shell com a conta que administra este projeto e repetir.

   Se uma execução anterior mostrou `Deploy complete!` e só depois falhou a verificação, atualizar a cópia do script e repetir apenas `python3 scripts/check-students-deployment.py`. Não é necessário voltar a publicar por causa desse erro. Um HTTP 400 identifica uma consulta rejeitada pela API; não é tratado como falta de permissões. A verificação consulta a configuração pelos endpoints de listagem usados pelo Firebase CLI, incluindo todas as páginas, e considera apenas os índices das coleções de estudantes.
4. Integrar esta PR em `main` e aguardar o deployment Cloudflare de `main`. Não existem variáveis de ambiente novas para estudantes. Preservar a configuração ULS existente.
5. Na conta de estudante com email confirmado, enviar um comprovativo próprio, verificar **Comprovativo em análise**, e testar aprovação a partir de outra conta autorizada para o secretariado. Confirmar que a tarifa e os cursos ficam disponíveis: um curso custa 35 € e os dois custam 70 €; na modalidade **Apenas cursos** não se soma congresso. Testar também um pedido de correção e o reenvio.

Não voltar a executar um pacote antigo `CIRC_ULS_Final` que publique uma cópia anterior de `firestore.rules`: isso retiraria as regras de estudantes. A partir desta atualização, publicar sempre as regras e os índices do repositório atualizado.

## Validação local

```bash
npm ci
CI=true npm test -- --watchAll=false --runInBand
CI=true npm run build
python3 -m unittest discover -s scripts/tests -v
bash -n scripts/activate-students.sh
cd rules-tests
npm install --no-audit --no-fund
npm test
```

Os testes das regras usam o emulador Firestore e Java 21. Os documentos de teste são sintéticos e não são enviados para produção. A suíte ULS existente deve continuar a passar.

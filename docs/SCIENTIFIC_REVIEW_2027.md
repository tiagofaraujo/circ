# Avaliação científica · CIRC 2027

## Ativar no Firebase

O site e as regras de acesso são publicações distintas. O módulo permanece fechado até existir `reviewConfiguration/circ-2027.enabled = true`. A interface anterior de gestão de submissões continua disponível antes da ativação.

Na cópia atualizada de `main`, no Google Cloud Shell com a conta que gere `circ-coimbra`:

```bash
bash scripts/activate-scientific-review.sh
```

O script publica apenas as regras do Firestore, compara integralmente a versão publicada com `firestore.rules` e só depois ativa o módulo. Não altera inscrições, pagamentos, trabalhos, revisores ou avaliações existentes. Não necessita de Functions nem de novos índices compostos. As regras de ULS, estudantes e vouchers permanecem incluídas no mesmo ficheiro e na suite de testes.

O resultado esperado é `VERIFICADO: regras publicadas e módulo de avaliação ativo em circ-coimbra.` Para voltar a consultar o resultado, sem alterações:

```bash
python3 scripts/configure-scientific-review.py
```

Se a sessão Google ainda não estiver autorizada, autorizar o terminal com a conta responsável pelo projeto. Uma falha de autenticação ou de comparação das regras impede a ativação.

## Perfis e utilização

### Superavaliador

Os utilizadores já autorizados a gerir submissões, incluindo a administração, passam a ter a área **My CIRC → Superavaliador**, em `/admin/avaliacoes`. Esta permissão continua a ser `users/{uid}.roles.submissions`, além das contas de gestão já existentes. Não atribuir essa permissão a um revisor que deva ter acesso apenas aos seus trabalhos.

1. Abrir **Gerir revisores** e adicionar o nome e o email de cada revisor.
2. O email deve corresponder à conta que o revisor utiliza no My CIRC, com email verificado. Pode ser registado no diretório antes da criação da conta. A aplicação não envia convites nem emails automaticamente.
3. Selecionar um trabalho e atribuir até três revisores ativos. Guardar a atribuição. Só os selecionados passam a ver o trabalho.
4. Consultar as cinco notas de cada revisor, total, média e comentário. A grelha é uma tabela no computador e fichas no telemóvel.
5. Registar a decisão. **Aceite** revela os autores aos revisores atribuídos. **Aceite** e **Não aceite** encerram a pontuação. **Em avaliação** permite reabrir o trabalho; o acesso futuro à identidade volta a ser bloqueado. A aplicação não pode apagar informação que alguém já tenha consultado ou copiado durante a aceitação.

A desativação de um revisor suspende o acesso sem apagar as avaliações. A remoção de uma atribuição retira o trabalho da área do revisor e mantém a avaliação no registo reservado à organização. O comparativo mostra os revisores atualmente atribuídos. Uma nova atribuição ao mesmo revisor recupera a sua avaliação existente.

Antes de eliminar um trabalho, remover todos os revisores e guardar a atribuição. As regras impedem eliminar o original enquanto houver acessos ativos.

### Revisor

Após entrar com o email verificado, a área **As minhas avaliações**, em `/conta/revisoes`, aparece no My CIRC. O revisor pode ler os trabalhos atribuídos e guardar a sua pontuação e comentário. Não pode alterar decisões, atribuições ou avaliações de colegas, nem consultar inscrições ou dados da organização por ter este perfil.

Os campos de autores, nome de contacto e afiliação só são disponibilizados quando o trabalho está aceite. Email do autor, UID e dados administrativos não são enviados à área do revisor. O título e o resumo são conteúdo submetido pelos autores: devem ser redigidos sem identificação. O formulário inclui essa indicação; o supervisor deve confirmar o anonimato do texto antes de distribuir trabalhos. Não há remoção automática de nomes que tenham sido escritos dentro do resumo.

## Grelha

Todos os critérios têm o mesmo peso. Cada nota admite valores de 0 a 10, incluindo decimais até duas casas; zero é uma nota válida, enquanto um campo vazio impede guardar.

| Critério | Escala |
|---|---|
| Qualidade científica e relevância do trabalho | 0–10 |
| Originalidade e inovação | 0–10 |
| Rigor metodológico e científico | 0–10 |
| Relevância e aplicabilidade clínica | 0–10 |
| Impacto e contributo para a prática clínica e para a investigação | 0–10 |

Total individual: **0–50**. Média individual: total ÷ 5. Média global: média das avaliações guardadas dos revisores atribuídos, normalizada para 0–10. Uma avaliação em falta não conta como zero. O comentário é opcional, até 4000 caracteres, e fica reservado ao revisor e aos gestores de submissões. A nota da decisão permanece separada: fica no registo original da submissão, ao qual o autor tem acesso. Os dois formulários de decisão indicam essa distinção.

## Modelo de dados e regras

- `reviewConfiguration/circ-2027`: ativação do módulo; escrita apenas pela administração ou processo de publicação autorizado.
- `scientificReviewers/{email}`: diretório e estado do revisor. Leitura do próprio registo ou pelos gestores; listagem e escrita só pelos gestores.
- `scientificReviewAssignments/{submissionId}`: controlo de até três emails atribuídos, acessível apenas aos gestores.
- `scientificReviewers/{email}/works/{submissionId}`: cópia do conteúdo científico por lista explícita de campos permitidos, com a avaliação individual. O revisor só consulta a sua subcoleção com `active == true`.
- `scientificReviewIdentities/{submissionId}`: autores, contacto por nome e afiliação. Leitura individual só após aceitação, por revisor ativo e atribuído; não admite listagem por revisores.
- `submissions/{submissionId}`: documento original, sem ampliar as permissões de leitura para revisores.
- `auditLogs`: registos de gestão de revisores, atribuições e decisões, sem incluir o texto dos trabalhos ou comentários.

As atribuições e revogações são transações atómicas. As regras exigem a sincronização dos acessos antigos e novos, inclusive quando se substituem três revisores por outros três. A decisão atualiza o original, as cópias atribuídas e a identidade na mesma transação. Clientes antigos não podem mudar o estado de um trabalho atribuído sem atualizar as cópias. Um revisor não pode pontuar um trabalho cuja conta de autor seja a sua própria conta. Outros conflitos de interesse são verificados pelo supervisor antes da atribuição.

As gravações de avaliações e decisões detetam versões desatualizadas. A interface avisa antes de trocar de trabalho com alterações por guardar. Não grava comentários locais em armazenamento persistente. A grelha permite editar a avaliação até à decisão final; não existe um segundo passo de “enviar” depois de guardar.

## Validação

- Testes de cálculo, ausência de campos pessoais, papéis, transações, conflitos de edição e configuração de ativação.
- Emulator Suite: leitura de trabalhos atribuídos, isolamento entre revisores, notas válidas e inválidas, comentários, aceitação, reabertura, desativação, revogação, alterações atómicas, limites de três revisores e proteção contra eliminação com acessos ativos.
- Testes de browser com dados fictícios locais nos tamanhos 1440, 390 e 320 px: preenchimento, gravação, anonimato, aceitação, remoção, diretório, atribuições, comparativo e decisões. A autorização real é verificada separadamente no emulador do Firestore.
- A configuração de ativação deve ser confirmada no Firebase antes do teste final com contas reais. O código publicado, por si só, não ativa as novas regras.

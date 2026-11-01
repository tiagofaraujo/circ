# CIRC 2027 — correções e reenvio de trabalhos

## Comportamento preparado

Após um pedido efetivo de correções da gestão, o autor pode corrigir o título e as
secções do resumo. Tipo, titular, autores, afiliação, contacto, código, criação e
primeira submissão são conservados. Um rascunho privado permite guardar o trabalho
antes do reenvio. Um pedido de correções permite devolver um trabalho existente
mesmo depois do prazo da primeira submissão; não abre novas submissões fora de prazo.

`POST /api/submissions/:id/resubmit` verifica email confirmado, titular, pedido
atual da gestão, versão e timestamps. Uma transação com precondições guarda o
original e as avaliações em `scientificRevisionHistory`, atualiza o original e as
cópias anónimas, limpa a decisão anterior e inicia uma nova versão sem pontuações
ativas. O histórico só é legível pela gestão. O autor não recebe identidades de
revisores. Um separador de revisão antigo não pode guardar uma avaliação contra
uma versão nova do trabalho.

O UUID de reenvio e o hash do pedido impedem duplicações. Repetir exatamente o
pedido devolve o resultado original, mesmo após decisões ou revisões posteriores.
Conflitos de gestão, atribuição, avaliação ou rascunho impedem o commit completo.

## Ordem de publicação obrigatória

1. Publicar o `firestore.rules` deste conjunto e confirmar a versão ativa.
2. Publicar o frontend e o worker.
3. Definir `SCIENTIFIC_CORRECTIONS_ENABLED` como a string `true` e publicar a ativação.
4. Consultar o percurso autenticado sem criar trabalhos fictícios em produção.

O endpoint está desativado por defeito e o Wrangler preparado mantém o valor
`false`. Enquanto as regras não estiverem publicadas, o código de correções deve
ficar numa alteração separada, sem substituir o frontend público. A verificação
isolada usa Firestore Emulator e prestadores de armazenamento simulados, sem
escritas na base de produção nem mensagens aos participantes.

O serviço utiliza a identidade Firestore já usada pelo servidor. Não acrescenta
segredos. A operação precisa de acesso get/create/update/delete às novas coleções.
O carregamento do ficheiro final do póster não faz parte deste percurso.

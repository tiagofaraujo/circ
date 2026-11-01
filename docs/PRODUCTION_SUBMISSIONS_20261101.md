# Submissões científicas — percurso de produção

O Centro de Submissões aceita trabalhos reais de autores com email confirmado,
sem permissões administrativas. O autor pode guardar um rascunho, voltar a
editá-lo, submetê-lo e consultar o estado e o resumo. A eliminação pelo autor
limita-se a rascunhos próprios e volta a verificar o estado na transação.

Os registos usam `isTest: false`, código `CIRC27-…`, dono e contacto da sessão,
datas de servidor e seis secções estruturadas. As consultas ativas excluem
registos de teste e `archived: true`. As permissões de avaliação e o conteúdo
anónimo entregue aos revisores não foram alterados.

Os limites do resumo, a confirmação do email e os prazos de 15/01/2027 (oral)
e 28/02/2027 (póster) são validados no cliente e nas regras Firestore de produção,
com os limites finais em hora de Lisboa. O percurso atual recebe resumos em texto, sem anexos ou upload de
póster final. Depois de submeter, o autor não pode editar o trabalho; as regras
atuais também não permitem edição pelo autor no estado de correções solicitadas.

Validação: testes dos helpers de criação/edição/eliminação, limites e prazos;
testes da interface para autor normal, rascunho, submissão e email não confirmado;
110 testes das regras Firestore, incluindo prazos e tentativas sem email confirmado.

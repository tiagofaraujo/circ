# CIRC 2027 — abertura operacional, 1 de novembro de 2026

## Percursos publicados

| Área | Comportamento preparado nesta alteração | Limites concretos |
| --- | --- | --- |
| Conta | Autenticação Firebase existente; dados de perfil reutilizados | Perfil e email confirmado necessários para as ações relevantes |
| Inscrição | Congresso presencial com tarifas existentes de externo, ULS Coimbra e estudante | Elegibilidade ULS/estudante continua obrigatória |
| Pagamento | Referência Multibanco real, com valor calculado no servidor, revisão dos dados de faturação e confirmação antes de criar | Faturação portuguesa; outros métodos não são anunciados como disponíveis |
| Recuperação | Pedido próprio recuperável pelo identificador persistido ou pela inscrição, sem criar outro pagamento | Resultados incertos ficam bloqueados para conferência |
| Confirmação | Notificação autenticada EuPago e reconciliação no prestador atualizam inscrição e pagamento | Alteração de tarifa ou perda de elegibilidade exige conferência |
| Faturação | FR automática após confirmação, consulta e PDF original no My CIRC | Resultados fiscais incertos nunca são reenviados automaticamente |
| Administração fiscal | Consulta de estado e retoma apenas de erros de autorização conhecidos, após nova leitura e confirmação | Documentos emitidos, reembolsados ou de resultado incerto permanecem protegidos |
| Trabalhos científicos | Criar e editar rascunhos, submeter resumos estruturados, consultar estado e exportar | Comunicações até 15/01/2027; pósteres até 28/02/2027, hora de Lisboa |
| Administração | Gestão de inscrições, submissões, avaliações, empresas, estudantes, secretariado e faturação | As áreas antigas de ensaio deixam de estar montadas |

## O que a revisão encontrou

O formulário público anterior não tinha uma ligação efetiva ao checkout de produção:
mostrava a abertura futura e disponibilizava criação administrativa de inscrições de
ensaio. O servidor possuía um percurso Multibanco real, mas a janela privada já tinha
expirado. A submissão científica também estava limitada à criação de trabalhos de
ensaio por contas autorizadas. A alteração liga os percursos públicos reais existentes,
abre a receção atual e retira essas alternativas administrativas dos ecrãs ativos.

A aplicação não usa o login demonstrativo legado: as rotas ativas utilizam Firebase.
As páginas públicas, preços e informação corrente do Media Center passam a indicar a
abertura de 1 de novembro. Os preços e enquadramentos fiscais não são modificados.

## Retirada dos ensaios

Em produção, as APIs sandbox, simulações fiscais, pré-visualização privada e teste de
rascunho TOConline respondem com HTTP 410. As antigas páginas redirecionam para áreas
reais. O código dos testes automáticos continua a validar o projeto; não é conteúdo
operacional apresentado aos participantes.

A página administrativa `/admin/preparacao` inventaria e arquiva os registos anteriores.
O inventário fixa identificadores e uma data de corte. Cada grupo é novamente conferido
antes da operação. Cópia privada, remoção do ecrã ativo e auditoria são guardadas em
transação. A reposição só recupera identificadores livres e não substitui dados novos.

Pagamentos reais, referências reais ainda em curso e documentos fiscais não são
apagados. Trabalhos com atribuições científicas ativas exigem tratamento das relações
antes de remover o original. Perfis, credenciais, configurações e histórico de auditoria
não pertencem à limpeza de inscrições e trabalhos.

## O que ainda não equivale a operação integral do catálogo

- MB WAY, cartões, carteiras digitais e transferência bancária não têm checkout real
  integrado nesta publicação. Uma operação direta no backoffice EuPago não comprova
  o circuito completo CIRC.
- Compra de cursos, jantar, participação virtual e pedidos complementares continua
  indisponível; o catálogo e os valores são conservados e a limitação é visível.
- A faturação atual exige dados portugueses. Compradores com faturação estrangeira
  precisam de um percurso próprio antes de aceitar pagamento.
- A submissão inicial recebe resumos estruturados em texto; não existe carregamento
  do ficheiro final do póster.
- Depois da submissão, o autor não pode editar o trabalho. Um percurso de reenvio após
  pedido de correções continua por implementar.
- As listas administrativas têm limites existentes de 500 registos; a lista do autor
  tem limite de 100. A paginação deve anteceder a aproximação a esses volumes.

## Verificação

A alteração deve passar pelos testes do servidor, interface, regras Firestore e
compilação, seguidos de consulta em produção. A abertura não é validada com novas
cobranças ou novas faturas reais sem um pedido específico para essas operações.
Não se deve declarar todo o catálogo operacional enquanto os limites acima existirem.

# Pagamentos CIRC 2027 — integração em preparação

Atualização: 28/09/2026. Decisões do organizador: Eupago (conta aprovada e acesso API) e TOConline (faturas-recibo).

## Implementado nesta primeira etapa

`server/payments/quote.mjs` é uma biblioteca de domínio sem rotas nem chamadas externas.
Reutiliza o catálogo de preços do site, calcula em cêntimos e ignora preços/períodos recebidos do navegador. Valida a elegibilidade ULS através dos registos de elegibilidade, claim e roster; estudante através de aprovação associada ao nome, utilizador, evento e ano letivo. Suporta inscrição principal e complementos, incluindo titulares de voucher de empresa. Os complementos não voltam a cobrar o congresso nem concedem direitos durante o orçamento.

Verificação: `node --test server/test/payment-quote.test.mjs` (8 testes).

O módulo NÃO implementa autenticação HTTP, leitura da BD, bloqueios transacionais, reservas de vagas, chamadas Eupago, callback, reconciliação, faturação, notificações ou interface de checkout. Não está importado pelo Worker. Nada foi ativado em produção. As validações deste módulo só serão uma fronteira de segurança quando receberem exclusivamente registos lidos no servidor autenticado.

## Fluxo a implementar

1. Validar token Firebase e email; consultar perfil, elegibilidade e inscrição principal pelo ID `circ-2027-{uid}`.
2. Confirmar abertura do módulo e disponibilidade. Calcular orçamento no servidor; guardar linhas, valor, moeda, dados de faturação e versão da configuração. Não confiar em totais do cliente.
3. Reservar a encomenda e uma tentativa de pagamento numa transação. Chave de idempotência por utilizador/operação; bloquear pagamentos simultâneos da mesma compra e sobreposição de cursos em encomendas pendentes. Revalidar o contexto usado no orçamento dentro da transação.
4. Criar pagamento Eupago com identificador opaco da tentativa. Guardar referência e estado. Um timeout não prova que o pedido falhou: reconciliar antes de repetir. Não colocar dados pessoais em identificadores/URLs de callback.
5. Confirmar o recebimento com o mecanismo autenticado suportado pelo canal Eupago, verificando também a transação junto do prestador. Validar conta/canal, transação, moeda e montante contra a tentativa persistida. Um retorno do navegador nunca confirma pagamento. Callbacks repetidos/fora de ordem não podem repetir efeitos.
6. Numa transação, marcar pagamento recebido, atualizar inscrição/direitos exatamente uma vez e criar tarefa durável de faturação. Resolver pagamentos tardios e reservas expiradas sem apagar recebimentos.
7. Emitir FR no TOConline apenas com configuração fiscal validada. Manter o pagamento como recebido se a faturação falhar. Guardar ID, número e acesso ao PDF. Antes de repetir uma emissão cujo resultado seja incerto, reconciliar; `external_reference` não deve ser assumida como chave idempotente garantida pelo fornecedor.
8. Mostrar estados separados no My CIRC: pagamento e faturação. Manter trilho de auditoria e permitir reconciliação administrativa.

Inscrições individuais continuam previstas para 15/11/2026. Testes precisam de canal/credenciais sandbox Eupago e contexto de faturação de testes confirmado pelo TOConline. Não usar produção para emitir documentos fictícios. A API v1 de vendas do TOConline finaliza documentos na criação.

## Dados ainda necessários

- Canal sandbox Eupago e métodos contratados/ativos; escolher endpoints e autenticação compatíveis com esse canal antes de implementar adaptadores. Documentação consultada cobre MB WAY e Multibanco, mas não comprova ativação na conta.
- Configuração do callback e acesso à consulta de transações para reconciliação.
- Acesso TOConline: Empresa > Dados API (ou Empresa > Configurações > Dados API), com utilizador administrador/empresário. O integrador recebe acesso temporário às credenciais. Obter client ID/secret, URLs OAuth/API e autorização commercial; armazenar/renovar tokens no servidor.
- Contabilidade: série FR, serviços associados ao congresso/cursos/jantar, taxas ou motivos de isenção aplicáveis a cada serviço, conta de recebimento e correspondência de meios de pagamento. Não assumir isenção por se tratar de associação.
- Confirmar necessidades de fatura em nome de empresa distinta do participante e contexto de testes do TOConline.
- Escrita autenticada do backend no Firestore com permissões restritas, armazenamento de segredos e execução durável da faturação/reconciliação. A infraestrutura atual não inclui esta ligação.

Segredos nunca em variáveis REACT_APP, repositório, logs, anexos ou mensagens do chat.

## Documentação oficial consultada

- https://www.eupago.pt/integracoes/api-gateway-pagamento
- https://eupago.readme.io/reference/multibanco
- https://eupago.readme.io/reference/mb-way
- https://api-docs.toconline.pt/setup-do-postman
- https://api-docs.toconline.pt/autenticacao-simplificada
- https://api-docs.toconline.pt/apis/vendas/documentos-de-venda

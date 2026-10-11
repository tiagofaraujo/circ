# Transferência: ID da inscrição, sem comprovativo no percurso normal

Atualização de 11/10/2026, ainda exclusiva do ensaio sandbox. Não ativa IBAN nem transferências reais.

## Regra pedida pela organização

O participante coloca o ID da inscrição na descrição enviada ao beneficiário. Não é necessário anexar comprovativo nem enviar email quando o crédito pode ser identificado. A inscrição só é confirmada pela organização após conferir o movimento, a descrição/ID e o valor; conhecer um ID não constitui prova de recebimento.

## Implementação

- Novos pedidos: `flowVersion=3`; a descrição da primeira transferência corresponde exatamente ao ID da inscrição de teste que já aparece no My CIRC. Não é criado um segundo código para o participante.
- Pedidos seguintes mantêm o ID com o sufixo de sequência (`{id}-2`, por exemplo), para distinguir complementos e novas tentativas de eventuais créditos tardios. O botão copia a descrição completa.
- Descrições e IDs dos pedidos existentes não são recalculados nem migrados. Os testes anteriores continuam utilizáveis e são pesquisáveis também pelo ID da inscrição.
- O formulário de comprovativo saiu do percurso normal. A opção de anexar surge apenas perante um pedido de esclarecimento, continua facultativa e usa ficheiros fictícios no ensaio. Ficheiros anteriores e histórico mantêm-se acessíveis.
- Em novos pedidos v3, o botão «Já fiz a transferência — simular» serve como aviso, não como requisito para confirmar um crédito identificado. Na área da organização, pedidos novos ainda sem aviso também aparecem por defeito e podem ser conferidos. Os pedidos legados mantêm o seu controlo anterior de comunicação/revisão.
- A fila permite pesquisar o ID da inscrição ou a descrição já atribuída, sem chamadas ao banco, sem pedidos à Eupago e sem novas leituras por tecla. Conserva o limite preexistente de 100 sessões e o respetivo aviso.

## Validações preservadas

A confirmação continua administrativa e exige conta autorizada, origem válida, revisão atual do pedido, declaração explícita de conferência do crédito/identificação, valor exato, data não futura e referência única do movimento simulado. Havendo documento já anexado, a sua análise mantém-se exigida. Movimento, pagamento e direitos de teste são gravados atomicamente. Reenvio da mesma decisão não duplica o pagamento; reutilização do movimento noutro pedido é rejeitada. Não há confirmação automática baseada no ID.

MB WAY, Multibanco, configurações do IBAN/titular, regras Firebase, vagas, vouchers, inscrições reais e faturação não foram alterados. A sandbox mantém o IBAN real oculto.

## Testes locais

- Servidor: 192 casos, 191 aprovados, 0 falhas, 1 caso preexistente do Media Center ignorado.
- Interface: 35 suites, 165 testes aprovados.
- Inclui identificação estável, sufixos de pedidos seguintes, aprovação sem comunicação/comprovativo, crédito/valor/revisão obrigatórios, dupla utilização de movimento, ausência de upload no fluxo normal, cópia exata PT/EN, pesquisa de pedidos antigos e fila com pedidos ainda não comunicados.

Os testes usam dados sintéticos e transportes/armazenamento simulados. Não foram realizadas transferências nem alterados registos reais. A aceitação na conta da organização continua a ser um teste externo distinto dos testes automatizados.

## Ensaio de aceitação

Criar uma nova inscrição de teste e selecionar transferência. Confirmar que o ID apresentado e a descrição coincidem e que não aparece pedido de comprovativo. Sem enviar ficheiro nem comunicar a transferência, abrir a área da organização, pesquisar o ID e simular a conferência de um crédito com valor/data/movimento corretos. Confirmar que o pagamento e a inscrição ficam validados e persistem após recarregar. Não efetuar qualquer transferência real.

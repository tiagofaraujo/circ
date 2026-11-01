# CIRC 2027 — validação dos meios de pagamento, 1 de novembro de 2026

## Evidência e resultado

| Meio | Evidência anterior | Resultado desta alteração |
| --- | --- | --- |
| Multibanco | Pagamento real de 95 € e FR CIRC2027/1 confirmados | Mantido; regressões verificadas |
| Transferência bancária | Conferência de teste e rascunho TOConline com TR e conta da empresa aceites | Ligação ao checkout real, conferência administrativa, atualização automática e FR preparadas |
| MB WAY | Ensaio EuPago de 1 € confirmado em 09/10/2026, com notificação recebida | Validação real controlada na conta administradora; categoria genérica OU identificada como inferência e aceitação de vendas ainda por confirmar |
| Visa/Mastercard | Implementação Stripe exclusivamente sandbox; não há ensaio externo de produção documentado | Não anunciado como meio real disponível |
| Apple Pay/Google Pay | Preparação Stripe sandbox; sem aceitação real documentada | Falta integração real e confirmação de ativação no prestador |

Passar um teste automático ou um ensaio sandbox não comprova ativação contratual,
aceitação de uma operação de produção ou emissão fiscal real. A revisão não criou
novas cobranças, não enviou pedidos MB WAY e não emitiu documentos fiscais reais.

## Transferência bancária

O participante escolhe o meio antes de rever o valor e a faturação. O servidor
reserva um UUID e apresenta o IBAN e titular já fornecidos pela organização,
mais uma referência única. O botão para comunicar uma transferência e a sua
observação não confirmam o pagamento.

Em `/admin/transferencias`, a administração confere o crédito no extrato e indica
montante efetivamente recebido, data de crédito e referência bancária. O servidor
confere novamente a elegibilidade e a tarifa pela data do crédito, identifica a
conta por GET a `company_bank_accounts`, e confirma num único commit o pagamento,
a inscrição/direitos, a reserva do crédito, a auditoria e o trabalho fiscal.

O crédito só pode ser associado a um pedido. Um suplemento preserva o pagamento
principal e acrescenta apenas os direitos comprados. O pagamento passa a `paid`
e a inscrição a `confirmed` automaticamente nessa validação administrativa.
A FR usa TR e o identificador bancário obtido na leitura atual; o ID histórico 2
não é assumido. A data do crédito não pode anteceder o dia de criação do pedido.

Uma resposta perdida conserva o UUID da decisão e exige consulta antes de repetir.
Retomar o mesmo pedido não emite outra FR. Falhas OAuth conhecidas dispõem da
retoma administrativa existente; resultados fiscais incertos continuam bloqueados.
O PDF de uma FR bancária emitida fica disponível ao titular do pagamento.

Os novos trabalhos fiscais bancários usam o protocolo `claimed-v1`: o servidor
grava uma reclamação exclusiva antes de chamar o TOConline. Um trabalho `pending`
desse protocolo comprova que a emissão ainda não começou e pode ser retomado
explicitamente pela administração. Uma reclamação em curso ou resultado incerto
nunca é reenviado. Trabalhos antigos sem esse protocolo não ganham essa permissão.

A fila administrativa tem paginação e pesquisa exata pelo UUID indicado no extrato.
Relatórios e observações do participante são apresentados apenas à administração.

Não há carregamento de comprovativos nesta versão. A comunicação do participante
é opcional: o critério de confirmação é a entrada na conta, verificada pela organização.
Pagamentos parciais, créditos agregados para vários pedidos e reembolso bancário
não são automatizados. O módulo de registo de reembolsos existente não foi ampliado.

## MB WAY e cartões

`LIVE_PAYMENT_MAPPING_REGISTRY` regista a versão, código e fonte de cada mapeamento
TOConline. Multibanco usa MB; transferência usa TR. A continuação descrita em
`MBWAY_PRODUCTION_VALIDATION_20261101.md` usa OU como categoria genérica para uma
validação controlada, explicitando a inferência e a ausência de aceitação prévia
comprovada no endpoint de vendas. MB WAY via EuPago fica identificado nas notas.

O adaptador MB WAY valida o telefone português, congela a respetiva impressão no
pedido, apresenta o prazo indicado e reconcilia o callback com o pedido guardado.
A aplicação não guarda nem apresenta o número no objeto público do pagamento.
Não envia outro pedido quando o prazo termina ou quando a resposta é incerta.

As chaves Stripe sandbox são explicitamente test-only; trocá-las por uma chave
real não converte essa integração. A alternativa EuPago para cartões e carteiras
usa a APIkey do canal, mas o prestador exige adesão contratual adicional aprovada.
A existência da chave do canal CIRC não demonstra essa aprovação. A ligação ao
navegador continua indisponível, pelo que o estado da conta não foi inspecionado.

## Publicação

`LIVE_BANK_TRANSFER_ENABLED=true` ativa as instruções bancárias reais, mantendo
as configurações sandbox isoladas. A continuação MB WAY usa
`LIVE_MBWAY_ENABLED=true` com `LIVE_MBWAY_VALIDATION_ONLY=true`: só a administração
o pode validar antes da abertura pública.
`/api/checkout/live/config` é a fonte dos meios apresentados ao participante;
os meios indisponíveis não são anunciados como operacionais.

Esta alteração não depende de novas regras Firestore ou novos segredos.
Os testes usam prestadores simulados, sem aceder à conta bancária ou criar documentos.
As correções científicas do PR 98 permanecem separadas e desativadas.

Verificação local final: 481 testes de servidor passaram e 1 foi ignorado;
358 testes de interface passaram; compilação de produção e `git diff --check`
concluídos. A revisão independente confirmou paginação, privacidade das notas,
claim exclusiva antes da emissão, respostas perdidas e proteção de trabalhos antigos.

## Fontes primárias

- TOConline — códigos dos meios de pagamento e identificação da conta bancária:
  <https://api-docs.toconline.pt/apis/vendas/recibos-de-venda>.
- TOConline — estrutura de documentos de venda e FR:
  <https://api-docs.toconline.pt/apis/vendas/documentos-de-venda>.
- EuPago — cartões Visa/Mastercard, adesão adicional e aprovação:
  <https://eupago.atlassian.net/wiki/spaces/PAYSOFT/pages/223969301>.
- EuPago — Google Pay/Apple Pay, adesão adicional e aprovação:
  <https://eupago.atlassian.net/wiki/spaces/PAYSOFT/pages/1953857539>.

Os resultados do ensaio de MB WAY constam de `CHECKOUT_SANDBOX_20261009.md`.
A fronteira Stripe test-only e os testes ainda não efetuados constam de
`STRIPE_SANDBOX_20261013.md`. Nenhum destes documentos comprova um pagamento live.

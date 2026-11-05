# CIRC 2027 — meios de pagamento em produção

Atualizado em 5 de novembro de 2026. A confirmação de funcionamento real indicada
abaixo foi dada pelo organizador; esta atualização não realiza outra cobrança.

## Evidência e resultado

| Meio | Evidência anterior | Resultado desta alteração |
| --- | --- | --- |
| Multibanco | Pagamento real de 95 € e FR CIRC2027/1 confirmados | Mantido; regressões verificadas |
| Transferência bancária | Pagamento e emissão de recibo reais confirmados pelo organizador | Conferência administrativa, atualização automática e FR em produção |
| MB WAY | Pagamento real confirmado pelo organizador | Abertura a participantes com email verificado; deixa de estar limitado à conta de validação. O relato não identifica a FR/PDF MB WAY |
| Visa/Mastercard | Implementação e ensaios Stripe sandbox; sem pagamento real documentado | Percurso live preparado, dependente de credenciais e webhook de produção e de validação real |
| Apple Pay/Google Pay | Preparação Stripe sandbox; sem aceitação real documentada | Carteiras sobre cartão no novo Hosted Checkout, sujeitas à elegibilidade e configuração da conta |

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
O pagamento MB WAY real foi entretanto confirmado pelo organizador. A abertura
pública do método não altera o mapeamento OU nem constitui confirmação de uma
FR/PDF MB WAY real: essa evidência continua por identificar.

O adaptador MB WAY valida o telefone português, congela a respetiva impressão no
pedido, apresenta o prazo indicado e reconcilia o callback com o pedido guardado.
A aplicação não guarda nem apresenta o número no objeto público do pagamento.
Não envia outro pedido quando o prazo termina ou quando a resposta é incerta.

As chaves Stripe sandbox são explicitamente test-only; trocá-las por uma chave
real não converte essa integração. A alternativa EuPago para cartões e carteiras
usa a APIkey do canal, mas o prestador exige adesão contratual adicional aprovada.
A existência da chave do canal CIRC não demonstra essa aprovação. A continuação
`STRIPE_PRODUCTION_20261101.md` descreve o novo percurso Stripe live separado,
com cartões e carteiras, credenciais próprias, assinatura e reconciliação de
pagamentos, claim fiscal e diagnóstico administrativo.

A consulta autenticada à Stripe em 5 de novembro de 2026 confirmou a conta da
Associação Hemisfério Disciplinado apta a receber pagamentos, sem requisitos
pendentes. Cartão e Apple Pay estavam ativos; Google Pay estava desligado.
O destino live de notificações CIRC estava ativo, com a versão e os quatro
eventos esperados. Esta leitura não confirma os Secrets guardados no Worker
nem a entrega de eventos; não foi encontrada uma Checkout Session live CIRC
na consulta das sessões existentes. A abertura pública Stripe continua pendente
da configuração e da validação real descritas no documento próprio.

## Publicação

`LIVE_BANK_TRANSFER_ENABLED=true` ativa as instruções bancárias reais, mantendo
as configurações sandbox isoladas. Após a confirmação do pagamento real pelo
organizador, MB WAY usa `LIVE_MBWAY_ENABLED=true` com
`LIVE_MBWAY_VALIDATION_ONLY=false`: fica disponível para os participantes com
email verificado, sem depender da allowlist de validação. A conta de validação
não ganha permissões administrativas. As verificações de faturação, elegibilidade,
tarifa, lotação e a confirmação financeira pelo servidor mantêm-se obrigatórias.
Stripe conserva `LIVE_STRIPE_VALIDATION_ONLY=true`, com gates e allowlist próprios;
sem configurações live válidas não é
anunciado no checkout. A integração Stripe requer os dois Secrets de produção
descritos no respetivo documento.
`/api/checkout/live/config` é a fonte dos meios apresentados ao participante;
os meios indisponíveis não são anunciados como operacionais.

A regressão da abertura MB WAY carrega as variáveis publicadas em `wrangler.jsonc`
e exercita a API de checkout com credenciais e prestadores simulados: um
participante verificado fora da allowlist pode criar o pedido MB WAY; um email
não verificado é recusado; Stripe continua indisponível para essa conta. Não
foram criados pagamentos ou documentos reais por estes testes.

Os percursos bancários anteriores não dependem de novas regras Firestore ou segredos.
Os testes usam prestadores simulados, sem aceder à conta bancária ou criar documentos.
As correções científicas do PR 98 permanecem separadas e desativadas.

Verificação da integração bancária: 481 testes de servidor passaram e 1 foi ignorado;
358 testes de interface passaram; compilação de produção e `git diff --check`
concluídos. A revisão independente confirmou paginação, privacidade das notas,
claim exclusiva antes da emissão, respostas perdidas e proteção de trabalhos antigos.
Na continuação Stripe, 619 testes de servidor e 457 de interface passaram,
com um teste de servidor ignorado; a compilação e a revisão independente passaram.

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
A fronteira Stripe test-only consta de `STRIPE_SANDBOX_20261013.md`; esse ensaio
não comprova um pagamento Stripe live. A confirmação MB WAY acima foi dada pelo
organizador, sem uma consulta adicional à conta pela implementação Stripe.

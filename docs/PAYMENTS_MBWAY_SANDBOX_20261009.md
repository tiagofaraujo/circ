# MB WAY sandbox: entidade omitida na criacao — 09/10/2026

## Diagnostico

O suporte Eupago confirmou uma entrega assinada devolvida pelo CIRC com HTTP 422 e `attempt_mismatch`. O corpo enviado usa `transaction`, metodo `MW:PT`, entidade textual de cinco digitos, montante `1.00` EUR e uma data com segundos sem fuso. Esse formato ja era reconhecido pelo parser. O erro ocorre depois, na comparacao com a tentativa persistida.

A resposta de criacao MB WAY pode nao incluir `entidade`; o adaptador guarda entao `entity: null`. A notificacao pode incluir uma entidade. A comparacao incondicional de `null` com a entidade da notificacao rejeitava esse percurso. O caso foi reproduzido localmente com o formato fornecido pelo suporte, identificadores ficticios, assinatura de teste e uma tentativa MB WAY sem entidade.

## Correcao limitada ao webhook sandbox

- A excecao aplica-se exclusivamente a uma tentativa existente MB WAY com entidade ausente. Uma entidade ja conhecida e diferente continua a ser rejeitada; Multibanco mantem correspondencia estrita.
- Antes de preencher a entidade ou guardar o recibo neste caso, o servidor consulta a referencia com a chave da sandbox. O adaptador existente exige que a resposta coincida na referencia, no identificador completo e na entidade. A entidade nao e aceite apenas por aparecer na notificacao, nem e fixada a um valor especifico do canal.
- Depois dessa verificacao, entidade e recibo sao guardados com precondicao de versao. O estado final `sandbox_paid` so e guardado se a consulta indicar `paga`, `pago` ou `transferida`. Codigo numerico zero nao confirma pagamento.
- Assinatura HMAC sobre os bytes originais, canal, proprietario, identificador, referencia, metodo, montante, moeda, identificador da transacao e protecoes contra repeticao/conflitos continuam ativos.
- Entidades malformadas sao rejeitadas pelo parser. Nao sao convertidas silenciosamente em entidade ausente.
- Falhas transitorias devolvem 503. Uma resposta autenticada que nao corresponda a referencia/identificador/entidade devolve 422 sem preencher a entidade em falta nem guardar um recibo novo. Uma entrega identica ja concluida devolve 200 sem novas escritas.
- Nenhuma alteracao em chaves, URLs, permissões, checkout, inscricoes, pagamentos de producao ou faturacao. O recibo e a entidade so podem ser reconciliados pela rota existente, a partir de notificacao assinada e consulta autenticada. Nao editar manualmente o pagamento na base de dados.

## Validacao

Nova bateria: `server/test/sandbox-mbway-entity.test.mjs` — 27 testes.

Inclui a omissao de entidade na criacao, conferencia independente, resposta sem entidade ou com dados diferentes, assinaturas invalidas, montante/moeda/canal/metodo/proprietario incorretos, fronteira sandbox/producao, indisponibilidade, falhas de armazenamento, estado pendente, codigo zero, reenvio, concorrencia, tentativa ja consultada manualmente e regressao Multibanco.

A bateria especifica passou localmente com o handler, o adaptador Eupago e HMAC reais do codigo, usando transporte, armazenamento e identidade de servico simulados. O teste principal falha com HTTP 422 na versao anterior e passa com HTTP 200 na versao corrigida. Nao foram feitos pedidos reais de pagamento nem obtidas credenciais. Esta execucao nao e uma compilacao integral do frontend nem um teste de OAuth/Firestore reais.

Para executar num checkout com as dependencias do projeto instaladas:

```sh
node --test server/test/sandbox-mbway-entity.test.mjs server/test/sandbox-webhook.test.mjs server/test/eupago-sandbox.test.mjs server/test/sandbox-api.test.mjs
npm run build
```

## Validacao externa ainda necessaria

Depois de confirmar a publicacao do Worker `circ`, pedir ao suporte o reenvio da mesma notificacao assinada, sem gerar outra referencia. Nao reconstruir a assinatura a partir do JSON do email nem enviar callbacks fabricados para o servidor real.

Criterio: resposta HTTP 200, estado `Pagamento de teste validado por notificacao e consulta a Eupago`, notificacao recebida/validada e resultado persistente depois de recarregar o CIRC. Uma consulta manual de estado continua a nao substituir essa notificacao. A publicacao e os testes locais, por si so, nao comprovam que a transacao real da sandbox ja foi reconciliada.

Se a consulta de referencia nao devolver entidade, a correcao mantem a rejeicao segura; obter do suporte o contrato dessa resposta em vez de remover a verificacao.

## Fontes tecnicas

- https://docs.eupago.pt/reference/mb-way
- https://docs.eupago.pt/reference/reference-information
- https://docs.eupago.pt/reference/realtime-webhooks-20
- Complementa `docs/PAYMENTS_2027.md`.

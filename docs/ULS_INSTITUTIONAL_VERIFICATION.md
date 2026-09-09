# Validação institucional ULS Coimbra

Estado: implementação preparada; envio real desativado por defeito. Não há importação da lista nem configuração de credenciais neste commit.

O primeiro ensaio está limitado à conta pessoal `araujotiagofc@gmail.com`, através de `ULS_PILOT_EMAILS` no backend e `REACT_APP_ULS_PILOT_EMAILS` no frontend. A autorização efetiva é sempre verificada no backend contra o email atual da conta Firebase; a verificação do browser serve apenas para apresentar o estado correto. Foi encontrada uma única correspondência para este membro na lista fornecida. O respetivo MEC não é guardado no repositório: para o piloto importa-se apenas essa entrada por um ficheiro privado.

## Comportamento

O participante utiliza a conta My CIRC habitual. Ao selecionar Congressista ULS Coimbra, indica o MEC e confirma um código enviado exclusivamente para `MEC@ulscoimbra.min-saude.pt`. Este formato foi confirmado pela organização. O email de autenticação da conta permanece igual.

A lista fornecida contém 125 MEC distintos de TSDT de Radiologia. Só se importa o MEC; nomes e local de trabalho não são necessários para este mecanismo. A lista não está neste repositório. A organização deve confirmar a lista de elegíveis de cada edição e acrescentar outros profissionais se a categoria os abranger.

O código tem seis algarismos aleatórios, validade de 10 minutos e no máximo cinco tentativas. O reenvio exige 60 segundos e invalida o desafio anterior. Limites por hora: cinco pedidos por conta e por MEC, 30 por endereço IP e 200 no conjunto do serviço. O limite por IP deve ser revisto se a rede hospitalar concentrar muitos pedidos no mesmo endereço; não se deve remover os limites por conta e MEC. IPs nos contadores são protegidos por HMAC. A API não revela se um MEC existe, foi revogado ou já está associado a outra conta.

A posse do email institucional é a prova usada para atribuir a categoria. Não se deve aceitar um destino de email enviado pelo browser. A associação MEC–conta é concluída numa transação, impedindo duas confirmações simultâneas de atribuírem o mesmo MEC. O código guardado é um HMAC, nunca texto simples, e é removido após confirmação ou bloqueio. O envio SMTP ocorre fora da transação para que uma repetição interna da transação não repita o email.

## Dados e permissões

| Coleção | Conteúdo | Acesso do cliente |
| --- | --- | --- |
| `ulsRoster/{mec}` | Elegibilidade da lista, edição, ativo, data de importação | Nenhum |
| `ulsChallenges/{uid}` | Desafio, HMAC, tentativas, expiração | Nenhum |
| `ulsMecClaims/{eventId_mec}` | Associação exclusiva entre MEC e conta | Nenhum |
| `ulsEligibility/{uid}` | Estado verificado, MEC, email institucional e data | Leitura pelo próprio e administrador; escrita apenas no servidor |
| `ulsRateLimits/{key}` | Contadores e expiração | Nenhum |
| `auditLogs/uls_{challengeId}` | Conta, ação, edição e data | Regras administrativas existentes |

Guardar um campo `ulsVerified` em `users/{uid}`, em localStorage ou no formulário não concede elegibilidade. As funções usam a identidade do token Firebase e verificam também a conta no Firebase Auth, incluindo contas desativadas, eliminadas e sessões revogadas. Nunca aceitam UID ou destinatário como autoridade a partir do pedido.

## Ativação no Firebase

Requer Node 22 e uma conta com permissões de implementação no projeto Firebase correto. Cloud Functions exige o plano Blaze. Não ativar faturação ou contratar um fornecedor automaticamente.

1. Instalar as dependências de `functions/package.json`, gerar e rever o respetivo lockfile, e executar `npm test` nessa pasta. Preservar o lockfile existente da aplicação React.
2. Configurar em Secret Manager `ULS_OTP_SECRET` com pelo menos 32 bytes aleatórios e `ULS_SMTP_CONFIG` com o objeto JSON abaixo. Usar os comandos `firebase functions:secrets:set ULS_OTP_SECRET --project <projeto>` e `firebase functions:secrets:set ULS_SMTP_CONFIG --project <projeto>`. Introduzir os valores no terminal seguro, nunca no GitHub, em variáveis `REACT_APP_*` ou no chat.

```json
{
  "host": "smtp-do-fornecedor",
  "port": 587,
  "user": "utilizador-smtp",
  "pass": "credencial-smtp",
  "from": "endereco-remetente-autorizado"
}
```

O remetente tem de ser um endereço simples autorizado pelo fornecedor. O adaptador exige TLS com certificados válidos, usando 587/STARTTLS ou 465/TLS. Configurar SPF/DKIM e o remetente conforme o fornecedor escolhido. A aceitação SMTP não comprova chegada à caixa de entrada: validar a entrega no domínio institucional antes de abrir o serviço.

3. Preparar um JSON privado com uma lista de MEC em texto a partir da primeira coluna do Excel, excluindo o cabeçalho. No piloto, incluir apenas o MEC correspondente à conta autorizada. Conservar os identificadores exatos, sem preencher zeros nem os eliminar. Não adicionar nomes, emails, localização ou outros campos. Manter esse ficheiro fora do repositório. O importador rejeita duplicados e entradas vazias e tem modo de simulação por defeito:

```sh
node functions/scripts/import-uls-roster.js --file /caminho-privado/mec-list.json --project <projeto>
node functions/scripts/import-uls-roster.js --file /caminho-privado/mec-list.json --project <projeto> --apply
```

O importador usa Application Default Credentials. Reimportar não altera entradas existentes nem reativa MEC revogados. O projeto de destino é sempre obrigatório. Para os dados fornecidos, confirmar 125 registos no ensaio e na importação.

4. Rever/testar as regras no emulador Firestore e publicar as regras e as duas funções com o identificador do projeto explícito. A configuração `firebase.json` adiciona apenas o codebase `uls-verification`, preservando Firestore e Storage. As funções estão na região `europe-west1`; confirmar a região da base existente e alinhar frontend/backend caso se escolha outra.
5. Configurar `ULS_VERIFICATION_ENABLED=true` e `ULS_PILOT_EMAILS=araujotiagofc@gmail.com` nas funções e voltar a publicá-las depois de validar as configurações. Os domínios CORS de produção autorizados são `https://circ-coimbra.org` e `https://www.circ-coimbra.org`. Adicionar explicitamente o domínio de staging se necessário. Não usar origens universais como substituto de configuração.
6. Ativar `REACT_APP_ULS_VERIFICATION_ENABLED=true` e definir `REACT_APP_ULS_PILOT_EMAILS=araujotiagofc@gmail.com` no ambiente de build do site antes de reconstruir a aplicação. `REACT_APP_ULS_FUNCTIONS_REGION` deve corresponder à região das funções. Nenhum destes parâmetros públicos contém credenciais.
7. Fazer um ensaio autorizado com uma caixa institucional real, verificar entrada/spam, código errado, confirmação, refresh, nova sessão e tentativa de reutilização noutra conta. O ensaio não deve ser enviado em massa.

Configurar TTL no campo `deleteAfter` de `ulsChallenges` e `ulsRateLimits`. A expiração dos códigos e limites é verificada pelo servidor independentemente do atraso de limpeza TTL. A remoção dos registos de elegibilidade e auditoria da edição segue a política de conservação definida pela organização. Não colocar credenciais de administração no browser nem conceder acesso público às coleções.

## Inscrições e pagamentos

Neste ramo, as inscrições reais ainda não têm checkout/pagamento implementado. O formulário existente permite simulações administrativas marcadas como teste. Esta alteração não abre inscrições nem cria cobranças.

As regras passam a exigir elegibilidade para escritas de inscrições ULS reais e respetivos complementos feitas pelos clientes autorizados. As simulações administrativas mantêm o marcador de teste e não representam validação institucional real.

Antes de ativar Eupago ou outro checkout, chamar `requireUlsEligibility(tx, uid, selection)` de `functions/ulsVerification.js` **na mesma transação que cria a encomenda**, também para cursos com `courseAffiliation: 'uls'`. Esta função revalida a lista ativa, a edição e a associação exclusiva. O adapter `tx.get(path)` devolve os dados do documento ou null. Efetuar todas as leituras antes das escritas.

O Admin SDK contorna as regras Firestore: por isso a verificação do backend é obrigatória. A futura função de checkout tem também de validar a seleção e calcular o preço a partir do catálogo do servidor, nunca aceitar o total do browser como autoridade. Este commit prepara esse guard, não implementa o checkout completo.

## Recuperação e operação

Não libertar automaticamente um MEC quando alguém elimina a conta: isso permitiria contornar a associação exclusiva. Para recuperar uma conta ou transferir o MEC, o responsável confirma novamente a identidade por um canal institucional e executa uma operação administrativa que revoga a elegibilidade anterior e atualiza a associação atomicamente, com auditoria. Este commit não acrescenta um botão público para transferir MECs.

Para revogar a elegibilidade, marcar a entrada da lista como inativa e a elegibilidade como revogada. A conferência no checkout verifica a lista mesmo que o browser tenha ainda uma leitura em cache. Rotacionar o segredo invalida códigos e contadores HMAC anteriores, mas não elimina as associações confirmadas.

Limitar a conta de serviço às permissões necessárias, monitorizar erros e consumo e rever os limites antes da abertura das inscrições. Não registar códigos, credenciais SMTP, destinatários ou respostas integrais do fornecedor em logs.

## Verificação realizada nesta alteração

Testes locais do serviço com armazenamento e email simulados: destinatário institucional, MEC inválido/desconhecido/inativo, HMAC, validade, cinco tentativas, reenvio, limite por conta, isolamento entre contas, confirmações concorrentes, repetição idempotente, falha de email e revogação na conferência para checkout.

Não foram enviados emails, importados colaboradores no Firebase ou publicadas funções/regras. Build completo React, instalação das dependências de produção, emulador Firestore e entrega SMTP real são verificações pendentes antes de ativar.

Referências: [funções callable](https://firebase.google.com/docs/functions/callable-reference), [segredos](https://firebase.google.com/docs/functions/config-env), [transações](https://firebase.google.com/docs/firestore/manage-data/transactions), [proteção de documentos](https://firebase.google.com/docs/firestore/security/rules-fields), [SMTP/TLS](https://nodemailer.com/smtp), [plano para Cloud Functions](https://firebase.google.com/docs/functions/get-started).

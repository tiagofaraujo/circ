# Preparação das notificações My CIRC

Estado: adesão aberta a todas as contas verificadas (`PUSH_ENABLED=true`, `PUSH_TEST_ONLY=false`). Os novos avisos da organização têm envio automático (`PUSH_ANNOUNCEMENTS_ENABLED=true`), com a permissão expressa do dispositivo. As chaves VAPID já estão configuradas no Worker. As felicitações privadas mantêm consentimento separado e envio desligado (`PUSH_BIRTHDAY_ENABLED=false`). A limpeza permanece ativa. A receção/apresentação física num telemóvel não é comprovada pelos testes automatizados.

## Publicações da organização

- O administrador `circ.chuc@gmail.com` cria avisos em `/admin/notificacoes`. O formulário apresenta pré-visualização e destinatários; «Publicar e notificar todos» guarda o aviso e coloca o envio em fila, numa única transação Firestore. Não é necessário manter o navegador aberto.
- `GET /api/notifications`: últimos 20 avisos para qualquer conta verificada, independentemente da adesão a push. Só o administrador recebe as contagens de processamento. Não há conteúdo HTML executável nem destinos externos fornecidos pelo administrador.
- `POST /api/notifications`: apenas o administrador verificado, mesma origem, UUID de pedido, título até 80 caracteres e mensagem até 1000. Tentativas repetidas com o mesmo identificador e conteúdo são idempotentes; conteúdo diferente é recusado. Após resposta incerta, o formulário mantém o pedido para confirmação sem duplicar.
- A coleção `notifications` e os trabalhos `pushAnnouncementJobs` são exclusivamente do servidor, abrangidos pela negação por defeito das regras Firestore. Nenhuma nova permissão de cliente é necessária.
- Um cron separado `* * * * *` inicia/retoma o trabalho automaticamente. Cada execução faz no máximo 8 reservas/envios e 3 páginas de 100 subscrições; a execução de aniversários mantém o seu orçamento separado. Usa uma reserva temporária de 120 segundos e cursor com controlo de revisão. Não há subscrição paga nem alteração de plano.
- Só são elegíveis dispositivos com consentimento anterior à publicação e ainda válido. O envio revalida atomicamente a revisão da subscrição: a desativação anterior à reserva bloqueia-o. O consentimento de aniversário não é necessário para avisos gerais.
- `pushAnnouncementDeliveries` guarda apenas um hash por aviso/conta/dispositivo e uma expiração de 30 dias. A reserva precede o envio: falhas e resultados incertos não são repetidos automaticamente. Se houver falha após reserva e antes do envio, a mensagem pode não chegar; o aviso continua disponível na app. As contagens são as confirmadas no último lote gravado.
- Avisos em fila expiram ao fim de 7 dias; TTL no prestador de push: 1 hora. Não há reenvio de publicações antigas para novas adesões. A aceitação pelo prestador não comprova entrega ou apresentação. Os registos de execução contêm apenas contagens.
- Na página Notificações, a lista atualiza ao regressar à janela, receber um push ou carregar em Atualizar avisos. Não existe consulta permanente à base de dados em cada dispositivo.
- Para suspender só os avisos automáticos: `PUSH_ANNOUNCEMENTS_ENABLED=false`; `PUSH_ENABLED=false` suspende todo o push. A lista de avisos continua legível.

## Registo do piloto anterior

As instruções seguintes documentam a preparação e aceitação por dispositivo. A abertura dos avisos gerais acima foi autorizada separadamente; não ativa as felicitações de aniversário.

## Ativação e aceitação

1. Num checkout local privado, executar `node scripts/create-push-keys.mjs`. O ficheiro `.push-secrets.json` é ignorado pelo Git, tem permissões 0600 e não pode ser sobrescrito pelo script.
2. Importar no Worker Cloudflare **circ**, na conta do congresso: `npx wrangler secret bulk .push-secrets.json --name circ`. As chaves chamam-se `PUSH_VAPID_PUBLIC_KEY` e `PUSH_VAPID_PRIVATE_KEY`. A chave privada nunca deve entrar no Git, frontend, mensagens ou ficheiro de vouchers. Guardar o par de forma segura; não o regenerar a cada publicação.
3. Confirmar que a identidade `FIREBASE_PAYMENTS_SERVICE_ACCOUNT` já utilizada pelo servidor pode ler/escrever `pushSubscriptions`. Não criar permissões de escrita para o cliente. A coleção fica abrangida pela negação por defeito das regras Firestore existentes.
4. Manter `PUSH_RETENTION_ENABLED=true`. O projeto Firebase usa Spark; a limpeza é feita pelo servidor, sem exigir o TTL gerido do plano pago. A validade continua a ser verificada antes de qualquer envio: 90 dias, ou 400 dias com consentimento de aniversário.
5. Alterar **no wrangler.jsonc versionado** `PUSH_ENABLED` para `true`, manter `PUSH_TEST_ONLY=true` e publicar. Não alterar apenas variáveis do painel que serão repostas pelo próximo deploy. A API só permite adesão se o par de chaves for válido e a identidade de armazenamento existir. A presença da identidade não prova as suas permissões: confirmar no teste real.
6. No telemóvel, entrar com `circ.chuc@gmail.com`. No iPhone/iPad (iOS 16.4+), instalar primeiro no ecrã principal e abrir pelo ícone. Aceder a **Mais opções → Notificações**, ativar e autorizar no navegador. Em Android, usar Chrome atualizado. São também aceites Firefox e Safari compatíveis.
7. Premir **Enviar teste para este dispositivo**. Confirmar visualmente a notificação com a app em segundo plano e o acesso a `/conta/notificacoes` ao tocar. A resposta `accepted` apenas prova aceitação pelo prestador, não entrega/apresentação. Repetir num iPhone e num Android, testar recusa e desativação. Nunca solicitar permissões automaticamente ao abrir uma página.
8. Confirmar permissões do servidor para `pushSubscriptions`, `pushBirthdayDeliveries`, `pushJobs/birthday` e leitura dos campos mínimos de `users`. A reserva de envio expira em 400 dias e é removida pela mesma limpeza. Não abrir regras ao cliente.
9. Após aceitação nos dispositivos reais, publicar `PUSH_BIRTHDAY_ENABLED=true`, inicialmente mantendo `PUSH_TEST_ONLY=true`. Abrir adesões com `PUSH_TEST_ONLY=false` apenas depois dessa validação. São controlos versionados, não apenas alterações no painel. A subscrição antiga não implica consentimento de aniversário. Não alterar datas de nascimento reais para testar; usar as simulações automatizadas para datas, concorrência e destinatários.

## Implementação

- `GET /api/push/config`: disponibilidade e chave pública, sem credenciais privadas.
- `POST /api/push/subscriptions`: consentimento explícito, conta verificada, inscrição deste dispositivo; `DELETE` cancela mesmo com envio suspenso.
- `POST /api/push/status`: estado da inscrição atual, sem expor registos de outras contas.
- `POST /api/push/birthday`: guardar ou retirar consentimento do próprio dispositivo. Ativação exige uma data de nascimento válida no perfil autenticado. O cliente não escolhe o destinatário nem fornece data/nome para o envio.
- `POST /api/push/test`: apenas organizador, apenas dispositivo próprio inscrito, uma tentativa por minuto. Reserva por revisão Firestore antes do envio impede repetições concorrentes. Os avisos gerais usam o endpoint administrativo separado descrito acima.
- Web Push com cifragem AES128GCM e autenticação VAPID através de `web-push`; pedido HTTP por `fetch`, compatível com Workers `nodejs_compat`. TTL do teste: 5 minutos.
- Endpoints permitidos: FCM, Apple Web Push e Mozilla. Não aceitar URLs arbitrários nem seguir redirecionamentos. Não registar endpoints/chaves/payloads em logs.
- Firestore guarda apenas UID, subscrição do dispositivo, idioma, datas de consentimento/expiração e limite do teste. IDs derivados de SHA-256 do endpoint. Atualizações e remoções usam precondição de revisão.
- A permissão é por dispositivo. Terminar sessão tenta cancelar a subscrição no navegador e no servidor; sem rede, a remoção remota pode aguardar a expiração e limpeza. Se a conta mudar sem logout, um dispositivo ainda associado à outra conta deve ser desativado e reativado, nunca silenciosamente transferido.
- O service worker mantém a política anterior de não guardar dados pessoais em cache. Mostra sempre notificação visível e limita destinos a vistas conhecidas; um clique não substitui formulários abertos.

## Suspensão e limites

Publicar `PUSH_ENABLED=false` suspende novas adesões e testes; mantém a desativação. Mensagens já aceites pelo prestador podem chegar até ao TTL. Revogação nas definições do sistema é sempre possível. Notificações são complementares: o estado oficial de inscrições, pagamentos e documentos continua no My CIRC.

Uma subscrição local pode expirar, ser revogada ou perder-se ao limpar dados. A página consulta o servidor antes de mostrar «ativadas»; uma autorização sem registo não conta como adesão. Uma confirmação de envio não garante entrega. Não enviar dados financeiros, idade ou data de nascimento para o ecrã bloqueado. O primeiro nome na felicitação está explicado no consentimento.

Fontes técnicas: [WebKit, Web Push no iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Cloudflare, Push notifications](https://developers.cloudflare.com/agents/agent-class/communication-channels/webhooks/push-notifications/), [web-push](https://github.com/web-push-libs/web-push).

## Aniversários privados

- Mensagem PT: «Parabéns, Tiago! A equipa do CIRC deseja-lhe um dia muito feliz.» A versão inglesa usa o idioma guardado no dispositivo. Nomes ausentes ou inválidos recebem uma saudação genérica.
- Cron versionado `0-14 8,9 * * *` (UTC): só as execuções entre 09h00 e 09h14 em `Europe/Lisbon` avançam. O processamento começa às 09h00 e continua em lotes nos minutos seguintes. Isto acompanha o horário de verão. Execuções atrasadas mais de 15 minutos são ignoradas. Para nascimentos a 29 de fevereiro, o dia escolhido nos anos comuns é 28 de fevereiro.
- O servidor consulta apenas subscrições com consentimento explícito, não expiradas; pagina 100 de cada vez e lê somente nome/data de nascimento dos respetivos UIDs num único `batchGet` por página. A data atual do perfil é revalidada em cada envio, sem duplicá-la nas subscrições. Contas sem perfil ou sem data válida não recebem mensagens.
- Antes de contactar o prestador, um commit atómico verifica as revisões da subscrição e do perfil e cria uma reserva única por UID/dispositivo/ano. Remoções, mudança de conta ou retirada de consentimento antes dessa reserva bloqueiam o envio. O registo de reserva contém apenas TTL; o identificador é um hash. Reativar a mesma subscrição não repete a felicitação desse ano.
- Uma tentativa por dispositivo e ano: falhas ou respostas incertas depois da reserva não são reenviadas automaticamente, para evitar duplicações. `accepted` significa aceitação pelo prestador, não entrega. TTL de entrega: uma hora, evitando mensagens pendentes durante dias.
- A reserva e o envio externo não são uma transação única. Uma revogação imediatamente depois da reserva pode coincidir com um envio já iniciado; mensagens já aceites podem aparecer até ao TTL.
- O piloto envia apenas para subscrições marcadas como conta organizadora pelo token verificado no momento da adesão; nunca confia no email editável do perfil. Não existe lista pública de aniversários nem endpoint de envio escolhido por terceiros. Os registos de execução incluem apenas contagens, nunca nomes/datas/mensagens/endpoints.
- `PUSH_BIRTHDAY_ENABLED=false` suspende só as felicitações; `PUSH_ENABLED=false` suspende todo o envio. Retirar consentimento e cancelar subscrições continuam disponíveis.
- O plano Workers Free tem 50 subpedidos por execução. Cada lote usa um orçamento conservador de 38 para pesquisa/envios, no máximo três páginas e cinco tentativas de envio; a autenticação, progresso e limpeza ficam fora desse orçamento mas dentro do limite global. O cursor diário em `pushJobs/birthday` é guardado com precondição de revisão; a execução seguinte retoma depois do último dispositivo processado. O registo anual continua a impedir duplicados em execuções concorrentes.
- Monitorizar `failed`, `progressSaved=false`, `incomplete=true` no último minuto e erros de CPU/quota do Worker. O limite teórico da janela é 4500 subscrições verificadas ou 75 tentativas de envio por dia, sendo menor quando há falhas ou muitas entregas. Acima desses limites é necessário redimensionar a janela/processamento. Confirmar consumo real no piloto; os testes não comprovam quotas ou permissões do fornecedor.

Referências: [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Scheduled Handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/), [Firestore StructuredQuery](https://firebase.google.com/docs/firestore/reference/rest/v1/StructuredQuery).

A autorização de aniversário prolonga a subscrição por 400 dias desde a adesão/ativação explícita, cobrindo o próximo aniversário mesmo que ocorra daqui a um ano. A retirada deste consentimento reduz a validade restante ao máximo de 90 dias. Não se prolonga silenciosamente a validade só por consultar o estado; após expirar, é necessário voltar a ativar.

## Limpeza automática sem mudança de plano

Às 08h00 e 09h00 UTC, independentemente dos interruptores de envio, o servidor consulta até 100 registos expirados em cada uma das três coleções de push. Lê apenas `expiresAt`, valida o caminho e identificador SHA-256, e elimina cada registo com precondição `updateTime` através de `batchWrite`. Uma renovação concorrente é preservada. Não consulta nem elimina utilizadores, inscrições, pagamentos ou faturação. São no máximo seis pedidos Firestore por execução; lotes completos e erros são contados sem dados pessoais. A remoção é assíncrona após a expiração; monitorizar `fullBatches` repetidos e dimensionar o limite se houver acumulação. O cursor diário é um único registo técnico substituído a cada dia, sem nome nem data de nascimento.

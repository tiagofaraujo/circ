# Preparação das notificações My CIRC

Estado inicial: publicado com `PUSH_ENABLED=false`, `PUSH_TEST_ONLY=true` e `PUSH_BIRTHDAY_ENABLED=false`. Não há pedidos automáticos de autorização, envios em massa, campanhas, alertas de pagamento ou lembretes de favoritos. A adesão e o teste por dispositivo ficam reservados a `circ.chuc@gmail.com` durante o piloto. A primeira finalidade implementada é uma felicitação privada de aniversário, com consentimento próprio e envio automático ainda desligado.

## Ativação e aceitação

1. Num checkout local privado, executar `node scripts/create-push-keys.mjs`. O ficheiro `.push-secrets.json` é ignorado pelo Git, tem permissões 0600 e não pode ser sobrescrito pelo script.
2. Importar no Worker Cloudflare **circ**, na conta do congresso: `npx wrangler secret bulk .push-secrets.json --name circ`. As chaves chamam-se `PUSH_VAPID_PUBLIC_KEY` e `PUSH_VAPID_PRIVATE_KEY`. A chave privada nunca deve entrar no Git, frontend, mensagens ou ficheiro de vouchers. Guardar o par de forma segura; não o regenerar a cada publicação.
3. Confirmar que a identidade `FIREBASE_PAYMENTS_SERVICE_ACCOUNT` já utilizada pelo servidor pode ler/escrever `pushSubscriptions`. Não criar permissões de escrita para o cliente. A coleção fica abrangida pela negação por defeito das regras Firestore existentes.
4. Ativar uma política TTL de Firestore para o campo `expiresAt` do grupo de coleções `pushSubscriptions`. Cada adesão expira após 90 dias, ou 400 dias quando inclui consentimento de aniversário; a aplicação deixa de a considerar ativa mesmo antes da remoção assíncrona pelo TTL.
5. Alterar **no wrangler.jsonc versionado** `PUSH_ENABLED` para `true`, manter `PUSH_TEST_ONLY=true` e publicar. Não alterar apenas variáveis do painel que serão repostas pelo próximo deploy. A API só permite adesão se o par de chaves for válido e a identidade de armazenamento existir. A presença da identidade não prova as suas permissões: confirmar no teste real.
6. No telemóvel, entrar com `circ.chuc@gmail.com`. No iPhone/iPad (iOS 16.4+), instalar primeiro no ecrã principal e abrir pelo ícone. Aceder a **Mais opções → Notificações**, ativar e autorizar no navegador. Em Android, usar Chrome atualizado. São também aceites Firefox e Safari compatíveis.
7. Premir **Enviar teste para este dispositivo**. Confirmar visualmente a notificação com a app em segundo plano e o acesso a `/conta/notificacoes` ao tocar. A resposta `accepted` apenas prova aceitação pelo prestador, não entrega/apresentação. Repetir num iPhone e num Android, testar recusa e desativação. Nunca solicitar permissões automaticamente ao abrir uma página.
8. Configurar também TTL `pushBirthdayDeliveries.expiresAt` (400 dias) e confirmar permissões do servidor para ler os campos mínimos de `users`, consultar subscrições e executar o commit de reserva. Não abrir regras ao cliente.
9. Após aceitação nos dispositivos reais, publicar `PUSH_BIRTHDAY_ENABLED=true`, inicialmente mantendo `PUSH_TEST_ONLY=true`. Abrir adesões com `PUSH_TEST_ONLY=false` apenas depois dessa validação. São controlos versionados, não apenas alterações no painel. A subscrição antiga não implica consentimento de aniversário. Não alterar datas de nascimento reais para testar; usar as simulações automatizadas para datas, concorrência e destinatários.

## Implementação

- `GET /api/push/config`: disponibilidade e chave pública, sem credenciais privadas.
- `POST /api/push/subscriptions`: consentimento explícito, conta verificada, inscrição deste dispositivo; `DELETE` cancela mesmo com envio suspenso.
- `POST /api/push/status`: estado da inscrição atual, sem expor registos de outras contas.
- `POST /api/push/birthday`: guardar ou retirar consentimento do próprio dispositivo. Ativação exige uma data de nascimento válida no perfil autenticado. O cliente não escolhe o destinatário nem fornece data/nome para o envio.
- `POST /api/push/test`: apenas organizador, apenas dispositivo próprio inscrito, uma tentativa por minuto. Reserva por revisão Firestore antes do envio impede repetições concorrentes. Não existe endpoint de envio em massa.
- Web Push com cifragem AES128GCM e autenticação VAPID através de `web-push`; pedido HTTP por `fetch`, compatível com Workers `nodejs_compat`. TTL do teste: 5 minutos.
- Endpoints permitidos: FCM, Apple Web Push e Mozilla. Não aceitar URLs arbitrários nem seguir redirecionamentos. Não registar endpoints/chaves/payloads em logs.
- Firestore guarda apenas UID, subscrição do dispositivo, idioma, datas de consentimento/expiração e limite do teste. IDs derivados de SHA-256 do endpoint. Atualizações e remoções usam precondição de revisão.
- A permissão é por dispositivo. Terminar sessão tenta cancelar a subscrição no navegador e no servidor; sem rede, a remoção remota pode aguardar o TTL. Se a conta mudar sem logout, um dispositivo ainda associado à outra conta deve ser desativado e reativado, nunca silenciosamente transferido.
- O service worker mantém a política anterior de não guardar dados pessoais em cache. Mostra sempre notificação visível e limita destinos a vistas conhecidas; um clique não substitui formulários abertos.

## Suspensão e limites

Publicar `PUSH_ENABLED=false` suspende novas adesões e testes; mantém a desativação. Mensagens já aceites pelo prestador podem chegar até ao TTL. Revogação nas definições do sistema é sempre possível. Notificações são complementares: o estado oficial de inscrições, pagamentos e documentos continua no My CIRC.

Uma subscrição local pode expirar, ser revogada ou perder-se ao limpar dados. A página consulta o servidor antes de mostrar «ativadas»; uma autorização sem registo não conta como adesão. Uma confirmação de envio não garante entrega. Não enviar dados financeiros, idade ou data de nascimento para o ecrã bloqueado. O primeiro nome na felicitação está explicado no consentimento.

Fontes técnicas: [WebKit, Web Push no iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Cloudflare, Push notifications](https://developers.cloudflare.com/agents/agent-class/communication-channels/webhooks/push-notifications/), [web-push](https://github.com/web-push-libs/web-push).

## Aniversários privados

- Mensagem PT: «Parabéns, Tiago! A equipa do CIRC deseja-lhe um dia muito feliz.» A versão inglesa usa o idioma guardado no dispositivo. Nomes ausentes ou inválidos recebem uma saudação genérica.
- Cron versionado `0 8,9 * * *` (UTC): só a execução correspondente às 09h00 em `Europe/Lisbon` avança. Isto acompanha o horário de verão. Execuções atrasadas mais de 15 minutos são ignoradas. Para nascimentos a 29 de fevereiro, o dia escolhido nos anos comuns é 28 de fevereiro.
- O servidor consulta apenas subscrições com consentimento explícito, não expiradas; pagina 100 de cada vez e lê somente nome/data de nascimento do respetivo UID. A data atual do perfil é revalidada em cada envio, sem duplicá-la nas subscrições. Contas sem perfil ou sem data válida não recebem mensagens.
- Antes de contactar o prestador, um commit atómico verifica as revisões da subscrição e do perfil e cria uma reserva única por UID/dispositivo/ano. Remoções, mudança de conta ou retirada de consentimento antes dessa reserva bloqueiam o envio. O registo de reserva contém apenas TTL; o identificador é um hash. Reativar a mesma subscrição não repete a felicitação desse ano.
- Uma tentativa por dispositivo e ano: falhas ou respostas incertas depois da reserva não são reenviadas automaticamente, para evitar duplicações. `accepted` significa aceitação pelo prestador, não entrega. TTL de entrega: uma hora, evitando mensagens pendentes durante dias.
- A reserva e o envio externo não são uma transação única. Uma revogação imediatamente depois da reserva pode coincidir com um envio já iniciado; mensagens já aceites podem aparecer até ao TTL.
- O piloto envia apenas para subscrições marcadas como conta organizadora pelo token verificado no momento da adesão; nunca confia no email editável do perfil. Não existe lista pública de aniversários nem endpoint de envio escolhido por terceiros. Os registos de execução incluem apenas contagens, nunca nomes/datas/mensagens/endpoints.
- `PUSH_BIRTHDAY_ENABLED=false` suspende só as felicitações; `PUSH_ENABLED=false` suspende todo o envio. Retirar consentimento e cancelar subscrições continuam disponíveis.
- Monitorizar contagens `failed` e falhas `birthday-scan-incomplete`; a execução é limitada a 100 páginas e à janela de 15 minutos. Dimensionar os limites de pedidos do plano Workers antes da abertura; testes de unidade não comprovam quotas ou permissões reais do fornecedor.

Referências: [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Scheduled Handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/), [Firestore StructuredQuery](https://firebase.google.com/docs/firestore/reference/rest/v1/StructuredQuery).

A autorização de aniversário prolonga a subscrição por 400 dias desde a adesão/ativação explícita, cobrindo o próximo aniversário mesmo que ocorra daqui a um ano. A retirada deste consentimento reduz a validade restante ao máximo de 90 dias. Não se prolonga silenciosamente a validade só por consultar o estado; após expirar, é necessário voltar a ativar.

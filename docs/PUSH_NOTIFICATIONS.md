# Preparação das notificações My CIRC

Estado inicial: publicado com `PUSH_ENABLED=false` e `PUSH_TEST_ONLY=true`. Não há pedidos automáticos de autorização, envios em massa, campanhas, alertas de pagamento ou lembretes de favoritos. Esta fase prepara a adesão e um teste por dispositivo, reservado a `circ.chuc@gmail.com`.

## Ativação e aceitação

1. Num checkout local privado, executar `node scripts/create-push-keys.mjs`. O ficheiro `.push-secrets.json` é ignorado pelo Git, tem permissões 0600 e não pode ser sobrescrito pelo script.
2. Importar no Worker Cloudflare **circ**, na conta do congresso: `npx wrangler secret bulk .push-secrets.json --name circ`. As chaves chamam-se `PUSH_VAPID_PUBLIC_KEY` e `PUSH_VAPID_PRIVATE_KEY`. A chave privada nunca deve entrar no Git, frontend, mensagens ou ficheiro de vouchers. Guardar o par de forma segura; não o regenerar a cada publicação.
3. Confirmar que a identidade `FIREBASE_PAYMENTS_SERVICE_ACCOUNT` já utilizada pelo servidor pode ler/escrever `pushSubscriptions`. Não criar permissões de escrita para o cliente. A coleção fica abrangida pela negação por defeito das regras Firestore existentes.
4. Ativar uma política TTL de Firestore para o campo `expiresAt` do grupo de coleções `pushSubscriptions`. Cada adesão expira após 90 dias; a aplicação deixa de a considerar ativa mesmo antes da remoção assíncrona pelo TTL.
5. Alterar **no wrangler.jsonc versionado** `PUSH_ENABLED` para `true`, manter `PUSH_TEST_ONLY=true` e publicar. Não alterar apenas variáveis do painel que serão repostas pelo próximo deploy. A API só permite adesão se o par de chaves for válido e a identidade de armazenamento existir. A presença da identidade não prova as suas permissões: confirmar no teste real.
6. No telemóvel, entrar com `circ.chuc@gmail.com`. No iPhone/iPad (iOS 16.4+), instalar primeiro no ecrã principal e abrir pelo ícone. Aceder a **Mais opções → Notificações**, ativar e autorizar no navegador. Em Android, usar Chrome atualizado. São também aceites Firefox e Safari compatíveis.
7. Premir **Enviar teste para este dispositivo**. Confirmar visualmente a notificação com a app em segundo plano e o acesso a `/conta/notificacoes` ao tocar. A resposta `accepted` apenas prova aceitação pelo prestador, não entrega/apresentação. Repetir num iPhone e num Android, testar recusa e desativação. Nunca solicitar permissões automaticamente ao abrir uma página.
8. Só depois dos testes, decidir o primeiro tipo de aviso e implementar o respetivo envio. **A emissão de campanhas e os gatilhos automáticos ainda não estão incluídos.** A abertura da adesão ao público (`PUSH_TEST_ONLY=false`) deve acompanhar essa implementação e texto de consentimento específico. Não abrir adesões sem uma finalidade de envio definida.

## Implementação

- `GET /api/push/config`: disponibilidade e chave pública, sem credenciais privadas.
- `POST /api/push/subscriptions`: consentimento explícito, conta verificada, inscrição deste dispositivo; `DELETE` cancela mesmo com envio suspenso.
- `POST /api/push/status`: estado da inscrição atual, sem expor registos de outras contas.
- `POST /api/push/test`: apenas organizador, apenas dispositivo próprio inscrito, uma tentativa por minuto. Reserva por revisão Firestore antes do envio impede repetições concorrentes. Não existe endpoint de envio em massa.
- Web Push com cifragem AES128GCM e autenticação VAPID através de `web-push`; pedido HTTP por `fetch`, compatível com Workers `nodejs_compat`. TTL do teste: 5 minutos.
- Endpoints permitidos: FCM, Apple Web Push e Mozilla. Não aceitar URLs arbitrários nem seguir redirecionamentos. Não registar endpoints/chaves/payloads em logs.
- Firestore guarda apenas UID, subscrição do dispositivo, idioma, datas de consentimento/expiração e limite do teste. IDs derivados de SHA-256 do endpoint. Atualizações e remoções usam precondição de revisão.
- A permissão é por dispositivo. Terminar sessão tenta cancelar a subscrição no navegador e no servidor; sem rede, a remoção remota pode aguardar o TTL. Se a conta mudar sem logout, um dispositivo ainda associado à outra conta deve ser desativado e reativado, nunca silenciosamente transferido.
- O service worker mantém a política anterior de não guardar dados pessoais em cache. Mostra sempre notificação visível e limita destinos a vistas conhecidas; um clique não substitui formulários abertos.

## Suspensão e limites

Publicar `PUSH_ENABLED=false` suspende novas adesões e testes; mantém a desativação. Mensagens já aceites pelo prestador podem chegar até ao TTL. Revogação nas definições do sistema é sempre possível. Notificações são complementares: o estado oficial de inscrições, pagamentos e documentos continua no My CIRC.

Uma subscrição local pode expirar, ser revogada ou perder-se ao limpar dados. A página consulta o servidor antes de mostrar «ativadas»; uma autorização sem registo não conta como adesão. Uma confirmação de envio não garante entrega. Não enviar dados financeiros ou pessoais para o ecrã bloqueado.

Fontes técnicas: [WebKit, Web Push no iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Cloudflare, Push notifications](https://developers.cloudflare.com/agents/agent-class/communication-channels/webhooks/push-notifications/), [web-push](https://github.com/web-push-libs/web-push).

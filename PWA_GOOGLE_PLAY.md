# CIRC 2027 — PWA e Google Play

## Estado atual

A plataforma web está preparada para funcionar como Progressive Web App (PWA):

- `public/manifest.json` configurado para instalação em modo `standalone`;
- `public/service-worker.js` com shell/offline básico e cache de assets estáticos;
- Service Worker registado apenas em produção;
- metadados Android/iOS presentes em `public/index.html`;
- atalhos da aplicação para Programa, Participar e My CIRC.

## Validação após deploy

Depois de publicar o `main` no domínio oficial, validar em `https://circ-coimbra.org`:

1. `manifest.json` responde com HTTP 200 e `Content-Type` adequado;
2. `service-worker.js` responde com HTTP 200 e não é redirecionado para `index.html`;
3. Chrome DevTools > Application > Manifest não apresenta erros críticos;
4. Service Worker aparece como `activated and running`;
5. no Android/Chrome é possível instalar a aplicação;
6. a aplicação instalada abre sem a barra normal do browser;
7. login, My CIRC, inscrições, submissões e logout continuam funcionais;
8. navegar offline para uma página já carregada apresenta pelo menos o shell da aplicação;
9. os atalhos Programa, Participar e My CIRC abrem as rotas corretas.

## Antes da Google Play

Ainda falta:

- criar ícone `maskable` próprio (512x512) com margem de segurança adequada;
- validar/produzir ícones finais e assets de loja;
- produzir screenshots mobile reais da versão final;
- definir o Android Application ID definitivo;
- gerar a chave de assinatura Android;
- gerar o fingerprint SHA-256 do certificado;
- criar `/.well-known/assetlinks.json` com o Application ID e fingerprint reais;
- gerar a Trusted Web Activity e o Android App Bundle (`.aab`);
- testar o bundle num dispositivo Android;
- preencher a ficha da Google Play, Política de Privacidade e Data Safety.

## Intervenção humana necessária

A equipa terá de intervir apenas em etapas que dependem de identidade, contas ou publicação externa:

- acesso/adesão à Google Play Console da organização;
- verificação da Associação Hemisfério Disciplinado e eventual D-U-N-S;
- pagamento da taxa de registo exigida pela Google, se aplicável;
- guarda segura da chave de assinatura;
- confirmação visual dos ícones/screenshots finais;
- deploy no alojamento atual, caso não exista automatização de deployment ligada ao GitHub.

## Regra de segurança

A PWA não deve colocar dados pessoais, tokens Firebase, inscrições, submissões, faturas ou outros dados autenticados no cache do Service Worker. O cache deve ficar limitado ao shell e assets públicos estáticos.

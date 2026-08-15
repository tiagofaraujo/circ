# Área CIRC — ativação do Firebase Authentication

O frontend está preparado para autenticação real com:

- Google;
- email + palavra-passe;
- criação de conta;
- recuperação de palavra-passe;
- verificação de email;
- sessão persistente;
- rotas protegidas da Área CIRC;
- terminar sessão.

## 1. Criar o projeto Firebase

1. Abrir Firebase Console.
2. Criar um projeto dedicado ao CIRC, por exemplo `circ-coimbra`.
3. Adicionar uma aplicação Web ao projeto.
4. Copiar o objeto de configuração da aplicação Web.

## 2. Ativar Authentication

Em **Security > Authentication > Sign-in method**:

- ativar **Email/Password**;
- ativar **Google** e definir o email de suporte do projeto.

## 3. Domínios autorizados

Em **Authentication > Settings > Authorized domains**, adicionar:

- `circ-coimbra.org`
- `www.circ-coimbra.org`

Durante desenvolvimento, adicionar `localhost` apenas quando necessário.

## 4. Variáveis de ambiente do build

Configurar no ambiente de build/deployment as seguintes variáveis:

```text
REACT_APP_FIREBASE_API_KEY
REACT_APP_FIREBASE_AUTH_DOMAIN
REACT_APP_FIREBASE_PROJECT_ID
REACT_APP_FIREBASE_STORAGE_BUCKET
REACT_APP_FIREBASE_MESSAGING_SENDER_ID
REACT_APP_FIREBASE_APP_ID
```

Os valores encontram-se em **Project settings > Your apps > Web app > Firebase SDK configuration**.

Depois de alterar estas variáveis é necessário fazer novo build/deployment, porque Create React App injeta `REACT_APP_*` durante o build.

## 5. Emails de autenticação

Em **Authentication > Templates** rever:

- Email address verification;
- Password reset.

Personalizar remetente, assunto e texto para a identidade CIRC antes da abertura pública das inscrições.

## 6. Segurança recomendada antes da abertura das inscrições

- Remover `localhost` dos Authorized domains em produção, se não for necessário.
- Manter a API key Firebase restrita aos serviços Firebase aplicáveis.
- Rever quotas do Firebase Authentication.
- Ativar App Check se, no futuro, a Área CIRC passar a consumir Firestore, Storage ou APIs protegidas.
- Não guardar palavras-passe no código, localStorage, GitHub ou base de dados própria.

## 7. Testes de aceitação

Testar pelo menos:

1. criar conta com email e palavra-passe;
2. receber email de verificação;
3. terminar sessão e entrar novamente;
4. recuperar palavra-passe;
5. entrar com Google;
6. manter sessão após fechar/reabrir o browser;
7. impedir acesso anónimo a `/conta`, `/conta/perfil` e `/conta/inscricoes`;
8. testar Chrome, Edge, Firefox, Safari/iOS e Chrome/Android.

## Nota técnica

Este projeto continua em Create React App. Para não alterar o `package-lock.json` legado e não introduzir risco no pipeline atual, o Firebase Authentication é carregado através dos bundles oficiais `firebase-app-compat` e `firebase-auth-compat` do CDN do Firebase. Numa futura modernização do frontend, recomenda-se migrar para a API modular via npm.

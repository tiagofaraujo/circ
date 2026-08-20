# Ativação da administração CIRC

A aplicação já disponibiliza `/admin` para o email verificado `circ.chuc@gmail.com`. A autorização é confirmada novamente pelas regras do Firestore e do Storage; não depende apenas da interface React.

## 1. Conta de administrador

1. Em Firebase Console > Authentication, ativar Email/Password.
2. Criar o utilizador `circ.chuc@gmail.com` ou usar `/registar` no site.
3. Definir uma palavra-passe temporária gerada por um gestor de palavras-passe, com pelo menos 20 caracteres.
4. Abrir a mensagem enviada pelo Firebase e confirmar o endereço de email.
5. Entrar em `https://circ-coimbra.org/login` e abrir `https://circ-coimbra.org/admin`.

O acesso administrativo só é concedido depois da verificação do email. Nunca guardar a palavra-passe em ficheiros, GitHub, Firestore ou mensagens partilhadas. Ativar uma política Firebase que exija maiúsculas, minúsculas, números, símbolos e pelo menos 14 caracteres.

## 2. Base de dados e regras

No projeto Firebase `circ-coimbra`:

1. Criar uma base Cloud Firestore numa localização europeia adequada ao projeto.
2. Publicar regras e índices: `firebase deploy --only firestore`.
3. Testar que um participante só consegue ler o seu próprio perfil, inscrição, pagamento e documentos.
4. Testar que apenas o administrador consegue alterar estados financeiros.

## 3. Documentos privados

1. Ativar Cloud Storage for Firebase.
2. Definir `REACT_APP_FIREBASE_STORAGE_BUCKET` no build Cloudflare.
3. Publicar as regras: `firebase deploy --only storage`.
4. Guardar diplomas, recibos e documentos por UID/inscrição nos prefixos privados descritos em `DATA_ARCHITECTURE.md`.

## 4. Antes de abrir inscrições

- Ativar App Check para Firestore e Storage.
- Rever a Política de Privacidade e informar finalidades, prestadores e prazos de conservação.
- Configurar alertas de orçamento no plano Blaze antes de ativar cópias de segurança/exportações.
- Criar testes de regras no Firebase Emulator Suite.
- Definir quem, além do endereço principal, poderá ter acesso operacional e manter contas individuais para auditoria.

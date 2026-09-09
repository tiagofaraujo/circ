# My CIRC · experiência app

Esta alteração adapta a plataforma existente a telemóvel, tablet e computador. Não cria outra base de dados, autenticação, gateway de pagamentos ou conta de participante.

## Incluído

- Área `/conta` com navegação inferior em telemóvel e lateral em computador.
- Início com atalhos para inscrições e trabalhos, programa, perfil e último trabalho do próprio utilizador.
- As páginas existentes de inscrição, submissão, edição de rascunhos, PDF e segurança são reutilizadas.
- O programa existente também está em `/conta/programa`. `/app` redireciona para `/conta`.
- Acesso aos módulos de gestão segundo as permissões já existentes; estas não são elevadas pela interface.
- PT/EN, estados de carregamento/erro, foco visível, controlos táteis e adaptação a áreas seguras do dispositivo.
- Manifesto instalável, ícones CIRC e atalhos. A instalação depende de HTTPS e do suporte do navegador; não se trata de distribuição na App Store/Google Play.

## Privacidade e funcionamento

As regras Firebase existentes continuam a ser a fronteira de autorização. Não foram alteradas neste trabalho. A listagem do início consulta apenas `submissions` do `user.uid` autenticado e do evento corrente, com o limite já existente de 100 registos. O início usa um listener e fecha-o ao sair; não acrescenta polling nem lê a lista global de participantes.

A percentagem de perfil só aparece após uma resposta de perfil proveniente do Firestore. Um erro ou dados locais parciais não se convertem numa percentagem incorreta.

O service worker `my-circ-sw.js` guarda apenas `my-circ-offline.html`, um aviso público sem dados pessoais. Não guarda páginas da conta, resultados Firebase, PDFs, pagamentos nem pedidos de escrita. Só interceta navegações da área pessoal e mantém pedidos de API e restantes recursos no fluxo normal. As políticas já existentes do Firebase e do navegador não são modificadas por isto.

Não há envio em segundo plano, sincronização offline, notificações push ou recarregamento forçado de formulários. Sem rede, é necessário confirmar o registo persistido antes de repetir uma submissão.

## Publicação e validação

Base de trabalho: `feature/admin-submissions-secretariat` no commit `80fe1ddf24ce4225e4549e97e8636d3dfc92cfa8`, que contém as funcionalidades recentes ainda ausentes de `main`. Não substituir este trabalho pela versão antiga de `main`.

Executar os testes focados MyCircHome e os testes existentes de perfil/resumo, e o build normal do projeto. Não incluir os dados fictícios dos testes em produção. Antes da publicação final, validar num iPhone/Safari e num Android/Chrome a instalação, o login, a navegação e o retorno dos PDFs. As rotas diretas `/conta/*` precisam de fallback SPA para `index.html`, como as restantes rotas React do site.

O ícone SVG integra o logótipo original; os dois PNG são apenas rasterizações para compatibilidade de instalação. O `id` do manifesto continua `/`, preservando a identidade derivada do anterior `start_url`.

## Orçamento e limites

Não foi ativado nenhum serviço pago ou nova dependência. A app usa o alojamento e Firebase existentes; as quotas e custos desses serviços continuam a depender do uso. Publicação em lojas, notificações, bilhetes/QR operacionais, pagamentos e faturas automáticas exigem trabalho e validação separados. Este redesign não resolve os pontos de segurança/produção identificados na análise anterior e não deve ser tomado como certificação de prontidão para inscrições reais.

Referências: [ESR Now](https://play.google.com/store/apps/details?id=org.myesr.app), [manifesto PWA](https://web.dev/learn/pwa/web-app-manifest), [instalação](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing).

# CIRC 2027 — 20 melhorias da app

Data: 21 de novembro de 2026.

## Alterações implementadas

| Nº | Melhoria | Comportamento |
| --- | --- | --- |
| 1 | Pesquisa no programa | Pesquisa o dia selecionado por tema, pessoa ou instituição, sem distinguir maiúsculas ou acentos. Inclui intervenções dentro dos painéis. |
| 2 | Sessões favoritas | A estrela guarda sessões neste navegador, sem efetuar inscrições ou reservar lugares. |
| 3 | Programa por favoritos | O filtro apresenta apenas as sessões favoritas do dia; permite limpar os filtros. |
| 4 | Exportação para calendário | Descarrega as sessões visíveis do dia em iCalendar, com identificadores estáveis e horas convertidas de Coimbra para UTC. Não inventa uma hora de fim. |
| 5 | Impressão completa | A impressão inclui os três dias, todos os painéis abertos e todas as sessões, mesmo com filtros ativos no ecrã. Oculta navegação e preferências de cookies. |
| 6 | Controlo dos painéis | Botões para expandir ou recolher todos os painéis, mantendo o controlo individual. |
| 7 | Dias pelo teclado | Setas, Home e End permitem selecionar os dias do programa. |
| 8 | Biografias de moderadores | Os nomes no programa abrem a biografia quando esta está disponível. |
| 9 | Pesquisa de convidados | Pesquisa por nome, instituição ou área no diretório. |
| 10 | Filtro por participação | Separa oradores e moderadores ou apresenta ambos. |
| 11 | Ordenação alfabética | Permite ordenar por nome ou voltar à ordem original do diretório. |
| 12 | Resultados e filtros persistentes | Contagem sem duplicar a mesma pessoa, estado sem resultados, reposição de filtros e conservação da pesquisa no regresso da biografia. |
| 13 | Alternativa a fotografias indisponíveis | Apresenta iniciais se o ficheiro da fotografia falhar, no programa, diretório e biografia. |
| 14 | Regresso ao dia escolhido | A biografia permite voltar ao dia de origem, incluindo o programa dentro do My CIRC. |
| 15 | Títulos das páginas | O separador do navegador identifica a página ou pessoa e acompanha o idioma. |
| 16 | Preferências resistentes a falhas | Idioma, aviso de privacidade e favoritos toleram falhas do armazenamento local; os favoritos avisam quando só podem durar até sair da página. |
| 17 | Navegação acessível | Atalho para o conteúdo e foco no título ao mudar de página. |
| 18 | Opções de gestão no telemóvel | O menu «Mais opções» reutiliza as permissões existentes; inclui segurança e ajuda. Fecha ao navegar e com Escape. |
| 19 | Recuperação do contacto | Em caso de erro de envio, mantém o texto e disponibiliza um email pré-preenchido. Diagnóstico técnico num bloco expansível. |
| 20 | Validação e proteção do envio | Impede campos preenchidos só com espaços e submissões duplicadas; desativa os campos durante o envio e coloca foco no resultado. |

## Validação local

- 93 suites de testes de interface: 793 testes aprovados.
- Inclui regressões de inscrições, pagamentos, permissões, submissões e navegação existentes.
- Novos testes cobrem pesquisa, favoritos, armazenamento indisponível, retorno do programa, impressão, filtros do diretório, fotografias indisponíveis, iCalendar e recuperação do contacto.
- Compilação de produção com `CI=true npm run build`: aprovada.
- `git diff --check`: sem erros.

As alterações concentram-se na interface. Não alteram preços, pagamentos, autorizações, dados pessoais, biografias ou horários. O email é simulado nos testes: a alternativa manual não constitui confirmação de funcionamento do serviço EmailJS. Os favoritos são locais ao navegador e a exportação de calendário é uma cópia do programa no momento da descarga.

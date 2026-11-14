# CIRC 2027 — conferência final antes da abertura (14/11/2026)

> Documento de passagem para a organização. **Não é uma certificação de prontidão operacional**: a revisão de código, os testes automatizados e um build não substituem uma leitura autenticada dos serviços de produção.

## Data e guardas que não devem ser alteradas

- **Abertura:** 15/11/2026, 00h00 em `Europe/Lisbon` (nesta data, UTC+0).
- Inscrições e submissões apenas após a abertura oficial; não antecipar por testes ou alteração de flags.
- **Lotação:** 400 inscrições presenciais e 170 por curso, contadas apenas após confirmação e pagamento; participação virtual sem limite.
- Preservar elegibilidade ULS/estudante, dados obrigatórios de faturação, confirmação automática de pagamentos e emissão fiscal idempotente.
- Não gerar pagamentos/referências, faturas ou mensagens reais para realizar esta conferência.

## Matriz de evidências e decisões

| Tema | Preparado / evidência no repositório | O que ainda requer confirmação ou decisão humana |
| --- | --- | --- |
| Abertura e bloqueios | `docs/OFFICIAL_OPENING_20261115.md` e testes da janela de abertura; regra de servidor e interface previstas | Validar relógio, domínio e operação efetiva sem antecipar a abertura |
| Firestore | `scripts/activate-public-opening.sh` publica separadamente `firestore:rules`; o deploy Cloudflare não o executa | **Crítico:** confirmar hash/versão das regras efetivamente publicadas e testar autorizações antes de aceitar submissões |
| Submissões e prazos | Resumo estruturado, rascunho, envio e PDF; proteções recentes de prazo na interface/store, `docs/PRODUCTION_SUBMISSIONS_20261101.md` | Confirmar correspondência das regras Firestore com os prazos e campos do formulário; não inferir proteção do servidor a partir da interface |
| Regulamento científico | `docs/SCIENTIFIC_REGULATION_20261110.md` documenta as diferenças | **Decisão da Comissão Científica:** idioma(s) exigido(s), número de autores e grelha: 5 critérios de peso igual no módulo vs. proposta de 6 critérios ponderados no regulamento |
| Correções e reenvio | PR [#98](https://github.com/tiagofaraujo/circ/pull/98) em rascunho, com flag desativada e ordem de implantação documentada | Não integrar/ativar sem aprovação regulamentar, regras Firestore publicadas e verificação completa |
| Cartões e carteiras | `docs/STRIPE_PRODUCTION_20261101.md` e testes simulados | Validar ligação live Worker–Stripe, receção dos eventos e confirmação/faturação ponta-a-ponta; não inferir sucesso real de testes automáticos |
| MB WAY | Pagamento real comunicado pelo organizador em `docs/OFFICIAL_OPENING_20261115.md` | Identificar e verificar a FR e o PDF correspondente, sem emitir duplicados |
| Faturação estrangeira | Percurso PT documentado em `docs/PRODUCTION_READINESS_20261101.md` | Decisão fiscal com contabilista e implementação separada, sem inventar taxas ou documentos |
| Dados de ensaio | `docs/PRODUCTION_TEST_CLEANUP_20261105.md` prevê inventário, arquivo reversível e auditoria | Conferir inventário autenticado, identificadores e totais; executar só depois de rever seleção explícita de testes e exclusão de dados financeiros reais |
| Publicação | CI e deployments do frontend são evidências distintas | Confirmar o **SHA integrado** no deployment Cloudflare e comportamento real no domínio; um build bem-sucedido não basta |

## Sequência manual recomendada (leitura primeiro)

1. Confirmar que `main` e a versão publicada correspondem ao commit aprovado; registar SHA, deployment e resultado HTTP/visual no domínio.
2. Confirmar versão das regras Firestore e os bloqueios temporais/autorizações, sem alterar permissões ou publicar regras sem revisão explícita.
3. Testar em ambiente simulado o circuito inscrição → pagamento confirmado → lotação → documento único, incluindo repetição de notificações, sem transações reais.
4. Obter decisões escritas da Comissão Científica e do contabilista. Manter funções não aprovadas inativas.
5. Conferir o inventário de testes, criar arquivo recuperável/auditado apenas com os marcadores explícitos e verificar os totais; **não presumir que a limpeza ocorreu**.
6. Confirmar a apresentação no telemóvel e computador e documentar qualquer falha bloqueante antes da abertura.

## Limitações desta revisão

O acesso a esta revisão é ao repositório e aos seus resultados de CI; não foi efetuada leitura autenticada de Firebase, EuPago, Stripe, TOConline ou Cloudflare. Não houve operações financeiras, fiscais, comunicações ou alterações de produção. Cada item não comprovado acima permanece **não confirmado**, mesmo quando o código ou o teste correspondente passa.

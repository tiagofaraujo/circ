# Transferência bancária — simplificação do ensaio (10/10/2026)

## Implementação

Substitui, no percurso de teste, a exigência de comprovativo descrita na versão inicial. Não ativa pagamentos reais.

**Participante:** `/conta/inscricoes-teste` → Transferência bancária — teste. Cartão com beneficiário/IBAN não operacionais no ensaio, valor e descrição copiáveis. Botão **Já fiz a transferência — simular**; comprovativo facultativo dentro de uma secção recolhida. O estado passa a **Transferência comunicada — aguarda confirmação**, sem confirmar a inscrição. A pessoa não vê os campos de validação da organização. Pedidos já confirmados e dados anteriores são conservados.

**Organização:** `/admin/transferencias-teste`. Fila das transferências dos ensaios da conta administradora, filtros por estado, indicação de comprovativo facultativo, seleção de pedido e página de conferência separada. O atalho do participante conserva os identificadores da sessão e do pedido. A mesma conta administradora continua a ensaiar os dois lados; não foi implementada a abertura a participantes nem separação real de permissões para pagamentos de produção. A fila abrange até 100 sessões devolvidas pelo armazenamento existente e informa essa limitação; outros ensaios continuam acessíveis pelo endereço próprio.

## Dados bancários e cópia

O IBAN fornecido pelo organizador está guardado apenas na configuração de servidor `server/payments/bank-transfer-account.mjs`, com beneficiário nulo, `status=awaiting_holder` e `enabled=false`. Não se inferiu o titular a partir do nome da associação ou da conta Eupago. A API de sandbox devolve sempre IBAN e beneficiário nulos, mesmo que sejam futuramente preenchidos. Não há parâmetro do navegador que permita obter um destino real por essa rota.

`BankTransferDetails` prepara os botões de copiar beneficiário, IBAN, valor e descrição. Uma apresentação operacional de IBAN só é permitida com ambiente de produção explícito, dados aprovados, titular e checksum válidos. Essa condição **não está ligada a nenhum checkout de produção**. Os dados reais mantêm-se ocultos e os botões bancários desativados no ensaio; a cópia do valor e da descrição está disponível. Verificação matemática não demonstra existência da conta nem titularidade.

A cópia usa `navigator.clipboard.writeText` por ação explícita. IBAN visível é agrupado; texto copiado não tem espaços ou prefixos. O valor copiado não tem símbolo monetário nem separador de milhares. A confirmação de cópia só aparece depois do sucesso. Se a permissão for recusada ou a API estiver indisponível, surge o texto exato selecionado com instrução de cópia manual, sem fingir sucesso. O componente inclui mensagens PT/EN.

Novos pedidos recebem uma descrição `C27T-{UUID_do_pedido_em_base36}`, até 30 caracteres alfanuméricos/traço e maiúsculos, copiada num clique. O UUID é convertido por inteiro, não truncado; evita-se introduzir colisões por encurtamento. O identificador técnico completo mantém-se separado. Descrições de pedidos antigos não são alteradas.

## Comprovativo opcional não é confirmação opcional

O endpoint autenticado `POST /api/checkout/sandbox/sessions/{id}/orders/{orderId}/report` recebe uma declaração explícita de simulação, ID idempotente e revisão do pedido. Guarda comunicação, autor, instante e eventual resposta curta. Não modifica preços, pagamento, crédito ou direitos. Não chama o banco nem a Eupago.

A organização pode aprovar um pedido comunicado sem ficheiro, mas tem sempre de confirmar a conferência do crédito simulado, valor exato, data não futura e referência única de movimento. Havendo ficheiro, a análise da última versão continua obrigatória. O mesmo movimento não pode ser usado em dois pedidos. Confirmação, movimento e direitos de teste mantêm a escrita atómica preexistente.

Pode ser pedido esclarecimento mesmo sem comprovativo. O motivo aparece ao participante, que pode responder e pedir nova conferência sem ser obrigado a anexar um ficheiro. O histórico anterior é mantido. Os limites de documentos, assinaturas de formato, acesso privado e downloads autenticados não foram relaxados. O limite de 500 KiB continua no anexo opcional; não se aumenta um documento Firestore acima da sua capacidade sem migrar o armazenamento.

Uma revisão conta comunicações, comprovativos e decisões. Uma aprovação antiga, incluindo sem comprovativo, é rejeitada depois de nova comunicação/anexo/decisão. IDs e revisões protegem repetição e concorrência. Registos legados com comprovativo continuam utilizáveis sem migração; novos registos ou registos com comunicações exigem revisão explícita. Recusar/cancelar não executa reembolso.

## Validação

- Servidor: 184 testes, 183 aprovados, 0 falhas, 1 teste preexistente do Media Center ignorado.
- Interface: 34 suites, 156 testes aprovados. Inclui cópia exata/fallback, dados bancários bloqueados na sandbox, comunicação sem ficheiro, revisão separada, invalidação de revisão e fila administrativa.
- Compilação React integral executada com `CI=true npm run build`.
- Testes de pagamento e armazenamento usam transportes, identidades e dados simulados. Não foram criados recebimentos, referências Eupago, comprovativos pessoais ou inscrições reais.
- O ensaio visual em Chromium local foi impedido por `ERR_BLOCKED_BY_ADMINISTRATOR`. Não se conta como verificação visual nem como ensaio ponta a ponta aprovado na instalação da organização.

## Aceitação a executar na conta da organização

1. Abrir ou criar um pedido de transferência na inscrição de teste. Conferir valor/descrição e copiar ambos; IBAN real deve permanecer indisponível.
2. Carregar **Já fiz a transferência — simular**, sem comprovativo. Confirmar estado a aguardar confirmação e inscrição ainda pendente.
3. Abrir **área da organização**, conferir o pedido sem ficheiro, assinalar crédito simulado e validar valor/data/movimento. Voltar à inscrição e recarregar: confirmação e itens persistentes.
4. Ensaiar pedido de esclarecimento e resposta; comprovar que uma revisão antiga é rejeitada.
5. Ensaiar complemento e referência de movimento distinta. Testar valor incorreto/reutilizado e comprovar que não confirma.

Falta confirmar o nome exato do titular bancário e planear separadamente a ativação de produção, com permissões e armazenamento adequados. Nenhum IBAN real foi publicado como instrução de pagamento no ensaio. Não foram alterados Firebase rules, credenciais, vagas, vouchers, faturação nem os handlers MB WAY/Multibanco.

## Fontes técnicas

- https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText
- https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit
- https://firebase.google.com/docs/firestore/quotas

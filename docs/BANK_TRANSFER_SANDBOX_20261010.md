# Transferência bancária — ensaio administrativo

## Implementação de 10/10/2026

Integrada no percurso existente `/conta/inscricoes-teste`, na opção **Transferência bancária — teste**. Usa o mesmo cálculo de preços e elegibilidade no servidor, inscrição inicial, histórico e complementos (cursos/jantares). A conta administradora verificada `circ.chuc@gmail.com` ensaia o papel de candidato e de validador. Não é um circuito público com separação de intervenientes.

Não foi ativada a cobrança real nem alterado o fluxo de transferências de compras de vouchers de empresas. Nenhum pedido, comprovativo ou recebimento real foi criado por esta implementação. Os testes técnicos Eupago existentes foram preservados.

## Circuito

1. Criar pedido de transferência: o servidor grava o total e uma descrição única `CIRC-TESTE-{uuid}-{sequência}`, sem chamar a Eupago. O pedido fica pendente.
2. Usar **comprovativo fictício** (PNG gerado localmente com identificação explícita de simulação), ou enviar ficheiro de teste PDF/JPG/PNG até 500 KiB, confirmando que não contém dados bancários pessoais.
3. O pedido passa a **Comprovativo recebido — em análise**. A inscrição permanece por confirmar.
4. No painel de validação, analisar a última versão, declarar a conferência do crédito **apenas simulado**, indicar valor exato, data não futura e referência única do movimento iniciada por `TESTE-`. Só uma decisão explícita confirma a inscrição de teste.
5. É possível recusar o comprovativo, com motivo obrigatório, e enviar nova versão. O histórico anterior permanece. Cancelar o pedido exige motivo, não apaga os dados e não executa reembolso.

Este método não utiliza notificações da Eupago nem consulta o banco. A confirmação fica identificada como **validação manual de teste**, com responsável, data/hora, movimento simulado, montante e versão do comprovativo. Não é apresentada como webhook nem como recebimento bancário comprovado pelo sistema.

## Dados bancários

Não há IBAN/titular bancário configurado no código analisado. Não se inventou um IBAN nem se reutilizaram dados de outra associação. O ensaio não apresenta um destino bancário executável. Antes de disponibilizar transferências reais, confirmar os dados com a associação (titular, IBAN e, quando aplicável, BIC/SWIFT), publicar configuração aprovada e definir as regras operacionais de reconciliação.

## Segurança e persistência

- A API continua reservada à conta administradora com email verificado, valida sessão Firebase e exige origem igual nas escritas e descargas. Transferências funcionam sem chave/canal Eupago; os métodos da gateway continuam dependentes da respetiva configuração.
- Pedidos e direitos de inscrição continuam em `settings/circ-checkout-sandbox-{uid}-{uuid}`. Comprovativos binários ficam em documentos separados `settings/circ-bank-proof-sandbox-{uid}-{sessionId}-{orderId}-{proofId}`. Não são enviados na consulta da inscrição ou no histórico.
- Os ficheiros só são descarregados por POST autenticado, com `Content-Disposition: attachment`, `no-store`, `nosniff` e CSP restritiva. Não há URL pública, visualização inline, OCR ou envio a terceiros. Validação de extensão, MIME, assinatura de formato, base64 canónico e limite de tamanho não equivale a antivírus: não foi implementado scanning/CDR.
- O upload e a referência ao ficheiro são gravados numa operação atómica Firestore, com precondição da versão da inscrição e criação exclusiva do documento do comprovativo. Limite de cinco versões por pedido.
- A aprovação exige a última versão do comprovativo e o montante exato. Uma versão substituída invalida a análise anterior. Valores parciais/excessivos ficam sem confirmação: não existe repartição de pagamentos neste ensaio.
- Movimento simulado, confirmação e direitos de teste são gravados numa única operação atómica. Uma chave exclusiva por conta impede reutilizar a mesma referência de movimento em pedidos distintos. Reenvios com o mesmo ID não repetem a confirmação. Conflitos e respostas incertas exigem atualização/repetição idempotente, nunca uma aprovação forçada.
- Recusas/cancelamentos e confirmações conservam autor, instante, motivo e identificador da decisão. O cancelamento não implica que o banco tenha revertido uma operação.
- Nenhuma escrita em inscrições reais, pagamentos reais, vagas, vouchers, faturação ou permissões. Não foi feito deploy de regras Firebase ou alteração de secrets.

## Verificações executadas localmente

- Servidor: **171 testes; 170 aprovados, zero falhas e um teste preexistente de cookies Media Center ignorado**. Inclui 21 novos cenários de transferência e cinco testes adicionais do armazenamento atómico.
- Interface: **32 suites, 139 testes aprovados**. Inclui seleção do método, comprovativo fictício, validação explícita, recusa e invalidação da análise de uma versão antiga.
- Compilação integral React com `CI=true npm run build`: concluída com sucesso.
- Usaram-se chaves, identidade, armazenamento e transportes simulados. Nenhum acesso ao banco ou movimento real. A tentativa de ensaio visual no Chromium local foi bloqueada pela política do ambiente; não é contada como teste visual ou ponta a ponta aprovado.

## Aceitação na instalação da organização — ainda necessária

Criar inscrição de teste, escolher transferência, usar comprovativo fictício e verificar que fica em análise (não confirmada). Recusar com motivo, reenviar, validar o crédito simulado com total exato e confirmar persistência após recarregar. Adicionar um curso/jantar e confirmar apenas os novos itens com outra referência de movimento. Testar a rejeição de um montante diferente e de uma referência já utilizada. Comprovar que o histórico e os ficheiros privados estão acessíveis apenas à conta autorizada e que os registos reais não mudam.

## Fora do ensaio

Abertura a participantes, IBAN real, extratos/API bancária, reconciliação automática, múltiplos créditos por pedido, pagamentos parciais, reconciliação entre contas/administradores, prazos de transferência, reservas de vagas, reembolsos, emails, retenção/eliminação de documentos e TOConline. A preparação de produção exige armazenamento e permissões próprios para comprovativos de candidatos e validadores, além de revisão de segurança e política de retenção.

## Referências técnicas

- https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit
- https://firebase.google.com/docs/firestore/quotas

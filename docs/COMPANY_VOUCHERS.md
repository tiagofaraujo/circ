# Inscrições pagas por empresas — CIRC 2027

## Âmbito
Um código de utilização única cobre uma inscrição de congressista externo, presencial, nos dias 9 e 10 de abril de 2027. Sem jantar, cursos ou saldo monetário. O preço acordado fica na compra, mesmo que a tarifa pública mude depois. Só a administração de inscrições gere compras, confirma transferências e emite/cancela códigos.

## Operação
1. Abrir `/admin/empresas` e registar nome, identificação fiscal, morada, email, quantidade (1–50) e preço acordado por inscrição.
2. A compra fica pendente. Confirmar a entrada efetiva do dinheiro na conta bancária, indicar a referência do movimento e, se disponível, a referência do documento de faturação.
3. Assinalar a confirmação e gerar os códigos. O pagamento e os códigos são gravados numa única transação. Repetir a confirmação de uma compra paga é recusado.
4. Abrir a compra e copiar os códigos disponíveis. A distribuição é feita pela organização; o sistema não envia emails.
5. O participante, com email confirmado e nome completo guardado, seleciona Externo + Presencial, sem extras. Introduz o código no resumo e confirma.
6. A inscrição e o consumo do código são gravados atomicamente. Um código não pode ser utilizado por duas contas. Uma conta não pode criar duas inscrições canónicas; uma repetição do mesmo pedido após perda da resposta é idempotente.
7. O participante vê a confirmação persistente no My CIRC. A administração e o secretariado encontram a inscrição nas listas habituais. O painel da empresa mostra disponíveis, usados e cancelados, com referência da inscrição.

Um código disponível pode ser cancelado; não pode ser reativado ou reutilizado após consumo. Cancelar um código não processa reembolso. Pedidos de alteração de titular e reembolsos são tratados pela organização fora deste fluxo.

## Contabilidade e privacidade
Não é emitido um documento fiscal por esta funcionalidade. A compra guarda os dados de faturação e a referência do documento emitido pelo processo habitual da associação. Não se deve chamar recibo ao voucher ou à confirmação do participante.

O pagamento global é registado uma vez na compra. Cada inscrição guarda `amountCents: 0` (nenhum novo pagamento do participante) e `coveredAmountCents` com o valor coberto. As receitas das compras devem ser conciliadas a partir de `companyPurchases`; não somar novamente os valores cobertos das inscrições.

Os dados fiscais e de contacto ficam apenas na compra privada. O documento do código contém apenas nome da empresa, valor unitário e dados operacionais. Códigos aleatórios de 128 bits são credenciais: partilhar apenas com a empresa/participante. Participantes não podem listar códigos nem ler os dados de faturação.

A inscrição principal usa o ID `circ-2027-{uid}`. O futuro checkout de pagamentos individuais deve utilizar o mesmo ID e recusar documentos já existentes. Os registos administrativos `test-{uid}` continuam separados e não são inscrições reais.

## Ativação
Não integrar antes de os testes automáticos passarem e de publicar as regras. Não são necessários novos índices compostos, Storage, chaves de API ou serviços pagos.

No Cloud Shell autenticado no projeto correto, dentro do checkout desta versão:

```bash
npx --yes firebase-tools@15.30.0 deploy --only firestore:rules --project circ-coimbra --config firebase.json
```

Esta publicação inclui as regras anteriores de ULS e estudantes. Confirmar `Deploy complete!`. Depois integrar a PR em `main` e aguardar sucesso do Cloudflare.

O módulo começa fechado se `settings/circ-2027-company-vouchers` não existir ou se `enabled` não for `true`. Após a publicação, usar «Ativar utilização de códigos pagos» em `/admin/empresas`. A ação ativa apenas este canal; não abre os pagamentos individuais antes de 15 de novembro.

## Verificação real
Usar uma compra genuína cuja transferência esteja confirmada; não inventar um recebimento em produção. Testes com pagamentos fictícios devem ficar no emulador/projeto de testes.
- Confirmar a compra com a conta administrativa e copiar um código.
- Usar outra conta verificada, com nome completo, para confirmar a inscrição externa presencial.
- Atualizar a página e confirmar que a inscrição permanece visível e o código aparece utilizado.
- Tentar o mesmo código numa terceira conta: tem de ser recusado.
- Confirmar que cursos/jantar/virtual não podem ser cobertos por este fluxo.

A verificação com contas reais e uma transferência confirmada continua necessária após ativação.

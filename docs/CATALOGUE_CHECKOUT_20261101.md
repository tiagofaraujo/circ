# CIRC 2027 — catálogo de compras por Multibanco

## Percursos

O checkout real passa a aceitar congresso presencial ou virtual, apenas cursos,
cursos da manhã e da tarde e bilhetes de jantar. Uma inscrição paga pode adquirir
cursos ainda não incluídos e mais bilhetes de jantar num pedido complementar.
Participantes abrangidos por voucher usam o mesmo percurso para os seus extras.
Não é criada uma segunda inscrição principal.

Mantêm-se os preços publicados e a política fiscal versionada
`circ2027-m07-dinner-20261022`: congresso e jantar ISE/M07, cursos NOR/23%.
O pedido guarda os dados de faturação revistos e a seleção calculada no servidor.
A confirmação confere a tarifa pela data efetiva do pagamento antes de atribuir
direitos e preparar a FR. O formato do payload segue a documentação oficial:
<https://api-docs.toconline.pt/apis/vendas/documentos-de-venda>.

## Integridade dos pagamentos e documentos

- O pagamento principal mantém montante, referência e identidade originais.
- Cada suplemento tem UUID, pagamento, referência e documento fiscal próprios.
- Uma reserva atómica permite apenas um suplemento pendente por inscrição.
  Cursos já adquiridos não podem ser comprados novamente. Jantares somam quantidades.
- Uma notificação repetida não duplica direitos, montantes nem documentos.
- O suplemento só liberta a reserva depois de a faturação ficar concluída;
  uma falha OAuth conhecida pode ser retomada pela administração após renovar a ligação.
- Resultado financeiro ou fiscal incerto exige conferência; não se repete o POST.
- Conflitos de gravação após a emissão repetem apenas a persistência, relendo a
  inscrição atual para preservar outros campos. Nunca repetem a emissão fiscal.
- O participante consulta os seus PDFs, incluindo documentos próprios de extras
  quando o congresso foi atribuído por uma empresa.

## Verificação e limites

Testes de integração cobrem pedidos primários mistos, virtual e cursos, suplementos,
reserva concorrente, notificação repetida, preservação do pagamento principal,
reconciliação fiscal, recuperação OAuth e conflitos de persistência.
Não foram criadas novas cobranças nem faturas em produção para esta verificação.
O sucesso anterior da FR presencial não valida por si só uma nova FR com linhas mistas.

Continuam disponíveis apenas Multibanco e faturação portuguesa. MB WAY, cartões,
carteiras e transferência bancária não são anunciados como checkout integrado.
O registo administrativo de reembolso continua limitado aos casos que o respetivo
módulo consegue conferir; não executa devoluções bancárias e não foi ampliado aos
novos conjuntos de compras. Não existe modo de inscrição principal apenas para jantar.

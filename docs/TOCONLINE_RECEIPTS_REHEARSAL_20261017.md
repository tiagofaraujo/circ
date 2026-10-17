# TOConline — ensaio de faturação e recibos (17/10/2026)

## Objetivo

Criar um ensaio seguro do percurso **pagamento confirmado → documento de venda → recibo**, sem emitir documentos fiscais reais e sem chamar a API do TOConline.

A página administrativa é:

`/admin/recibos-teste`

Só fica acessível à conta administradora com permissão de inscrições. Lê exclusivamente pagamentos já confirmados no percurso de inscrição em sandbox.

## O que este ensaio faz

- lê uma inscrição de teste confirmada e os seus pedidos pagos;
- prepara uma pré-visualização dos dados para a API do TOConline;
- permite comparar dois modelos:
  - **Fatura + Recibo** (`FT` seguido de `RC`);
  - **Fatura-recibo** (`FR`), cujo recibo associado é criado automaticamente pela API v1 quando a FR é finalizada;
- mapeia, sem inventar códigos:
  - Multibanco → `MB`;
  - Transferência bancária → `TR`;
  - Cartão/Stripe → `CC`;
  - MB WAY → fica **por definir**, porque a documentação atual dos recibos não apresenta um código específico para MB WAY;
- gera números e IDs apenas simulados, claramente marcados `TESTE`;
- conserva o pagamento e a inscrição de teste sem alterações;
- impede duplicação da emissão simulada e deteta alterações ao pedido de origem entre a preparação e a emissão.

## O que este ensaio NÃO faz

- não usa Client ID, Client Secret, authorization code, access token ou refresh token do TOConline;
- não faz qualquer `POST`, `PATCH` ou `DELETE` ao TOConline;
- não comunica documentos à Autoridade Tributária;
- não envia PDF ou email;
- não cria clientes, serviços, séries, contas bancárias, faturas ou recibos reais;
- não assume IVA, isenção ou enquadramento fiscal.

A API v1 do TOConline indica que um documento de venda submetido fica automaticamente finalizado. Por isso, não devem ser usados dados fictícios contra uma empresa real apenas para “ver se funciona”.

## Dados fictícios usados na pré-visualização

A pré-visualização utiliza deliberadamente:

- Cliente: `Participante Teste CIRC`;
- NIF: `000000000`;
- Morada: `Rua de Teste, 1`;
- Código postal: `3000-000`;
- Cidade: `Coimbra`;
- Nota: `SIMULAÇÃO INTERNA CIRC — NÃO ENVIAR AO TOCONLINE`.

Estes dados nunca devem ser enviados ao TOConline.

## Linhas preparadas

O ensaio traduz as linhas do orçamento do servidor para códigos provisórios:

| CIRC | Código de ensaio | Descrição |
| --- | --- | --- |
| Congresso presencial | `CIRC27-CONG-P` | Inscrição CIRC 2027 — Congresso presencial |
| Congresso online | `CIRC27-CONG-O` | Inscrição CIRC 2027 — Congresso online |
| Curso manhã | `CIRC27-CURSO-M` | CIRC 2027 — Curso pré-congresso manhã |
| Curso tarde | `CIRC27-CURSO-T` | CIRC 2027 — Curso pré-congresso tarde |
| Jantar | `CIRC27-JANTAR` | CIRC 2027 — Jantar do congresso |

Antes da integração real, estes serviços têm de existir no TOConline ou ser substituídos pelos IDs/códigos aprovados pela contabilidade.

## Configuração ainda necessária antes de ativar a API real

1. Acesso API no TOConline e OAuth com scope `commercial`.
2. Série de documentos de venda.
3. Série de recibos, se for usado o modelo FT + RC.
4. Serviços/produtos que representarão inscrição, cursos e jantar.
5. Regime de IVA de cada linha, incluindo eventual motivo de isenção.
6. Conta bancária/caixa, quando aplicável.
7. Dados de faturação reais do participante.
8. Decisão contabilística sobre **FT + RC vs FR**.
9. Código de meio de pagamento a usar para MB WAY.
10. Confirmação do tratamento das compras de empresas/vouchers e dos complementos.

## Factos relevantes da documentação oficial

- A API usa OAuth e o scope `commercial`.
- A rota atual de documentos de venda é `POST /api/v1/commercial_sales_documents`.
- A API v1 indica que o documento submetido fica automaticamente finalizado.
- `FT` = fatura, `FS` = fatura simplificada, `FR` = fatura-recibo.
- Uma `FR` finalizada cria automaticamente o recibo associado.
- A rota atual de recibos é `POST /api/v1/commercial_sales_receipts`.
- Um recibo liquida um documento já existente através de uma linha com `receivable_type = Document`, o ID do documento e o valor recebido.
- A documentação de recibos identifica, entre outros, `MB` para referências Multibanco, `TR` para transferência bancária, `CC` para cartão de crédito e `DC` para cartão de débito.
- A documentação consultada não apresenta um código específico para MB WAY; não foi inferido um código.

## Critério para avançar para um teste real de ligação

O próximo passo seguro não é emitir uma fatura fictícia. É configurar OAuth e executar primeiro apenas leituras autenticadas:

- empresa atual;
- séries de documentos;
- serviços;
- impostos/motivos de isenção;
- contas bancárias;
- eventualmente um documento já existente escolhido pela organização.

Só depois de confirmar esses IDs e de a contabilidade validar o enquadramento fiscal se deve habilitar um POST real.

## Referências

- https://api-docs.toconline.pt/
- https://api-docs.toconline.pt/setup-do-postman
- https://api-docs.toconline.pt/autenticacao-simplificada
- https://api-docs.toconline.pt/apis/vendas/documentos-de-venda
- https://api-docs.toconline.pt/apis/vendas/recibos-de-venda
- https://api-docs.toconline.pt/apis/vendas/descarregar-pdf-de-documentos-de-venda

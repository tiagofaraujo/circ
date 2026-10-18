# CIRC 2027 — Preparação dos serviços TOConline (18/10/2026)

## Estado e limites
- OAuth de leitura validado. Série FR `CIRC2027` identificada pela API: ID `244`; não há confirmação neste endpoint sobre estado de comunicação à AT/ATCUD.
- **Nenhuma emissão fiscal real ativada.** A configuração de serviços no TOConline depende de ação no painel da entidade e validação fiscal/contabilística.
- Os cinco códigos **já utilizados no simulador** em `server/payments/toconline-rehearsal.mjs` são os abaixo. Não criar códigos com nomes alternativos sem alterar o simulador em conjunto.

## Catálogo-alvo e correspondência

| Código de serviço TOConline (a criar) | Linha interna | Designação | Preços finais divulgados (IVA incluído) |
| --- | --- | --- | --- |
| `CIRC27-CONG-P` | `congress-onsite` | Inscrição presencial CIRC 2027 | ULS Coimbra 55/90 €; externo 95/150 €; estudante IMR 60/95 € |
| `CIRC27-CONG-O` | `congress-virtual` | Inscrição virtual CIRC 2027 | 60 € |
| `CIRC27-CURSO-M` | `course-morning` | Curso pré-congresso manhã CIRC 2027 | ULS Coimbra 20 €; externo/estudante IMR 35 € |
| `CIRC27-CURSO-T` | `course-afternoon` | Curso pré-congresso tarde CIRC 2027 | ULS Coimbra 20 €; externo/estudante IMR 35 € |
| `CIRC27-JANTAR` | `dinner` | Jantar do congresso CIRC 2027 | 30 € por pessoa; quantidade variável |

O simulador calcula `unit_price` com base no total pago e aplica `vat_included_prices: true`. Não somar IVA novamente ao valor pago. Confirmar comportamento exato da API TOConline em documento real de teste controlado antes da produção, especialmente arredondamentos por linha e quantidades.

## Dependências antes da emissão
1. Confirmar com contabilista tratamento de pagamentos de nov/dez de 2026 para evento abril de 2027, tipo de documento e regularização eventual de adiantamentos.
2. Confirmar taxa aplicável a **cada** categoria (incluindo jantar, virtual e faturação a estrangeiros). A prática de 2025 aponta para 23%, mas não é uma regra automática.
3. Criar/verificar cinco serviços no TOConline com os **códigos exatos** da tabela; obter IDs reais e atributos (imposto, unidade, tratamento do preço).
4. Confirmar que série ID 244 está ativa e devidamente comunicada à AT (código de validação/ATCUD).
5. Validar que a soma das linhas da pré-visualização, incluindo arredondamentos, é exatamente igual ao montante confirmado (cêntimos) e preservar referência/idempotência do pedido.
6. Faturação de stands, patrocínios e vouchers empresariais fica em circuito separado até decisão fiscal.
7. O conector OAuth permanece em modo leitura e o ensaio não envia documentos ao TOConline.

## Nota de compatibilidade
Em conversa foram propostos outros códigos de serviço (`CIRC27-PRES`, `CIRC27-VIRT`, etc.). **Esses códigos não coincidem com os utilizados pelo código existente**; a tabela acima fixa a correspondência real atual e evita criar serviços incompatíveis com o simulador.

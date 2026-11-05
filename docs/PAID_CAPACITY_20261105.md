# Dados de faturação e lotação por pagamentos confirmados

Antes de criar um pedido real, o servidor exige o nome do participante e os seis campos do adquirente: nome, NIF português válido, morada, código postal, localidade e país PT. O ecrã mostra os campos em falta. A confirmação de transferência verifica também o snapshot congelado; os pagamentos PSP já recebidos ficam registados mesmo quando a emissão fiscal exige conferência.

## Lotações

| Direito pago | Lugares |
|---|---:|
| Congresso presencial | 400 |
| Congresso virtual | Sem limite |
| Curso da manhã | 170 |
| Curso da tarde | 170 |

O jantar mantém a política existente, sem introduzir uma lotação nova. Cada curso conta individualmente, incluindo inscrições virtuais que comprem cursos e compras posteriores. Um voucher de empresa utilizado conta como inscrição presencial paga, mesmo com valor zero a cargo do participante. Vouchers disponíveis e pedidos pendentes não reservam lugares.

O servidor consulta as inscrições canónicas reais, confirmadas e pagas e usa os direitos efetivos. Testes e arquivos financeiros não contam. Reembolsos/cancelamentos e arquivos de inscrições deixam de ocupar vagas na leitura seguinte. A emissão ou retoma fiscal não altera a lotação. Não é necessária uma migração de contadores: os já pagos entram na primeira leitura.

A criação do pedido e a confirmação do pagamento revalidam a disponibilidade. As admissões partilham uma transação Firestore e o mesmo documento de serialização `settings/circ-2027-paid-capacity-v1`. Não há reserva de lugares pendentes.

Uma referência anteriormente criada pode ser paga quando a lotação já esgotou. Nesse caso, o pagamento e a fatura-recibo permanecem no circuito financeiro, os direitos anteriores são preservados e os novos lugares ficam em conferência, sem admissão acima da lotação. Os ecrãs indicam que não deve ser feito outro pagamento. A organização trata a alternativa ou o reembolso; não há devolução automática.

## Publicação das regras

Esta versão encaminha o resgate de vouchers pelo servidor. As regras Firestore bloqueiam o antigo resgate direto, novas admissões pagas e aumentos de direitos pelo cliente, incluindo pela conta de administração. Mantêm as leituras, notas, presenças, cancelamentos e registo de reembolsos previstos.

As regras são um requisito da proteção completa: publicar o Worker não as publica. Num Google Cloud Shell autenticado no projeto `circ-coimbra`, numa cópia limpa desta versão validada:

```sh
bash scripts/activate-paid-capacity.sh
```

Publicar as regras imediatamente antes de integrar/publicar esta versão. Entre os dois passos, o cliente antigo de vouchers será recusado; não contornar essa recusa reabrindo as regras. O checkout antigo de pagamentos também deve ser substituído pela nova versão para impor a lotação em todas as confirmações.

Nenhum passo desta implementação cria pagamentos de teste, faz cobranças, altera preços/IVA, emite documentos reais por iniciativa própria ou ativa a abertura pública de meios de pagamento adicionais.

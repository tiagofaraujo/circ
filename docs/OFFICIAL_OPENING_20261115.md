# CIRC 2027 — preparação da abertura de 15 de novembro

## Data oficial

Inscrições, novos pagamentos, vouchers e submissões abrem em **15/11/2026 às
00h00 de Lisboa** (`2026-11-15T00:00:00Z`). A abertura depende do relógio do
servidor e das regras Firestore, sem ser necessário publicar outra versão nesse dia.

O bloqueio inclui o antigo piloto administrativo e os pedidos complementares.
Consultas, notificações assinadas, reconciliação, conferência de transferências já
criadas e faturação de pagamentos existentes continuam disponíveis.

As páginas públicas, o My CIRC e o Media Center apresentam a data oficial.
As áreas antigas de ensaio continuam retiradas da navegação e as APIs de ensaio
respondem com 410 em modo de produção.

## Evidência de pagamentos em 5 de novembro

| Meio | Evidência disponível | Pendente |
| --- | --- | --- |
| Multibanco | Pagamento e FR reais confirmados pelo organizador | Nenhuma nova cobrança nesta revisão |
| Transferência | Crédito, confirmação e recibo confirmados pelo organizador | Nenhuma nova transferência nesta revisão |
| MB WAY | Pagamento real confirmado pelo organizador | Identificar a FR/PDF desse pagamento |
| Visa/Mastercard | Adaptador e testes automáticos; conta Stripe apta | Secrets live do Worker e pagamento CIRC real completo |
| Apple Pay/Google Pay | Ambos ativos e disponíveis na Stripe, confirmado por GET | Validação real no checkout CIRC após concluir a ligação Stripe |

O destino de notificações Stripe está ativo e contém os quatro eventos esperados.
A consulta live devolveu zero Checkout Sessions. A existência da configuração da
carteira não comprova o pagamento, a entrega do evento ou a emissão fiscal CIRC.
Stripe mantém a validação privada; esta alteração não cria credenciais nem
anuncia meios indisponíveis como operacionais.

## Submissões

Percurso inicial: resumo estruturado, rascunho, submissão definitiva, consulta,
exportação PDF e avaliação com cópia anónima. A criação e a edição do autor ficam
fechadas antes da abertura. Permanecem os prazos de 15/01/2027 para comunicações e
28/02/2027 para pósteres, hora de Lisboa. Não existe carregamento de ficheiros
científicos nesta versão; a submissão inicial recebe texto estruturado.

## Publicação obrigatória das regras

A publicação Cloudflare não publica as regras Firestore. Depois de integrar esta
versão e atualizar uma cópia limpa do repositório na Cloud Shell autenticada:

```bash
bash scripts/activate-public-opening.sh
```

O script verifica a data e as proteções de lotação, e publica apenas
`firestore:rules` no projeto `circ-coimbra`. Até esse passo estar confirmado, o
bloqueio das submissões na interface não deve ser descrito como bloqueio concluído
no servidor Firestore.

## Limpeza dos registos

Em `/admin/preparacao`, o proprietário obtém o inventário atual e arquiva os grupos
identificados explicitamente como teste. Cada operação tem cópia privada, auditoria
e nova conferência transacional. Inscrições legítimas, pagamentos de produção,
referências em curso e documentos fiscais ficam protegidos. A reposição pelo cliente
só fica disponível após a abertura, porque também recria inscrições/submissões.

Esta alteração não executa o inventário nem o arquivo em produção. A conclusão da
limpeza exige os totais e a referência devolvidos pela execução autenticada.

# Arquivo dos conteúdos de teste — 5 de novembro de 2026

A página reservada à administração `/admin/preparacao` permite conferir e arquivar
os registos de teste existentes até ao momento da consulta. O inventário já não usa
o corte fixo de 1 de novembro, que excluía os ensaios dos dias seguintes.

## Seleção e proteção

- Uma inscrição ou um trabalho só entra no arquivo com `isTest === true`,
  `testMode === true` ou `environment === 'sandbox'`. Nomes, endereços de email,
  identificadores, antiguidade e falta de pagamento não constituem prova de teste.
- Inscrições e trabalhos sem estes marcadores são contabilizados como preservados.
- Pagamentos de produção, pedidos associados de produção e
  documentos fiscais reais são protegidos, mesmo que a inscrição esteja marcada
  como teste. Os pagamentos reais feitos durante a preparação não são eliminados.
- As cópias sandbox em `settings` exigem simultaneamente prefixo, ambiente e tipo
  de ensaio reconhecidos. Sessões TOConline e credenciais ficam fora da seleção.
- As relações de avaliação são arquivadas e desativadas antes de retirar o trabalho
  original. Um conflito ou uma configuração incompatível interrompe o grupo.

## Conferência e execução

O inventário mostra totais encontrados, quantidades elegíveis, proteções e a lista
dos grupos com identificadores e número de registos associados. A ação de arquivo
só fica disponível depois da confirmação deste inventário.

Cada grupo é novamente lido e comparado com a versão conferida. O arquivo guarda
cópia privada, auditoria e remoção dos dados ativos em transação. O manifesto regista
`selection: explicit-test-only`. Uma falha parcial conserva a referência de recuperação.
A reposição nunca substitui um identificador entretanto utilizado.

O inventário expira em 15 minutos; mais de 500 registos numa coleção ou um grupo
acima do limite interrompe a preparação. Não é efetuada uma limpeza parcial silenciosa.

## Estado da verificação

A abertura oficial de 15/11/2026 também bloqueia a recriação dos registos pelo
cliente antes dessa data. A interface informa dessa limitação e desativa a reposição
até às 00h00 de Lisboa; as cópias privadas do arquivo permanecem guardadas.

A alteração do código não prova a execução no Firestore de produção. É necessário
obter o inventário autenticado, confirmar os registos concretos e verificar a referência
do arquivo e os totais devolvidos após execução. Sem essa leitura não se deve declarar
que os registos já foram retirados da base de dados.

As rotas públicas antigas de ensaio já redirecionam para áreas oficiais e as APIs
sandbox/simulações respondem com HTTP 410 em modo de produção. Os testes automáticos
do repositório são verificações técnicas e devem ser preservados.

# Media Center — operação editorial

Estado inicial: implementado em `feature/media-center`, sem autorização de divulgação.
A página e os quatro documentos estão em rascunho. Não publicar a pré-visualização.

## Ficheiros e estrutura

- `src/pages/MediaCenterPage.js` e `src/mediaCenter.css`: página PT/EN.
- `src/data/mediaCenter.json`: configuração editorial, versão, idioma, data, ordem, estado, nomes, tamanho e SHA-256.
- `src/data/mediaAccess.js`: visibilidade do menu, rodapé e rota.
- `server/media.mjs`: bloqueio de rascunhos, downloads verificados, SEO HTML, redirecionamento permanente `/press`.
- `scripts/build-media.mjs`: inclui apenas ficheiros explicitamente publicados no build normal.
- `scripts/preview-media.mjs`: servidor de revisão exclusivamente em loopback.
- `private-data/media/`: Word originais e PDFs convertidos. Ignorado pelo Git; nunca em `public/`.
- `server/test/media.test.mjs`: verificações de isolamento, downloads e redirecionamento.

Os PDF foram convertidos dos Word fornecidos em 27/09/2026, sem alterações ao conteúdo.
A nota tem data editorial 29/09/2026. A Fact Sheet não tem data editorial indicada: mostra a versão Final, sem inventar uma data.

## Rever localmente

Node 22 ou superior; executar `npm ci`, `npm run build:media-preview` e `npm run preview:media`.
Abrir `http://127.0.0.1:4173/media` na máquina do servidor.
O preview fica em `.media-preview/`, separado de `build/`, escuta apenas em 127.0.0.1 e usa `noindex` e `no-store` nas rotas Media.
NÃO servir esse diretório publicamente ou alterar o bind para 0.0.0.0 sem proteção externa adequada.
Não foi criado um endereço remoto de revisão. Para isso, configurar proteção de acesso no alojamento antes de transferir qualquer documento em rascunho.

## Substituir uma versão

1. Guardar os novos PDF/DOCX finais em `private-data/media/` e manter o documento em `draft` durante a revisão.
2. Atualizar o registo correspondente em `src/data/mediaCenter.json`: título/descrição PT/EN, categoria, idioma real, versão, data editorial real ou null, estado e ordem.
3. Atualizar `files.pdf` e `files.docx` com nome, tamanho em bytes e SHA-256. Usar `node scripts/update-media-metadata.mjs` para obter valores reais dos ficheiros.
4. Gerar a pré-visualização e verificar os documentos. A data editorial não autoriza a divulgação.
5. Só depois da autorização expressa, definir `published: true` ao nível da página e `status: "published"` nos documentos autorizados.
6. Executar `npm run build`. Este processo valida hashes, assinaturas e tamanhos; ficheiros divergentes impedem a compilação. Os ficheiros publicados são copiados para `build/media-files/`.
7. Publicar o build e o Worker pelos procedimentos Cloudflare já existentes. Garantir que `/media`, `/media/`, `/press`, `/press/` e `/media-files/*` passam pelo Worker (`run_worker_first`). Não substituir o Worker por alojamento SPA puramente estático.
8. Verificar `/media`, `/press` (301), quatro downloads e ficheiros sem login. Confirmar MIME, conteúdo e tamanho; não basta HTTP 200. O Worker recusa HTML ou conteúdo divergente mesmo se o alojamento fizer fallback para a SPA.

URLs estáveis depois da publicação: `/media-files/Nota_Imprensa_CIRC2027_FINAL.pdf`, `.docx`, `/media-files/Fact_Sheet_CIRC2027_FINAL.pdf`, `.docx`.
Downloads publicados usam revalidação para permitir substituição no mesmo endereço.
Nenhuma regra Firestore/Storage, permissão, inscrição, pagamento ou submissão foi alterada.
O rodapé institucional existente fica omitido apenas nesta página para não presumir autorização de utilização dos logótipos na área de imprensa.

## Crescimento futuro

`resources` está reservado e vazio. Não apresenta cartões sem materiais.
Recursos futuros precisam de título, categoria, idioma, versão/data, estado, ordem e ficheiros verificados; fotografias precisam também de legenda, crédito, ano e condições de utilização confirmados.
Fotografias de 2025 devem identificar a edição anterior. Não incluir dossier CA ou estudos Cores/CIRC27_PROPA1.
Os textos da interface são traduzidos; os documentos continuam identificados como portugueses, incluindo na interface EN.

## Validação

`node --test server/test/*.mjs`
`CI=true npm test -- --watchAll=false --runInBand`
`npm run build`

Os testes de ficheiros usam os quatro documentos privados na máquina de revisão; uma máquina sem esses ficheiros deve recebê-los por canal privado antes de os executar.

Resultado desta implementação: compilação normal e de preview concluídas; 117 testes React e 13 testes Node aprovados. GET local dos quatro downloads confirmou HTTP 200, tamanho e SHA-256; o build normal não contém a pasta media-files. Os dois PDFs foram revistos visualmente, uma página cada.
Limitação: a revisão visual da página em browser (desktop/mobile, foco e overflow) não foi concluída porque o browser do ambiente não iniciou. Não há URL remoto de pré-visualização nem publicação efetuada.

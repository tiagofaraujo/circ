# Validação de TSDT da ULS Coimbra

Validação MEC–nome no Firebase Spark, disponível para qualquer conta com email
confirmado cujo MEC e nome completo correspondam à lista privada importada.
Não exige `roles.ulsPilot` nem uma lista de emails no frontend.

## Correspondência

1. O participante inicia sessão e guarda o nome completo no perfil My CIRC.
2. Introduz o MEC. Os zeros iniciais, se existirem na lista, são preservados.
3. O frontend deriva a chave do nome. As regras Firestore voltam a calcular essa
   chave a partir do nome guardado em `users/{uid}` e comparam-na com o registo
   privado `ulsRoster/{mec}`. Uma chave enviada pelo browser, isoladamente, não
   concede elegibilidade.
4. São aceites diferenças de maiúsculas, acentos portugueses, marcas combinantes,
   pontuação, espaços e partículas `d`, `da`, `das`, `de`, `do`, `dos`.
   A ordem e todos os restantes elementos do nome têm de corresponder.
5. Uma escrita atómica cria `ulsEligibility/{uid}`, a reserva exclusiva
   `ulsMecClaims/circ-2027_{mec}` e a chave do perfil. Se alguma condição falhar,
   nenhuma parte da escrita é guardada.
6. A interface só confirma a correspondência depois de receber do servidor o
   estado ativo do próprio registo na lista.

Este método confirma a correspondência de dados, não a identidade ou a posse
de um email institucional. Quem conhecer o MEC e nome completo de outra pessoa
poderá tentar associá-los à sua conta. Os casos contestados devem ser tratados
pelo secretariado antes de atribuir benefícios. A abertura geral é uma decisão
da organização e mantém esta limitação do método MEC–nome.

## Lista privada e importação

A elegibilidade é determinada pela lista fornecida pela organização. Uma lista
apenas de Radiologia não inclui automaticamente outras profissões TSDT.
Não colocar o Excel, JSON de colaboradores ou credenciais no repositório,
no diretório público do site ou nas variáveis de build.

O importador aceita um JSON privado com 1–500 pares, rejeita MEC duplicados e
valida toda a lista antes de gravar. Exemplo fictício:

```json
[
  { "mec": "007315", "name": "ANA FILIPA DE SA" }
]
```

Executar na pasta `functions`:

```sh
npm install --no-audit --no-fund
node scripts/import-uls-roster.js --file /caminho-privado/uls-roster.json --project circ-coimbra
node scripts/import-uls-roster.js --file /caminho-privado/uls-roster.json --project circ-coimbra --check
node scripts/import-uls-roster.js --file /caminho-privado/uls-roster.json --project circ-coimbra --apply
```

O primeiro comando de importação só valida o ficheiro, sem acesso ao Firebase.
`--check` compara com os registos existentes sem gravar. `--apply` usa uma
transação para aplicar toda a lista. Os dois últimos precisam de Application
Default Credentials de uma conta autorizada no projeto.

Uma nova entrada contém `eventId: circ-2027`, `active: true`, `nameKey`,
`profileName` e `importedAt`. O `profileName` preserva a grafia original para
consulta administrativa; a autorização compara a chave normalizada.

Uma reimportação preserva o estado `active`, a grafia já guardada e todas as
reservas MEC. A entrada do piloto continua válida mesmo que o Excel use
maiúsculas ou omita «de». Um MEC existente com uma identidade diferente faz
abortar a importação inteira. Entradas ausentes do ficheiro não são eliminadas
nem desativadas automaticamente. Os comandos mostram apenas contagens.

## Passar do piloto à utilização geral

1. Validar e importar a lista privada com os comandos anteriores.
2. Publicar as regras desta versão no projeto explícito:

   ```sh
   firebase deploy --only firestore:rules --project circ-coimbra
   ```

3. Publicar a versão do frontend que remove a restrição à conta piloto.
4. No Cloudflare, em **Workers & Pages → circ → Configurações → Build → Variáveis
   e segredos**, manter `REACT_APP_ULS_VERIFICATION_ENABLED=true`.
   `REACT_APP_ULS_PILOT_EMAILS` deixa de ser lida e pode ser removida.
5. Executar um novo build de `main` para incluir a configuração no frontend.
6. Confirmar um MEC com uma conta elegível fora do piloto e verificar a
   persistência após atualizar a página. A conta piloto já associada mantém-se
   válida e não precisa de repetir a associação.

Não é preciso adicionar permissões a cada perfil. As restantes permissões de
administração, submissões e secretariado mantêm-se separadas.

Este percurso usa Authentication e Firestore, sem Cloud Functions, SMTP,
Secret Manager ou TTL. O consumo fica sujeito às quotas gratuitas do plano
Spark; não é necessário ativar faturação para esta validação.

## Acessos e operação

| Coleção | Acesso do navegador |
| --- | --- |
| `ulsRoster/{mec}` | Após a correspondência, leitura apenas da própria entrada; listagem, outras entradas e escrita negadas |
| `ulsEligibility/{uid}` | Leitura pelo próprio/administrador; criação apenas na associação validada; sem alteração ou eliminação pelo navegador |
| `ulsMecClaims/{eventId_mec}` | Criação apenas na associação validada; sem leitura, alteração ou eliminação pelo navegador |
| `users/{uid}` | Perfil próprio; `roles` protegido; nome e chave bloqueados após a associação |

- Um erro de correspondência não revela se o MEC existe nem qual é o nome da lista.
- A desativação de `ulsRoster/{mec}.active` retira a confirmação e impede novas
  operações com benefícios ULS. Cancelamentos e reembolsos administrativos de
  inscrições anteriores continuam permitidos nas condições de auditoria.
- Apagar o perfil não liberta o MEC para outra conta. Correções e transferências
  exigem revisão administrativa dos documentos relacionados.
- Esta alteração abre a validação MEC. Não ativa pagamentos nem altera os
  controlos atuais de criação de inscrições e encomendas.
- Qualquer futuro checkout com Admin SDK deve repetir a validação no servidor,
  pois o Admin SDK não aplica as regras de segurança Firestore.

## Verificação

Os testes cobrem contas verificadas fora do piloto, email não confirmado,
normalização de nomes, chave forjada, nome incompleto, duplicação de MEC,
privacidade da lista, bloqueio de permissões, revogação, eliminação do perfil,
compatibilidade com a associação piloto e reimportação sem reativar registos.

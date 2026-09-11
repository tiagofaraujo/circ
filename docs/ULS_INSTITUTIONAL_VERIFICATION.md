# Validação ULS Coimbra — percurso sem custos

Estado: preparado para piloto no plano Firebase Spark. A validação fica desativada até serem publicadas as regras, importado o único registo piloto e ativada a variável do frontend. Este percurso não utiliza Cloud Functions, SMTP, Secret Manager ou TTL.

O piloto está limitado à conta que recebe a permissão privada `roles.ulsPilot` no Firestore e que é indicada na variável pública de apresentação do frontend. A lista de colaboradores é privada e nunca deve ser incluída no repositório, nas variáveis públicas do site ou nos logs.

## O que é validado

1. O participante inicia sessão com uma conta Firebase cujo email já foi confirmado.
2. O nome completo guardado em `users/{uid}` é normalizado: maiúsculas, sem acentos, pontuação ou partículas portuguesas (`d'`, `da`, `das`, `de`, `do`, `dos`).
3. O participante indica o MEC.
4. As regras do Firestore comparam, sem entregar a lista ao browser, o MEC e a chave do nome com `ulsRoster/{mec}`.
5. Uma única escrita atómica cria a elegibilidade e a reserva exclusiva do MEC. Se qualquer condição falhar, nada é gravado.
6. Depois da correspondência, o participante não pode alterar o nome do perfil nem reutilizar o MEC noutra conta. Uma correção passa pelo secretariado.

Este mecanismo confirma apenas que foi introduzido um par MEC–nome presente na lista. Não prova a identidade ou a posse de um contacto institucional: alguém que conheça ambos os dados poderá tentar utilizá-los. Por isso, a primeira fase permanece limitada à conta piloto, apresenta sempre um erro genérico e deve ter revisão administrativa antes de ser aberta a todos.

## Dados e acesso

| Coleção | Conteúdo | Acesso do navegador |
| --- | --- | --- |
| `ulsRoster/{mec}` | edição, estado ativo e chave normalizada do nome | nenhum |
| `ulsMecClaims/{eventId_mec}` | reserva exclusiva do MEC para um UID | nenhum |
| `ulsEligibility/{uid}` | resultado da correspondência, MEC, UID e edição | leitura pelo próprio e administrador; criação apenas pelo lote validado nas regras |
| `users/{uid}` | perfil e `ulsNameKey` derivada do nome | próprio utilizador e administrador |

O campo `ulsNameKey` isolado não concede a tarifa. A inscrição ULS só é aceite quando continuam coerentes o perfil, a entrada ativa da lista, a elegibilidade e a reserva exclusiva.

## Preparar o registo piloto

Criar um ficheiro JSON privado, fora do repositório. O importador aceita entre 1 e 500 objetos, rejeita MEC duplicados e normaliza o nome exatamente como o frontend. O exemplo seguinte é fictício:

```json
[
  {
    "mec": "7315",
    "name": "ANA FILIPA DE SA"
  }
]
```

Na pasta `functions`, instalar as dependências e começar sempre pela simulação:

```sh
npm install
node scripts/import-uls-roster.js --file /caminho-privado/uls-piloto.json --project circ-coimbra
```

Depois de confirmar a mensagem de validação, autenticar o Firebase CLI com uma conta autorizada ou configurar Application Default Credentials e aplicar:

```sh
node scripts/import-uls-roster.js --file /caminho-privado/uls-piloto.json --project circ-coimbra --apply
```

O importador não imprime MEC nem nomes. Uma reimportação não reativa registos desativados, não altera reservas e é interrompida se encontrar dados incompatíveis.

Para um piloto manual, também é possível criar na consola Firebase o documento `ulsRoster/{MEC_PILOTO}` com estes campos e tipos:

| Campo | Tipo | Valor |
| --- | --- | --- |
| `eventId` | string | `circ-2027` |
| `active` | boolean | `true` |
| `nameKey` | string | chave normalizada produzida pelo ensaio do importador |

Não criar esse documento numa coleção legível publicamente.

## Publicar e ativar o piloto

1. Executar os testes da aplicação e das regras no emulador.
2. Publicar apenas as regras do Firestore no projeto explícito:

   ```sh
   firebase deploy --only firestore:rules --project circ-coimbra
   ```

3. Depois de a conta piloto guardar o perfil, abrir `users/{uid}` na consola e acrescentar `roles.ulsPilot` com o valor booleano `true`. Não permitir que o próprio utilizador edite `roles`.
4. Confirmar na consola Firebase que existe apenas a entrada piloto correta em `ulsRoster`.
5. No ambiente de produção do frontend, definir:

   ```text
   REACT_APP_ULS_VERIFICATION_ENABLED=true
   REACT_APP_ULS_PILOT_EMAILS=<EMAIL_DA_CONTA_PILOTO>
   ```

6. Reconstruir/publicar o site e ensaiar com a conta piloto: nome correto, MEC correto, atualização da página, nova sessão, nome errado e tentativa de reutilização.

Não existe uma região de Functions para configurar neste percurso. Não ativar faturação, funções, SMTP ou TTL. A eliminação automática por TTL é uma funcionalidade faturada e não é necessária para estes três documentos persistentes.

## Operação e recuperação

- Um erro de correspondência nunca deve indicar se falhou o MEC, o nome ou uma reserva existente.
- Não eliminar automaticamente a reserva quando a conta é apagada; isso permitiria reutilizar o MEC sem análise.
- Para corrigir um nome ou transferir um MEC, o secretariado confirma a identidade por outro canal e altera de forma controlada `ulsEligibility`, `ulsMecClaims` e, se necessário, `ulsRoster`.
- Antes de abrir a todos os colaboradores, substituir a conta piloto por uma política revista, confirmar a lista e realizar uma avaliação de proteção de dados.
- Um futuro checkout executado com Admin SDK terá de repetir esta validação no servidor, porque o Admin SDK ignora as regras Firestore.

## Testes incluídos

Os testes cobrem normalização de acentos, pontuação e partículas do nome, MEC inválido, correspondência correta, nome incorreto, conta fora do piloto, reutilização do MEC, privacidade da lista e bloqueio do nome depois da confirmação.

Nenhum registo é importado e nenhuma regra é publicada automaticamente por esta alteração.

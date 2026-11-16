# Gestão de inscrições e faturação

`paulojaneiro77@gmail.com`, com email verificado no Firebase, tem acesso de gestão aos módulos **Gestão de inscrições** e **Faturação**. A autorização é definida em `src/auth/registrationPermissions.js`, partilhada pelo cliente e pelas APIs, e corresponde a `canManageRegistrations()` nas regras Firestore.

O acesso inclui listas, estatísticas, exportação, observações, registo de reembolsos já efetuados, consulta da situação fiscal, retoma de emissão elegível, resumo financeiro, diagnóstico dos serviços e ligação TOConline. As confirmações e verificações existentes mantêm-se. Os registos de auditoria identificam a conta que executa a ação.

Este acesso não torna a conta administradora global. Empresas e vouchers, transferências bancárias, preparação de produção, gestão científica, secretariado, permissões de outras contas e configuração geral continuam sujeitos às suas autorizações próprias. A operação histórica de arquivo da inscrição de teste do titular continua restrita ao titular.

## Publicação

Publicar **primeiro as regras Firestore**, a partir da versão validada desta alteração, numa sessão autenticada com acesso ao projeto `circ-coimbra`:

```sh
npx --yes firebase-tools@15.30.0 deploy --only firestore:rules --project circ-coimbra --config firebase.json
```

Depois integrar o PR em `main` e verificar a publicação automática do Worker Cloudflare. Esta ordem mantém a consulta atual do Paulo a funcionar até à ativação da gestão. A publicação do Worker por si só não publica as regras Firestore.

Após ambas as publicações, atualizar a página do My CIRC. Se necessário, terminar sessão e entrar novamente. Confirmar os dois menus e a leitura dos dados sem efetuar pagamentos, emitir documentos ou registar reembolsos para testar permissões.

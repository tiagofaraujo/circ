# Acesso às transferências no My CIRC — 11/10/2026

O módulo de conferência já estava ligado no `AdminModuleNav`, mas faltava no menu lateral do `MyCircShell` e nos atalhos da página inicial `MyCircHome`. Não era suficiente indicar ao organizador que o menu já existia.

Acrescentada a entrada **Transferências — teste**, destino `/admin/transferencias-teste`, em dois locais:

- Computador: menu lateral do My CIRC → Gestão → Transferências — teste.
- Computador e telemóvel: Início → Área de gestão → Transferências — teste. No telemóvel, Início permanece na navegação inferior; não depende de uma barra lateral oculta.

Os dois acessos usam a permissão existente `canManageRegistrations`, com tradução PT/EN e destaque de rota ativa no menu lateral. Não foi criada uma rota de produção nem alterada a autorização da página/API. Nenhuma mudança em pagamentos, IBAN, comprovativos, inscrições, permissões, Firebase ou cache.

## Verificação

A nova suite `TransferNavigation.test.js` reproduziu antes da correção quatro falhas de ausência dos atalhos. Depois, os dez casos passaram. Com as cinco regressões de `MyCircHome.test.js`, passaram 15 testes locais. Os ficheiros de navegação locais foram comparados por SHA com os ficheiros lidos da base `a68ae4c` antes da alteração. Os testes locais usam autenticação/dados simulados; a CI executa a bateria integral no commit da alteração antes da integração.

Cobertura: menu lateral, atalho inicial sem sidebar, destino após clique, estado ativo com parâmetros de pedido, PT/EN, ocultação para participante/revisor/secretariado/gestão científica e utilizador sem sessão. Sem criar nem confirmar pagamentos durante os testes.

A publicação bem-sucedida e o resultado da sessão real do organizador são verificações distintas. Para conferir a interface: entrar com a conta administradora, recarregar My CIRC e abrir uma das entradas acima.

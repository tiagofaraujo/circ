# TOConline — ligação OAuth só de leitura (17/10/2026)

## Objetivo

Validar a ligação real à API do TOConline **sem emitir, alterar ou apagar documentos**.

O módulo administrativo `/admin/recibos-teste` passa a poder:

- iniciar autorização OAuth para o scope `commercial`;
- manter os tokens exclusivamente num cookie `HttpOnly + Secure`, cifrado pelo Worker;
- renovar o access token quando necessário;
- executar apenas uma lista fechada de pedidos `GET`;
- consultar configuração contabilística necessária para preparar a futura emissão de Fatura-recibo.

Não existe neste conector qualquer rota TOConline `POST`, `PATCH` ou `DELETE` para recursos comerciais.

> O TOConline não disponibiliza um scope OAuth separado de leitura. O scope oficial é `commercial`; a limitação a leitura é aplicada pelo servidor CIRC.

## Callback a configurar no TOConline

```text
https://circ-coimbra.org/api/fiscal/toconline/callback
```

No TOConline, o acesso à API é solicitado por um utilizador Empresário/administrador em:

```text
Empresa → Configurações → Dados API
```

O integrador recebe por email um link temporário para obter:

- Client ID;
- Client Secret;
- OAuth URL;
- API URL.

Nunca versionar nem enviar por chat o Client Secret, access token, refresh token ou authorization code.

## Configuração do Worker Cloudflare

Variável não secreta já versionada:

```text
TOCONLINE_REDIRECT_URL=https://circ-coimbra.org/api/fiscal/toconline/callback
```

Configurar no Worker `circ`:

```text
TOCONLINE_OAUTH_CLIENT_ID
TOCONLINE_OAUTH_CLIENT_SECRET
TOCONLINE_OAUTH_URL
TOCONLINE_API_URL
TOCONLINE_SESSION_KEY
```

`TOCONLINE_SESSION_KEY` é um segredo aleatório do próprio CIRC com pelo menos 32 caracteres e não é fornecido pelo TOConline.

## Segurança da sessão OAuth

1. A criação da autorização exige sessão Firebase da conta administradora verificada.
2. O pedido de escrita local exige `Origin` igual ao site.
3. É criado um nonce aleatório e um `state` HMAC com validade de 10 minutos.
4. O callback valida o `state` e o cookie nonce antes de trocar o código.
5. Client Secret e troca de tokens existem apenas no servidor.
6. Access token e refresh token são cifrados em AES-256-GCM num cookie `HttpOnly; Secure`.
7. O access token tem a validade indicada pelo TOConline (documentação: 4 horas).
8. O refresh token é tratado como sessão curta (documentação: 8 horas); depois disso é pedida nova autorização.
9. O browser nunca recebe os tokens em JSON, HTML, localStorage ou sessionStorage.
10. "Desligar TOConline" elimina o cookie de sessão no navegador.

## Recursos de leitura permitidos

O servidor contém uma lista fixa. Não aceita um URL/recurso enviado pelo navegador.

- `GET commercial_document_series?filter[document_type]=FR`
- `GET services`
- `GET taxes?filter[tax_country_region]=PT`
- `GET tax_exemption_reasons`
- `GET bank_accounts`
- `GET units_of_measure`
- `GET currencies?filter[iso_code]=EUR`

Os resultados devolvidos ao browser são reduzidos aos campos necessários ao diagnóstico. As respostas completas do prestador e os tokens não são registados.

## Sequência do teste

1. Configurar as credenciais no Worker.
2. Abrir `/admin/recibos-teste`.
3. Confirmar que o painel indica "configurado".
4. Carregar em "Autorizar TOConline em modo só de leitura".
5. Autorizar a ligação no TOConline.
6. Regressar automaticamente ao CIRC.
7. Carregar em "Atualizar dados de configuração".
8. Confirmar:
   - série(s) FR;
   - serviços existentes;
   - taxas de IVA PT;
   - motivos de isenção;
   - conta(s) bancária(s);
   - unidade `un`;
   - moeda EUR.
9. Não ativar emissão real até a contabilidade confirmar série, serviços e enquadramento de IVA/isenção.

## Referências oficiais consultadas

- https://api-docs.toconline.pt/setup-do-postman
- https://api-docs.toconline.pt/autenticacao-simplificada
- https://api-docs.toconline.pt/autenticacao-detalhada
- https://api-docs.toconline.pt/caracteristicas-dos-pedidos
- https://api-docs.toconline.pt/apis/vendas/documentos-de-venda
- https://api-docs.toconline.pt/apis/empresa/produtos-e-servicos
- https://api-docs.toconline.pt/apis/apis-auxiliares/documentos-de-serie
- https://api-docs.toconline.pt/apis/apis-auxiliares/taxas
- https://api-docs.toconline.pt/apis/apis-auxiliares/contas-bancarias
- https://api-docs.toconline.pt/apis/apis-auxiliares/unidades-de-medida
- https://api-docs.toconline.pt/apis/apis-auxiliares/unidade-monetaria

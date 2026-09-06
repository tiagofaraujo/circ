# CIRC 2027 — preparação Google Play

Documento de trabalho para a futura publicação da aplicação Android baseada na PWA/TWA do CIRC.

## Identidade da app

- **Nome proposto na Google Play:** CIRC 2027
- **Programador/organização:** Associação Hemisfério Disciplinado (AHD)
- **Website:** https://circ-coimbra.org/
- **Recurso Web para eliminação de conta:** https://circ-coimbra.org/eliminar-conta
- **Application ID proposto:** `org.hemisferiodisciplinado.circ`

> O Application ID é apenas uma proposta nesta fase. Deve ser confirmado antes de criar a aplicação definitiva na Play Console e antes de gerar o ficheiro `assetlinks.json`.

## Ficha da loja — PT

### Breve descrição

Programa, inscrições, submissões e área pessoal do CIRC 2027 em Coimbra.

### Descrição completa — rascunho

A aplicação oficial do CIRC 2027 reúne num único espaço digital a informação e os serviços do Congresso Internacional de Radiologia de Coimbra.

Consulte o programa, acompanhe informação sobre participação e organização e aceda ao My CIRC para gerir os seus dados e serviços associados ao evento.

Funcionalidades previstas e/ou disponibilizadas através da plataforma CIRC:

- programa e informação do congresso;
- informação sobre cursos pré-congresso;
- My CIRC e perfil de participante;
- inscrições e serviços adicionais, quando abertos;
- submissões científicas e respetivo acompanhamento, quando abertas;
- informação sobre Coimbra, local do evento, parceiros e exposição;
- acesso a documentação e funcionalidades de participante que sejam ativadas para o CIRC 2027.

O CIRC 2027 realiza-se em Coimbra, Portugal, de 8 a 10 de abril de 2027.

Organização: Associação Hemisfério Disciplinado.

## Ficha da loja — EN

### Short description

Programme, registration, submissions and My CIRC for CIRC 2027 in Coimbra.

### Full description — draft

The official CIRC 2027 app brings together information and digital services for the Coimbra International Radiology Congress.

Browse the programme, access participation and organisational information, and use My CIRC to manage your participant profile and event-related services.

Features planned and/or made available through the CIRC platform include:

- congress programme and information;
- pre-congress course information;
- My CIRC participant account and profile;
- registrations and add-on services when open;
- scientific submissions and status tracking when open;
- information about Coimbra, the venue, partners and exhibition;
- participant documents and other services activated for CIRC 2027.

CIRC 2027 takes place in Coimbra, Portugal, from 8 to 10 April 2027.

Organised by Associação Hemisfério Disciplinado.

## Data Safety — rascunho para auditoria final

A declaração final da Google Play tem de ser feita com base na versão efetivamente publicada da aplicação e nos serviços/SDKs ativos nessa data. O quadro abaixo é deliberadamente conservador.

| Categoria | Situação conhecida | Finalidade principal | Nota antes da publicação |
| --- | --- | --- | --- |
| Nome | Ativo | Conta, perfil, inscrição | Declarar recolha |
| Email | Ativo | Autenticação, conta, comunicações operacionais | Declarar recolha |
| Data de nascimento | Ativo no perfil | Perfil/gestão de participante | Declarar recolha se mantido na versão Play |
| Sexo/género | Ativo no perfil, opcional | Perfil | Reavaliar necessidade/minimização |
| Telemóvel | Ativo no perfil, opcional | Contacto/gestão de participante | Declarar recolha se mantido |
| País/morada/código postal/localidade | Ativo no perfil | Perfil e faturação | Declarar recolha |
| NIF/VAT | Ativo no perfil, opcional | Faturação | Declarar recolha; confirmar enquadramento da categoria Google |
| Profissão/instituição/cédula profissional | Ativo | Elegibilidade, perfil profissional, inscrição | Declarar como informação pessoal/profissional conforme formulário disponível |
| Fotografia de perfil | Pode vir da Conta Google | Perfil | Declarar se transmitida/armazenada fora do dispositivo |
| Identificador Firebase UID | Ativo | Gestão técnica da conta | Declarar conforme categoria de identificadores |
| Estado de presença/última atividade | Ativo | Operação/administração da plataforma | Rever categoria de atividade/diagnóstico aplicável |
| Dados de inscrição | Em implementação/teste | Gestão da participação | Auditar novamente quando inscrições reais abrirem |
| Dados de pagamento | Ainda não em produção | Processamento de inscrição/pagamento | Declarar apenas de acordo com o fluxo e PSP final; nunca assumir que dados de cartão passam pelos servidores CIRC |
| Submissões científicas | Atualmente teste administrativo local | Serviço científico | Auditar quando a persistência real for ativada |
| Ficheiros/documentos | Planeados | Certificados, comprovativos e documentação | Auditar quando Cloud Storage estiver em produção |

### Serviços de terceiros a auditar

- Google Firebase Authentication;
- Cloud Firestore;
- Cloud Storage, quando ativo;
- Google sign-in e eventual Microsoft sign-in;
- Cloudflare/infrastrutura de entrega;
- EmailJS no formulário de contacto;
- futuro prestador de pagamentos;
- qualquer ferramenta de analítica que venha a ser adicionada.

## Eliminação de conta

A aplicação já disponibiliza eliminação autenticada em `My CIRC > Segurança`.

Existe também um recurso Web público em `/eliminar-conta`, destinado a cumprir o requisito de acesso externo à eliminação de conta. O utilizador pode autenticar-se no website e concluir a eliminação sem instalar a aplicação.

A eliminação automática atual remove:

- perfil `users/{uid}` do Firestore;
- conta Firebase Authentication;
- dados locais de perfil My CIRC no browser.

Antes de ativar inscrições reais, pagamentos, certificados ou submissões persistentes, deve ser implementada e auditada uma política de eliminação/anonymização das restantes coleções associadas ao utilizador. Registos que tenham obrigação legal de conservação devem ser separados da conta ativa e a respetiva retenção deve ser claramente descrita na Política de Privacidade.

## Assets ainda necessários

- ícone final Google Play 512×512;
- ícone `maskable` PWA/Android;
- feature graphic Google Play;
- screenshots reais da app em Android;
- screenshots opcionais de tablet, caso se decida suportar/otimizar essa apresentação;
- revisão visual final do nome, splash e cores.

## Android/TWA ainda necessário

- confirmar Application ID definitivo;
- gerar projeto Trusted Web Activity;
- gerar chave de assinatura;
- obter fingerprint SHA-256;
- criar `/.well-known/assetlinks.json` com package e fingerprint reais;
- gerar Android App Bundle `.aab`;
- testar em dispositivo Android;
- ativar Play App Signing e configurar faixas de teste/publicação.

## Pontos que exigem intervenção humana

1. Criar ou validar a conta Google Play Console em nome da organização.
2. Concluir verificações de identidade/organização solicitadas pela Google.
3. Confirmar o Application ID definitivo antes da primeira publicação.
4. Guardar de forma segura a chave/credenciais de assinatura quando forem geradas.
5. Aprovar os assets gráficos finais da ficha da loja.
6. Preencher/confirmar as declarações legais e de Data Safety na Play Console com base na versão final publicada.

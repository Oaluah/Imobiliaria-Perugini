# Perugine — Gestão Imobiliária

Sistema web acadêmico para apoiar a gestão de uma imobiliária. A aplicação reúne imóveis, pessoas, contratos, recebimentos, repasses, visitas e equipe em uma interface em português.

Este README explica como preparar e executar o projeto em um computador Windows. Não é necessário instalar PostgreSQL separadamente se você usar Docker Desktop.

## O que o sistema faz

- **Visão geral:** indicadores da carteira, cobranças em atraso, contratos próximos do vencimento e recebimentos do dia.
- **Cadastros:** imóveis com fotos; pessoas nos papéis de proprietário, inquilino, fiador, interessado ou funcionário; documentos anexos; controle de chaves e fila de interessados.
- **Contratos e caixa:** contratos de locação, cobranças mensais, extrato por contrato, registro de recebimento, recibos para impressão e cálculo de reajuste anual por IPCA ou IGP-M.
- **Agenda e equipe:** visitas, vistorias, ocorrências, contas de acesso e permissões.

O Financeiro separa 10% de comissão da imobiliária e 90% de repasse previsto ao proprietário. O reajuste consulta as séries mensais oficiais do Banco Central quando solicitado e exige confirmação de uma pessoa autorizada.

### Limites desta versão

Este é um protótipo local para desenvolvimento acadêmico. O reajuste depende de conexão com a internet. Auditoria completa, encerramento de contratos e fluxos de produção para recuperação de senha ainda não estão implementados. Use dados fictícios; não use o protótipo para guardar dados pessoais reais.

## Requisitos

- Windows 10 ou 11.
- Node.js 22.12 ou superior na linha 22. Confira no terminal com `node --version`.
- npm, instalado junto com Node.js. Confira com `npm --version`.
- Docker Desktop com WSL 2 **ou** uma instalação local do PostgreSQL 17.
- Git, se você for clonar o repositório.
- IntelliJ IDEA é opcional; qualquer terminal PowerShell também funciona.

## Preparar o projeto

### 1. Obter os arquivos

Se você já recebeu ou baixou a pasta do projeto, abra-a no IntelliJ em **File > Open**. Se for clonar o repositório, use o endereço GitHub fornecido pela equipe e abra a pasta clonada.

No IntelliJ, abra o terminal integrado. Antes de continuar, confirme que o terminal está na pasta principal do projeto, a que contém este `README.md` e o `package.json` da raiz:

```powershell
Get-Location
Get-ChildItem package.json
```

Se `package.json` não aparecer, navegue até a pasta `perugine-web` antes de executar os próximos comandos.

### 2. Instalar as dependências

Execute uma vez na pasta principal:

```powershell
npm install
```

O projeto usa workspaces npm: a interface fica em `web/` e a API em `api/`. Instale as dependências pela raiz para preparar os dois.

### 3. Criar o arquivo de ambiente

Copie o modelo:

```powershell
Copy-Item .env.example .env
```

Abra o arquivo `.env` recém-criado em um editor de texto. Ele deve conter:

```dotenv
DATABASE_URL="postgresql://perugine:perugine_dev@localhost:5432/perugine?schema=public"
API_PORT=3001
AUTH_SECRET="COLE_AQUI_UMA_CHAVE_ALEATORIA"
```

Gere uma chave aleatória para `AUTH_SECRET` no PowerShell:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Copie o resultado para o lugar de `COLE_AQUI_UMA_CHAVE_ALEATORIA` no `.env`. A chave precisa ter pelo menos 32 caracteres. Não compartilhe nem envie esse arquivo ao Git. O `.gitignore` já exclui `.env`.

### 4. Iniciar o PostgreSQL

#### Opção A — Docker Desktop (recomendada)

Abra o Docker Desktop e aguarde até ele indicar que está em execução. No terminal da pasta principal, rode:

```powershell
docker compose up -d postgres
```

Confira se o banco está pronto:

```powershell
docker compose ps
```

O container `perugine-postgres` deve aparecer como ativo/saudável. A configuração padrão cria localmente o banco `perugine`, usuário `perugine` e senha `perugine_dev`, correspondentes ao `DATABASE_URL` do `.env.example`. Esses dados são apenas para desenvolvimento local; não os reutilize em um ambiente compartilhado.

#### Opção B — PostgreSQL instalado no computador

Inicie o serviço PostgreSQL 17 e crie um banco, usuário e senha. Edite `DATABASE_URL` no `.env` com as credenciais e o nome do banco escolhidos. O usuário precisa ter acesso para criar e alterar tabelas nesse banco.

### 5. Criar as tabelas e carregar exemplos

Com o PostgreSQL ativo, execute na pasta principal:

```powershell
npm run db:generate
npm run db:push
npm run db:seed
```

- `db:generate` prepara o Prisma Client usado pela API.
- `db:push` cria ou atualiza as tabelas conforme `api/prisma/schema.prisma`.
- `db:seed` inclui exemplos fictícios para demonstrar o sistema.

A carga de exemplos é aditiva: pode ser executada novamente e não apaga os cadastros existentes. Ela inclui três imóveis com fotos, pessoas de diferentes perfis, duas locações, pagamentos, PDFs demonstrativos, uma chave, uma visita e uma vistoria. Os documentos não têm validade legal. As fotos são ilustrativas; a rotina copia os arquivos de `api/prisma/demo-assets/` para `api/uploads/`.

### 6. Iniciar a aplicação

Na **pasta principal**, execute:

```powershell
npm run dev
```

Esse comando inicia os dois processos no mesmo terminal:

- Interface web: **http://localhost:5173**
- API: **http://localhost:3001**
- Verificação da API e do banco: **http://localhost:3001/api/health**

Abra **http://localhost:5173** no navegador para usar o sistema. O terminal deve mostrar os registros da API e do Vite. Deixe-o aberto enquanto estiver usando a aplicação. Para encerrar os dois processos, pressione `Ctrl+C` nesse terminal.

Na primeira abertura, crie a conta administradora usando uma senha com pelo menos 12 caracteres. Depois, entre e, se necessário, use **Equipe e acessos** para criar usuários e ajustar permissões. A API guarda senhas em formato de hash; a sessão expira após 12 horas.

## Uso nos próximos dias

1. Abra o Docker Desktop.
2. Abra o projeto no IntelliJ e um terminal na pasta principal.
3. Inicie o banco, se ele ainda não estiver ativo:

   ```powershell
   docker compose up -d postgres
   ```

4. Inicie a aplicação:

   ```powershell
   npm run dev
   ```

5. Abra **http://localhost:5173** e entre com sua conta.

Não é preciso repetir `npm install`, `db:push` ou `db:seed` a cada abertura. Execute `db:push` depois de alterações no esquema; execute `db:seed` apenas quando quiser garantir que os exemplos de demonstração estejam carregados.

## Comandos úteis

Execute-os sempre na pasta principal:

| Comando | Para que serve |
| --- | --- |
| `npm run dev` | Inicia API e interface web juntas. |
| `npm run db:generate` | Gera/atualiza o Prisma Client. |
| `npm run db:push` | Sincroniza as tabelas do banco com o esquema atual. |
| `npm run db:seed` | Adiciona os exemplos fictícios, sem apagar registros. |
| `npm run db:studio` | Abre o Prisma Studio para consultar o banco. |
| `docker compose up -d postgres` | Inicia o banco no Docker. |
| `docker compose stop postgres` | Para o banco sem apagar os dados. |
| `docker compose start postgres` | Inicia novamente o container parado. |

Para consultar os dados, abra um segundo terminal na pasta principal e rode `npm run db:studio`. Use o endereço local mostrado no terminal (geralmente **http://localhost:5555**). Encerre o Prisma Studio com `Ctrl+C` no terminal em que ele está rodando.

> **Atenção:** `docker compose down -v` apaga o volume do PostgreSQL e, com ele, os dados locais. Não use esse comando se quiser preservar seus cadastros.

## Se algo não funcionar

### O terminal mostra apenas a API

Confira se o terminal está na pasta principal, não dentro de `api/`. Na raiz, `npm run dev` inicia API e interface juntas. Se preferir, abra outro terminal na raiz e rode somente a interface com:

```powershell
npm run dev --workspace=@perugine/web
```

Depois acesse **http://localhost:5173**. A mensagem `API Perugine disponível em http://localhost:3001` confirma apenas que a API iniciou; o Vite deve mostrar também o endereço da interface.

### A página avisa que não consegue carregar os dados

1. Confira se o terminal da aplicação continua aberto e sem erros.
2. Abra **http://localhost:3001/api/health**. Uma resposta com `"ok":true` indica que a API alcança o banco.
3. Atualize **http://localhost:5173**. Se aparecer a tela de login, entre novamente.
4. Confira se o PostgreSQL está ativo e se o `DATABASE_URL` no `.env` aponta para o mesmo banco usado pelo projeto.
5. Se aparecer um erro HTTP, anote a área e o código (por exemplo, imóveis/500) exibidos na tela; eles ajudam a localizar a falha.

### A porta já está em uso

As portas padrão são `3001` para a API, `5173` para a interface e `5432` para o PostgreSQL. Encerre o outro processo que estiver usando a porta ou ajuste `API_PORT` no `.env` e a configuração correspondente da interface antes de iniciar novamente.

### Prisma não conecta ao banco

Confirme se o Docker Desktop está ativo, se o container PostgreSQL está saudável e se usuário, senha, porta e nome do banco do `DATABASE_URL` estão corretos. Depois tente novamente:

```powershell
npm run db:generate
npm run db:push
```

## Estrutura do projeto

```text
perugine-web/
├── api/
│   ├── prisma/
│   │   ├── demo-assets/   # Fotos e documentos usados pelos exemplos
│   │   ├── schema.prisma  # Modelos e relações do banco
│   │   └── seed.js        # Carga de dados fictícios
│   ├── src/               # API Express e autenticação
│   └── uploads/           # Fotos/documentos enviados; não vai para o Git
├── web/src/               # Interface React e estilos
├── docker-compose.yml     # PostgreSQL local
├── .env.example           # Modelo de configuração local
└── package.json           # Comandos da raiz e workspaces npm
```

As fotos e documentos enviados ficam em `api/uploads/`; o PostgreSQL guarda os metadados e vínculos. Essa pasta é ignorada pelo Git. Os arquivos de demonstração versionados em `api/prisma/demo-assets/` permitem recriar os anexos executando o seed.

## Banco de dados

O esquema completo está em `api/prisma/schema.prisma`. As principais relações são:

```mermaid
erDiagram
  CLIENTE ||--o{ CONTRATO : inquilino
  CLIENTE ||--o{ CONTRATO : proprietario
  CLIENTE o|--o{ CONTRATO : fiador
  IMOVEL ||--o{ CONTRATO : locado
  CONTRATO ||--o{ PAGAMENTO : possui
  CONTRATO ||--o{ ADITAMENTO : reajustado
  IMOVEL ||--o{ VISITA : recebe
  CLIENTE ||--o{ VISITA : agenda
  IMOVEL ||--o{ VISTORIA : inspecionado
  IMOVEL ||--o{ FOTO_IMOVEL : imagens
  CLIENTE ||--o{ DOCUMENTO_CLIENTE : anexos
  USUARIO ||--o{ PERMISSAO_USUARIO : acessos
```

`db:push` é o fluxo simples usado para desenvolvimento local. O comando `npm run db:migrate` também existe para equipes que precisem manter um histórico formal de migrações; ele requer que o PostgreSQL permita ao Prisma criar um banco temporário.

## Git e segurança

- Não envie `.env`, senhas, tokens, arquivos reais de clientes ou a pasta `api/uploads/` ao repositório.
- O `.gitignore` exclui `.env`, `node_modules/`, arquivos enviados e saídas de build.
- Confira `git status` antes de fazer commit e inclua apenas código e os assets fictícios versionados em `api/prisma/demo-assets/`.
- Os dados do Compose são para desenvolvimento local. Antes de qualquer uso compartilhado, implemente HTTPS, proteção contra tentativas repetidas de login, recuperação de senha, backups e políticas de privacidade adequadas.

# Documentação das Ações Realizadas

## Objetivo
Registrar todas as ações realizadas para corrigir e preparar o projeto para execução local do servidor e compilação do cliente.

## O que foi feito

1. Verifiquei o arquivo `client/router/AppRouter.tsx` e identifiquei duplicação de hooks:
   - `useMock()` estava sendo chamado duas vezes.
   - `usePractice()` também estava sendo chamado duas vezes.

2. Ajustei `client/router/AppRouter.tsx` para:
   - usar apenas um `usePractice()` e um `useMock()`
   - extrair os valores necessários dos objetos retornados pelos hooks
   - consolidar o bloco de renderização de `AppView.RESULTS`
   - manter o fluxo de navegação e o uso correto de dados de prática e simulado

3. Verifiquei os arquivos `package.json` do projeto e do cliente para entender as dependências e scripts.

4. Identifiquei que o cliente não possuía o diretório `client/node_modules`, então instalei as dependências do cliente:
   - `cd client`
   - `npm install`

5. Executei o build do cliente para validar a correção:
   - `npm --prefix client run build`
   - O build foi bem-sucedido.
   - O aviso gerado foi apenas de tamanho de chunk grande (`> 500kB`) e importação dinâmica não transformada em chunk separado, mas não impediu a compilação.

6. Verifiquei o servidor local:
   - li `server/package.json`
   - li `server/index.js`
   - confirmei que as dependências do servidor já estavam instaladas em `server/node_modules`

7. Gerou o Prisma Client do servidor:
   - `cd server`
   - `npm run build`
   - Isso executou `npx prisma generate` com sucesso

8. Iniciei o servidor localmente:
   - `cd server`
   - `npm start`
   - O servidor subiu com sucesso em `http://localhost:4000`

## Observações finais

- A correção principal de código foi em `client/router/AppRouter.tsx`.
- A instalação de dependências do cliente e a geração do Prisma Client no servidor foram necessárias para rodar localmente.
- O servidor está atualmente rodando localmente no terminal ativo.

## Comandos importantes (a partir da raiz do projeto)

```bash
# Configurar e compilar o Cliente (Frontend)
cd client
npm install
npm run build

# Configurar e rodar o Servidor (Backend)
cd ../server
npm install
npm run build
npm start
```

## Ponto de atenção

- O cliente compilou com sucesso, mas exibiu aviso de chunk grande. Se quiser, posso também dividir o código em chunks menores usando `build.rollupOptions.output.manualChunks`.
- As variáveis de ambiente do servidor foram carregadas de `.env` e o servidor foi iniciado com `dotenv`.

# Configuração e Preparação do Ambiente Local

Este documento registra todas as etapas e modificações realizadas para configurar o ambiente de desenvolvimento local do projeto **Studr** na máquina do usuário Kaue Martins (Windows).

---

## 1. Objetivo
Registrar os ajustes de caminhos, correção de scripts de compilação da raiz, população de contas de teste no banco de dados e estabilização de sessões para execução local estável do frontend e backend.

---

## 2. Ajustes e Correções Realizadas

### A. Atualização da Documentação Histórica (`documentos/historico/ajuste_servidor_local.md`)
* **Problema:** O arquivo de registro original continha comandos com caminhos absolutos do ambiente Linux de outro desenvolvedor (`/home/alencar/codigos/projeto_studr/...`).
* **Correção:** Atualizamos os caminhos absolutos para caminhos relativos genéricos (`client` e `../server`) no bloco de instruções, tornando o documento portátil e utilizável em qualquer sistema operacional (incluindo o terminal Windows).

### B. Correção dos Scripts da Raiz (`package.json`)
* **Problema:** Ao rodar `npm run build` na raiz do projeto, ocorria o erro:
  ```text
  Could not resolve entry module "index.html".
  ```
  Isso acontecia porque a raiz tentava executar o comando `vite build` localmente, mas a raiz do monorepo não possui um arquivo `index.html` (o frontend React/Vite está aninhado em `./client`).
* **Correção:** Reconfiguramos os scripts da raiz do `package.json` para delegar as tarefas corretamente para os subdiretórios:
  ```json
  "dev": "npm --prefix client run dev",
  "build:client": "npm --prefix client run build",
  "build:server": "npm --prefix server run build",
  "build": "npm run build:server && npm run build:client",
  "start": "node server/index.js",
  "preview": "npm --prefix client run preview"
  ```
  Agora, o usuário pode compilar ou iniciar o ambiente a partir da raiz sem erros de caminhos de entrada.

### C. População do Banco de Dados (Seeding)
* **Problema:** As contas de teste (`trial@studr.com.br`, `premium@studr.com.br`, etc.) não existiam no banco PostgreSQL configurado no Railway local, impossibilitando testes de login simples.
* **Correção:** 
  1. Executamos o script `node seed_test_users.js` na pasta `server/` para alimentar a tabela de usuários com as contas de teste do plano e a senha padrão (`Studr@2026`).
  2. Executamos o script `node scripts/makeAdmin.js` para certificar a criação do admin chefe (`sachabm@hotmail.com` com senha `101014`).

### D. Criação da Conta Admin Customizada
* **Problema:** O usuário tentou fazer login usando as credenciais indicadas no mockup (`admin@studr.com.br` / `Studr@2026`), que ainda não estavam criadas ou mapeadas como admin no banco de dados.
* **Correção:** Criamos e executamos um script de banco de dados para forçar o registro/upsert da conta:
  * **E-mail:** `admin@studr.com.br`
  * **Senha:** `Studr@2026`
  * **Role:** `ADMIN`
  * **Acesso:** `ACTIVE` / `Premium: true`

### E. Resolução do Erro "Sessão Expirada"
* **Problema:** Após o login bem-sucedido, o cliente mostrava um modal de sessão expirada.
* **Origem:** O Local Storage do navegador possuía um token antigo e inválido do ambiente anterior. Ao recarregar as informações ou verificar sessões em segundo plano com o banco de dados antes da semente de usuários, o servidor retornava `401` ou `403`, forçando o disparo do evento `session-expired` no frontend.
* **Resolução:** Com a população correta dos usuários no banco de dados e a realização de um **login limpo** digitando as novas credenciais, a sessão foi autorizada e sincronizada com sucesso. O Painel Admin e as estatísticas carregaram de forma estável.

---

## 3. Fluxo de Inicialização do Projeto

Com as novas correções de scripts, você não precisa mais navegar manualmente via terminal entre as pastas `client` e `server`. Siga o fluxo abaixo usando **dois terminais distintos abertos na raiz do projeto**:

### Terminal 1: Servidor Backend
Inicie o Express que atua na porta `4000` (`http://localhost:4000`):
```powershell
npm start
```

### Terminal 2: Servidor Frontend (Vite)
Inicie o compilador de desenvolvimento do Vite na porta `3001` (`http://localhost:3001`):
```powershell
npm run dev
```

### Script de Compilação Geral (Para deploys/testes)
Gera o Prisma Client no backend e compila os arquivos estáticos do frontend na pasta `client/dist`:
```powershell
npm run build
```

---

## 4. Credenciais de Acesso Local

| Tipo de Acesso | E-mail | Senha | Nível de Acesso |
|---|---|---|---|
| **Administrador** | `admin@studr.com.br` | `Studr@2026` | ADMIN (Acesso à Central Admin) |
| **Administrador Secundário** | `sachabm@hotmail.com` | `101014` | ADMIN (Acesso à Central Admin) |
| **Assinante Premium** | `premium@studr.com.br` | `Studr@2026` | PREMIUM (Acesso total) |
| **Assinante Trial** | `trial@studr.com.br` | `Studr@2026` | TRIAL (7 dias gratuitos) |
| **Simulado Exclusivo** | `simulado@studr.com.br` | `Studr@2026` | MOCK_ONLY (Apenas Simulados) |

---
*Documento gerado em 18/06/2026. Mantido em `documentos/configuracao_maquina_local.md` para consultas de suporte local.*

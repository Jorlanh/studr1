# Documentação de Segurança — Correção de Bypass de Regra de Negócio e Mass Assignment

Este documento descreve as ações tomadas para mitigar a vulnerabilidade crítica de "Bypass de Regra de Negócio e Injeção de Parâmetros" (Mass Assignment) na plataforma Studr.

---

## 1. Vulnerabilidades Identificadas

Recentemente, um hacker ético identificou duas falhas de segurança críticas na camada de API do back-end:
1. **Mass Assignment (Injeção de Parâmetros Privilegiados):**
   * O endpoint de atualização aceitava e processava diretamente parâmetros confidenciais, como `role`, `isPremium`, `xp` ou `level` enviados diretamente no corpo (`req.body`) do cliente. Isso permitia que qualquer usuário comum se autopromovesse a Premium ou Administrador.
2. **Bypass de Regras de Negócio por Ausência de Validação no Banco de Dados:**
   * Algumas validações eram feitas baseando-se apenas nos dados decodificados do token JWT enviado, em vez de consultar o banco de dados atualizado a cada requisição. Isso viabilizava a evasão das regras caso a role mudasse no banco de dados, ou através da manipulação indevida de dados pelo front-end (bypass do `AdminShell.tsx`).

---

## 2. Alterações Implementadas

Adotamos a postura de **"Never Trust the Client"** (Nunca confie no cliente), forçando validações explícitas no banco de dados e sanitização rígida em qualquer entrada de dados do cliente.

### Middleware de Autenticação e Autorização

#### [NEW] [authMiddleware.js](file:///c:/Users/Kaue_Martins/studr/studr/server/authMiddleware.js)
* **authenticateToken:** Extrai o ID do usuário do JWT e realiza uma consulta direta ao banco de dados para recuperar as informações mais atualizadas do usuário, verificando se ele existe, se está bloqueado ou se o token atual é inválido ou expirado.
* **checkRole(allowedRoles):** Middleware flexível de autorização baseado em roles que consulta o banco de dados em tempo real a cada requisição. Garante que o usuário possua a permissão necessária para acessar uma rota.
* **requireAdmin:** Atalho de middleware integrado a `checkRole(['ADMIN'])` que mantém compatibilidade com o sistema especial de backdoor de e-mail do administrador.

---

### Backend (Servidor Express)

#### [MODIFY] [index.js](file:///c:/Users/Kaue_Martins/studr/studr/server/index.js)
* **Integração dos Middlewares:** Substituímos as implementações locais e inline de `authenticateToken` e `requireAdmin` pelas exportações centralizadas de `authMiddleware.js`.
* **Endpoint de Atualização Seguro (`PUT /api/users/update`):**
  * Criamos uma rota que filtra estritamente as propriedades aceitas para atualização. Apenas o campo `name` é aceito no corpo da requisição. Parâmetros como `role`, `isPremium`, `xp` ou `level` são sumariamente ignorados.
* **Endpoint de Features Premium Seguro (`GET /api/premium/features`):**
  * Criamos a rota para consumo de conteúdo Premium que consulta o banco de dados diretamente via Prisma antes de entregar o recurso.
* **Correção para Testes de Integração Legados:**
  * Restauramos a rota `PUT /api/admin/users/:id/toggle-block` que estava ausente de `index.js`, garantindo que os testes de integração do painel administrativo continuem passando sem quebras.

---

## 3. Testes e Validação

### Criação de Testes de Integração de Segurança

#### [NEW] [security_bypass.integration.test.js](file:///c:/Users/Kaue_Martins/studr/studr/server/test/security_bypass.integration.test.js)
Criamos cenários de testes automatizados com `supertest` para validar a robustez contra ataques:
1. **Mass Assignment:** Tentativa de atualizar `role`, `isPremium` e `xp` por meio de `PUT /api/users/update`. O teste confirma que esses privilégios não foram alterados no banco de dados e apenas o `name` foi atualizado.
2. **Premium Verification:** Tentativa de acesso à área Premium por usuários normais e Premium, confirmando o bloqueio seguro com 403 e a permissão correta com 200.
3. **Role Enforcement:** Validação do bloqueio seguro de rotas administrativas a usuários padrão.

### Resultados dos Testes no Servidor
* **Testes de Segurança Novos (Vitest):**
  ```bash
  $env:TEST="1"; npx vitest run --config vitest.integration.config.js test/security_bypass.integration.test.js
  ```
  * **Resultado:** 6 de 6 testes executados e passados com sucesso total.
* **Testes de Administração Legados (Vitest):**
  ```bash
  $env:TEST="1"; npx vitest run --config vitest.integration.config.js test/admin.integration.test.js
  ```
  * **Resultado:** 22 de 22 testes executados e passados com sucesso total.

# Blindagem de Segurança do Backend e Proteção DDoS (`server/index.js` & `.env`)

## Objetivo
Implementar defesas robustas na camada de aplicação e no banco de dados para evitar ataques de negação de serviço (DDoS), exaustão de recursos (Resource Exhaustion) e inundações de conexões ao banco de dados (Database Flooding) nas rotas críticas do Studr.

## Problemas identificados
- **Database Flooding:** Rota de cadastro (`POST /api/auth/register`) e login (`POST /api/auth/login`) vulneráveis a scripts automatizados enviando milhares de conexões ao banco, derrubando o PostgreSQL e a aplicação.
- **Bot Spam:** Ausência de verificação anti-bot no backend permitindo o registro em lote por robôs.
- **Event Loop Blocking & Memory Bloat:** Falta de limites estritos no tamanho de corpos JSON recebidos globalmente e no comprimento das redações (`/api/ai/evaluate-essay`) e mensagens de chat (`/api/ai/chat`), podendo travar a thread única do Node.js ao processar strings gigantescas.
- **Esgotamento de Memória do Postgres:** Ausência de limitação no pool de conexões do Prisma Client, fazendo o banco de dados cair por falta de RAM no ambiente de produção (Railway) em picos de acessos.

## Alterações realizadas

### 1. Limitação de Taxa de Requisições (Rate Limiting)
- Instalada e configurada a biblioteca `express-rate-limit`.
- Ativado `app.set('trust proxy', 1)` para resolver corretamente o IP dos clientes por trás dos proxies reversos do Railway e Cloudflare.
- **authLimiter:** Aplicado às rotas `/api/auth/register` e `/api/auth/login` limitando cada IP a no máximo **10 requisições a cada 15 minutos**.
- **webhookLimiter:** Aplicado às rotas de webhook da Kiwify (`/api/webhook/kiwify` e `/api/webhooks/kiwify`), permitindo até **120 requisições por minuto por IP** para absorver rajadas legítimas de compras sem expor a API.
- Configurado bypass automático dos limitadores quando em ambiente de testes (`process.env.NODE_ENV === 'test'` ou `process.env.VITEST`).

### 2. Proteção Anti-Bot (Cloudflare Turnstile)
- Criado o middleware `validateTurnstile` na rota de registro `/api/auth/register`.
- O middleware extrai o token enviado pelo frontend (no corpo da requisição ou cabeçalhos) e faz a validação assíncrona chamando a API oficial do Cloudflare (`https://challenges.cloudflare.com/turnstile/v0/siteverify`).
- Requisições sem token válido são rejeitadas instantaneamente com status `400 Bad Request` antes de qualquer toque no banco de dados.
- O Turnstile é bypassado em ambiente de testes ou se a variável `TURNSTILE_SECRET_KEY` não estiver definida no `.env` em desenvolvimento local, evitando bloquear o fluxo local dos desenvolvedores.

### 3. Validação de Tamanho de Payload e Comprimento de Strings
- Adicionado limite global de **1MB** no parser de corpo do Express (`express.json({ limit: '1mb' })` e `express.urlencoded({ limit: '1mb', extended: true })`).
- Na rota de avaliação de redações (`POST /api/ai/evaluate-essay`), limitamos o texto `essayText` a um máximo de **10.000 caracteres**.
- Na rota de chat tutor (`POST /api/ai/chat`), limitamos a mensagem `newMessage` a um máximo de **2.000 caracteres**.
- Exceder esses limites retorna erro imediato de validação, mitigando estouros de buffer e lentidão na thread principal do Node.js.

### 4. Otimização do Pool de Conexões do Prisma Client
- Atualizada a variável `DATABASE_URL` no `.env` com os parâmetros de pool:
  `DATABASE_URL="postgresql://.../railway?connection_limit=10&pool_timeout=15"`
  - `connection_limit=10`: Limita o número de conexões simultâneas a 10 por instância de API, prevenindo exaustão de conexões no PostgreSQL.
  - `pool_timeout=15`: Limita a fila de conexões pendentes para 15 segundos antes de retornar erro.

### 5. Suite de Testes de Integração de Segurança
- Criada a suite de testes de integração em `server/test/security.integration.test.js`.
- Os testes validam:
  - Limite global de payload retornando `413 Payload Too Large`.
  - Limites de caracteres da redação e chat bloqueando com `400 Bad Request` e mensagem de erro explicativa.
  - Bypass de segurança em ambiente de teste para não quebrar a CI.

## Resultados
- A aplicação e o banco de dados agora estão protegidos de forma integrada no Express e no Prisma.
- A suite de testes passou com **100% de sucesso**, garantindo integridade das regras sem regressões nas funcionalidades normais.
- A documentação de backend foi atualizada no arquivo `READMEBack.md`.

## Arquivos alterados ou criados
- **Alterado:** `server/index.js` (Middlewares de rate-limit, Turnstile, limits, validações de tamanho)
- **Alterado:** `server/package.json` & `server/package-lock.json` (Dependência `express-rate-limit`)
- **Alterado:** `server/.env` (Configuração de pool `connection_limit` e Turnstile dummy key)
- **Alterado:** `READMEBack.md` (Documentação das regras de segurança)
- **Criado:** `server/test/security.integration.test.js` (Suite de testes da blindagem)
- **Criado:** `documentos/historico/blindagem_seguranca_backend.md` (Este registro histórico)

## Localização do registro
- `documentos/historico/blindagem_seguranca_backend.md`

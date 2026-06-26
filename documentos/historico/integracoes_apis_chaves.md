# Integrações Externas e Variáveis de Ambiente

Este documento lista todas as integrações externas encontradas no código e as chaves/variáveis de ambiente usadas pelo projeto.

## 1. APIs Externas e Serviços Integrados

### 1.1 Google Gemini
- Uso: serviço principal de IA no backend.
- Arquivo principal: `server/services/aiService.js`
- Chave: `GEMINI_API_KEY`
- Detalhe: criado com `new GoogleGenerativeAI(process.env.GEMINI_API_KEY)` e usado para gerar questões, trilhas de estudos, correções e conteúdos de IA.

### 1.2 Groq
- Uso: provedor secundário de IA / fallback.
- Arquivo principal: `server/services/aiService.js`
- Chave: `GROQ_API_KEY`
- Endpoint: `https://api.groq.com/openai/v1/chat/completions`
- Detalhe: usado quando o Gemini está em cooldown ou falha.

### 1.3 Resend
- Uso: envio de e-mails transacionais (verificação de novo dispositivo, recuperação de senha, onboarding, alertas).
- Arquivo principal: `server/index.js`
- Chave: `RESEND_API_KEY`
- Variável adicional: `RESEND_FROM_EMAIL` para remetente padrão de e-mails.

### 1.4 Cloudflare Turnstile
- Uso: validação anti-bot no backend para cadastro/login.
- Arquivo principal: `server/index.js`
- Chave: `TURNSTILE_SECRET_KEY`
- Endpoint de verificação: `https://challenges.cloudflare.com/turnstile/v0/siteverify`

### 1.5 Asaas
- Uso: criação de clientes e assinaturas de pagamentos recorrentes.
- Arquivo principal: `server/services/asaasService.js`
- Chave: `ASAAS_API_KEY`
- Endpoint base padrão: `https://www.asaas.com/api/v3`
- Variável adicional: `ASAAS_API_URL` para sobrescrever a URL base.

### 1.6 Kiwify
- Uso: webhook de vendas / ativação de acessos premium.
- Arquivo principal: `server/index.js`
- Chave: `KIWIFY_TOKEN` ou `KIWIFY_WEBHOOK_SECRET`
- Endpoint de webhook: `POST /api/webhooks/kiwify` e `POST /api/webhook/kiwify`
- Detalhe: valida token via query string e processa payloads planos ou envelopados em `data`.

## 2. Variáveis de Ambiente do Backend

| Variável | Descrição | Onde é usada |
|---|---|---|
| `DATABASE_URL` | Conexão PostgreSQL usada pelo Prisma | `server` (Configuração do banco) |
| `JWT_SECRET` | Segredo para assinaturas JWT | `server/index.js`, `server/authMiddleware.js` |
| `GEMINI_API_KEY` | Chave do provedor principal de IA | `server/services/aiService.js`, `client/vite.config.ts` |
| `GROQ_API_KEY` | Chave do provedor secundário de IA | `server/services/aiService.js` |
| `TURNSTILE_SECRET_KEY` | Chave secreta Turnstile anti-bot | `server/index.js` |
| `RESEND_API_KEY` | Chave de envio de e-mail Resend | `server/index.js` |
| `RESEND_FROM_EMAIL` | Remetente padrão para e-mails Resend | `server/index.js` |
| `PORT` | Porta do servidor backend | `server/index.js` |
| `FRONTEND_URL` | Domínios permitidos no CORS | `server/index.js` |
| `KIWIFY_TOKEN` | Token de validação do webhook Kiwify | `server/index.js` |
| `KIWIFY_WEBHOOK_SECRET` | Alternativa para token Kiwify | `server/index.js` |
| `API_KEY` | Alias do `GEMINI_API_KEY` para build do frontend | `client/vite.config.ts` |
| `BASE_URL` | Base da aplicação para scripts de smoke test | `server/scripts/smoke.js` |
| `SMOKE_EMAIL` | E-mail usado em teste de smoke | `server/scripts/smoke.js` |
| `SMOKE_PASSWORD` | Senha usada em teste de smoke | `server/scripts/smoke.js` |

## 3. Variáveis de Ambiente de Testes / CI

| Variável | Descrição | Onde é usada |
|---|---|---|
| `NODE_ENV` | Ambiente de execução (`development`, `production`, `test`) | `server/index.js`, `test` e `scripts` |
| `TEST` | Flag de teste para evitar iniciar o servidor em modo normal | `server/index.js` |
| `VITEST` | Flag para identificar execução de Vitest | `server/index.js` |
| `E2E_MODE` | Flag para desabilitar proteções em testes E2E | `server/index.js` |
| `E2E_BASE_URL` | URL base do frontend em testes E2E | `client/playwright.config.ts` |
| `E2E_PASSWORD` | Senha usada pelo seed de usuários E2E | `server/scripts/seedE2EUsers.js`, `client/tests/e2e/helpers.ts` |
| `E2E_PREMIUM_EMAIL` | E-mail premium seed para E2E | `server/scripts/seedE2EUsers.js`, `client/tests/e2e/helpers.ts` |
| `E2E_TRIAL_EMAIL` | E-mail trial seed para E2E | `server/scripts/seedE2EUsers.js`, `client/tests/e2e/helpers.ts` |
| `CI` | Identifica pipeline CI para Playwright e testes | `client/playwright.config.ts` |

## 4. Observações Importantes

- `client` usa `import.meta.env.VITE_API_URL` para apontar para o backend (`http://localhost:4000/api` por padrão).
- O frontend expõe `process.env.API_KEY` e `process.env.GEMINI_API_KEY` via `vite.config.ts` durante o build, mas o fluxo de IA real ocorre no backend.
- O webhook da Kiwify aceita dois nomes diferentes de variável de ambiente (`KIWIFY_TOKEN` ou `KIWIFY_WEBHOOK_SECRET`) para compatibilidade com deploys e ambientes distintos.
- O Turnstile é ignorado em ambientes de teste (`NODE_ENV === 'test'`, `VITEST === 'true'`, `E2E_MODE === '1'`) para evitar bloqueios de desenvolvimento.

## 5. Recomendações Rápidas

1. Centralize `server/.env` e `client/.env` em um cofre seguro.
2. Mantenha as chaves de IA e Resend fora do controle de versão.
3. Verifique se `KIWIFY_TOKEN` / `KIWIFY_WEBHOOK_SECRET` está configurado corretamente no painel da Kiwify.
4. Se usar `ASAAS_API_URL` em homologação, garanta que seja a URL correta da API Asaas.

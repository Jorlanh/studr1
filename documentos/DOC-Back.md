# Studr — Plataforma de Preparação para o ENEM

Aplicação web full-stack para preparação ao ENEM. Geração de questões e redações via IA (Orquestrador Híbrido: Google Gemini + Groq), simulados completos com pontuação TRI, tutor IA via chat, mapa de estudos personalizado e painel administrativo.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Estilização | Vanilla CSS + Tailwind CSS |
| Backend | Node.js + Express |
| ORM | Prisma |
| Banco de dados | PostgreSQL (Railway) |
| IA | Orquestrador Híbrido: Google Gemini + Groq |
| Auth | JWT (single-session) + Medidas Anti-DDoS |
| Deploy | Railway (backend + DB) + Vercel (frontend) |

---

## Estrutura do repositório

```
studr/
├── client/                  # Frontend React
│   ├── components/          # Componentes de UI
│   ├── services/            # Clients HTTP (API, IA, scoring, gamification)
│   ├── types.ts             # Tipos TypeScript compartilhados
│   ├── constants.ts         # Constantes globais
│   └── App.tsx              # Roteamento e estado central
├── server/                  # Backend Express
│   ├── prisma/
│   │   ├── schema.prisma    # Schema do banco
│   │   └── migrations/      # Histórico de migrações
│   ├── services/
│   │   └── planService.js   # Validação de limites de plano (server-side)
│   └── index.js             # Entry point, rotas e middlewares
├── public/                  # Assets estáticos
└── package.json             # Dependências raiz (monorepo simples)
```

---

## Rodar localmente

**Pré-requisitos:** Node.js 18+, PostgreSQL local ou conexão com Railway.

### 1. Instalar dependências

```bash
npm install
cd server && npm install
```

### 2. Configurar variáveis de ambiente

Crie `server/.env` com base na seção [Variáveis de ambiente](#variáveis-de-ambiente) abaixo.

Crie `client/.env` (opcional, para apontar a API local):
```
VITE_API_URL=http://localhost:3001
```

### 3. Aplicar migrações

```bash
cd server
npx prisma migrate dev
```

### 4. Rodar em desenvolvimento

Na raiz do projeto:
```bash
npm run dev
```

---

## Variáveis de ambiente

Configure em `server/.env`:

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão do PostgreSQL com limites de pool (ex: `postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=15`) |
| `JWT_SECRET` | Segredo para assinar tokens JWT |
| `PORT` | Porta do servidor (padrão: `4000`) |
| `FRONTEND_URL` | Domínios permitidos no CORS no backend | 
| `GEMINI_API_KEY` | Chave de API do Google Gemini para IA principal |
| `GROQ_API_KEY` | Chave de API do Groq/Llama 3 para fallback de IA |
| `RESEND_API_KEY` | Chave de API do Resend para envio de e-mails transacionais |
| `RESEND_FROM_EMAIL` | Remetente padrão dos e-mails enviados pelo Resend |
| `TURNSTILE_SECRET_KEY` | Chave secreta do Cloudflare Turnstile para validação anti-bot |
| `ASAAS_API_KEY` | Chave da API Asaas para criação de clientes e assinaturas |
| `ASAAS_API_URL` | URL base da API Asaas, caso seja necessário sobrescrever o endpoint padrão |
| `KIWIFY_TOKEN` | Token de segurança do webhook Kiwify |
| `KIWIFY_WEBHOOK_SECRET` | Token alternativo do webhook Kiwify |
| `E2E_MODE` | Flag para desabilitar proteções em testes E2E (`1`) |
| `NODE_ENV` | Ambiente de execução (`development`, `production`, `test`) |
| `VITEST` | Flag para identificar execução de testes com Vitest (`true`) |

---

### Observações adicionais de ambiente

- O backend usa o prefixo `process.env.*` em `server/index.js` para validar e processar integrações externas.
- As variáveis `KIWIFY_TOKEN` e `KIWIFY_WEBHOOK_SECRET` são intercambiáveis e servem para validar o webhook da Kiwify.
- O Turnstile é ignorado quando `NODE_ENV === 'test'`, `VITEST === 'true'` ou `E2E_MODE === '1'`.
- `GEMINI_API_KEY` também é exposto via `client/vite.config.ts`, mas o fluxo de IA efetivo é orquestrado no backend.

## Serviços, Integrações e Segurança

### 1. Resend — E-mails Transacionais
- Implementado em `server/index.js` com a SDK oficial do Resend.
- Variáveis usadas: `RESEND_API_KEY` e `RESEND_FROM_EMAIL`.
- Fluxos principais:
  - `POST /api/auth/register`: envia código de verificação de 6 dígitos para liberar trial.
  - `POST /api/auth/login`: novo dispositivo dispara código MFA de 6 dígitos.
  - `POST /api/auth/forgot-password`: envia código de recuperação de senha.
  - `POST /api/webhooks/kiwify`: compra aprovada dispara e-mail de boas-vindas e senha temporária.
  - `PUT /api/admin/affiliates/:id/approve`: envia instruções e links de convite de afiliado.

### 2. Kiwify — Webhook de Vendas e Assinaturas
- Rotas de entrada: `POST /api/webhooks/kiwify` e `POST /api/webhook/kiwify`.
- Validação de segurança via token em query string comparado a `KIWIFY_TOKEN` ou `KIWIFY_WEBHOOK_SECRET`.
- Aceita payloads planos ou envelopados em `data`, e reconhece campos em formatos diferentes de case.
- Eventos tratados:
  - Compra aprovada (`paid`, `approved`): cria/ativa usuário premium com `isPremium: true` e `subscriptionStatus: 'ACTIVE'`.
  - Reembolso/cancelamento (`refunded`, `chargeback`, `canceled`): revoga acesso, define `subscriptionStatus: 'CANCELED'`.

### 3. Asaas — Checkout de Assinatura
- Serviço em `server/services/asaasService.js`.
- Base URL: `https://www.asaas.com/api/v3`, customizável por `ASAAS_API_URL`.
- Chave de autenticação: `ASAAS_API_KEY`.
- Endpoint interno usado: `POST /api/payments/create-checkout`.
- Fluxo:
  1. Recupera ou cria cliente no Asaas.
  2. Cria assinatura com ciclo e valor configurados.
  3. Atualiza `asaasSubscriptionId`, `subscriptionStatus` e `billingCycle` do usuário.

### 4. Agendamento Automático
- `node-cron` agenda `rolloverWeek()` semanalmente com `5 0 * * 1` em `America/Sao_Paulo`.
- O job atualiza rankings, ligas e zera XP semanal.
- Script de contingência: `server/scripts/rolloverWeek.js`.

### 5. Prevenção de Abuso por Dispositivos
- O backend salva fingerprints de dispositivos no banco e só libera novo aparelho após MFA.
- Se mais de 5 dispositivos forem adicionados em 7 dias, a conta pode ser bloqueada com `isBlocked: true`.
- A autorização de novo dispositivo exige `POST /api/auth/verify-device`.

### 6. Observação de documentação técnica
- Para detalhes completos de configuração e regras de negócio, consulte `documentos/historico/documentacao_servicos_integracoes.md`.

## Blindagem de Segurança (Anti-DDoS, Rate Limiting & Bots)

O backend do Studr possui mecanismos ativos para evitar exaustão de recursos e abuso de endpoints críticos:

### 1. Rate Limiting (express-rate-limit)
- **Rotas de Auth (`POST /api/auth/register`, `POST /api/auth/login`):** Limite estrito de **10 requisições a cada 15 minutos por IP**. Bloqueia ataques de força bruta e inundações automatizadas de cadastro.
- **Webhooks da Kiwify (`POST /api/webhooks/kiwify` / `/api/webhook/kiwify`):** Limite de **120 requisições por minuto por IP** para acomodar rajadas normais da plataforma sem permitir negação de serviço.
- **Detecção de IP real:** Configurado com `app.set('trust proxy', 1)` para resolver corretamente os IPs dos clientes atrás do proxy reverso do Railway ou Cloudflare.

### 2. Validação Anti-Bot (Cloudflare Turnstile)
- No endpoint de cadastro (`POST /api/auth/register`), o token Turnstile é extraído do body (`turnstileToken`) ou dos cabeçalhos.
- O token é validado diretamente com a API do Cloudflare em `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
- Requisições sem token ou com token inválido são descartadas imediatamente com `400 Bad Request`, sem interagir com o banco de dados.

### 3. Restrição de Payload & Comprimento
- **JSON Payload Limit:** Limite global de **1MB** no body parser.
- **Tamanho de Textos da IA:**
  - Redação (`/api/ai/evaluate-essay`): Máximo de **10.000 caracteres**.
  - Chat do Tutor (`/api/ai/chat`): Máximo de **2.000 caracteres**.
  Isso protege a thread única (Event Loop) do Node.js de travar processando strings imensas enviadas por scripts maliciosos.

### 4. Pool de Conexões do Prisma (Connection Pooling)
- A string de conexão `DATABASE_URL` deve obrigatoriamente incluir:
  - `connection_limit=10`: Limita o pool máximo do Prisma Client a 10 conexões simultâneas por instância do backend, evitando o estouro da memória RAM do PostgreSQL no Railway.
  - `pool_timeout=15`: Limita o tempo de espera na fila de transações para 15 segundos para evitar travamento em cadeia da aplicação.

---

## Usuários de teste

| E-mail | Senha | Plano |
|---|---|---|
| `admin@studr.com.br` | `Studr@2026` | Admin |
| `trial@studr.com.br` | `Studr@2026` | Trial |
| `premium@studr.com.br` | `Studr@2026` | Premium |

---

## Deploy

### Backend — Railway
1. Conecte o repositório ao Railway.
2. Defina as variáveis de ambiente, incluindo `TURNSTILE_SECRET_KEY` e a string do banco com `connection_limit`.
3. As migrações do Prisma rodam via comando de release: `npx prisma migrate deploy`.

### Frontend — Vercel
1. Conecte o repositório ao Vercel com diretório raiz `client`.
2. Adicione a variável `VITE_API_URL` apontando para a URL do Railway.

---

## Comandos úteis

```bash
# Rodar em desenvolvimento
npm run dev

# Rodar todos os testes de backend (unidade + integração)
npm run test:all

# Rodar testes específicos de integração de segurança
$env:TEST="1"; npx vitest run --config vitest.integration.config.js test/security.integration.test.js
```

---
## ROTA DE TESTE DA FOICE - Proteção extra para não rodar em produção real
app.post('/api/admin/force-rollover', authenticateToken, requireAdmin, async (req, res) => {
    // Adicione esta verificação se quiser bloquear em produção
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: "Operação proibida em produção." });
    }

    try {
        await rolloverWeek();
        res.json({ message: "A foice passou. Ligas atualizadas e XP zerado." });
    } catch (err) {
        console.error('[Admin] Erro no rollover manual:', err);
        res.status(500).json({ error: 'Erro ao executar o rollover.' });
    }
});
```
---

## Contato

Projeto: **Studr / SBM Cloud**  
Responsável: Jorlan Heider — jorlan25.js@gmail.com
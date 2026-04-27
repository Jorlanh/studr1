# Studr — Plataforma de Preparação para o ENEM

Aplicação web full-stack para preparação ao ENEM. Geração de questões e redações via IA (OpenAI GPT-4o-mini), simulados completos com pontuação TRI, tutor IA via chat, mapa de estudos personalizado e painel administrativo.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Estilização | Tailwind CSS |
| Backend | Node.js + Express |
| ORM | Prisma |
| Banco de dados | PostgreSQL (Railway) |
| IA | OpenAI GPT-4o-mini |
| Auth | JWT (single-session) |
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

Isso sobe o frontend (Vite, porta 5173) e o backend (Express, porta 3001) em paralelo.

---

## Variáveis de ambiente

Configure em `server/.env`:

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL (ex: `postgresql://user:pass@host:5432/studr`) |
| `JWT_SECRET` | Segredo para assinar tokens JWT |
| `OPENAI_API_KEY` | Chave da API OpenAI (GPT-4o-mini) |
| `PORT` | Porta do servidor (padrão: `3001`) |

---

## Usuários de teste

| E-mail | Senha | Plano |
|---|---|---|
| `admin@studr.com.br` | (configurar via seed) | Admin |
| `trial@teste.com` | (configurar via seed) | Trial |
| `premium@teste.com` | (configurar via seed) | Premium |

Para criar usuários manualmente use o endpoint `POST /api/auth/register` ou o painel admin em `/admin`.

---

## Deploy

### Backend — Railway

1. Conecte o repositório ao Railway.
2. Configure as variáveis de ambiente no painel do Railway.
3. Railway detecta automaticamente o `server/` e executa `npm start`.
4. As migrações do Prisma rodam via comando de release: `npx prisma migrate deploy`.

### Frontend — Vercel

1. Conecte o repositório ao Vercel.
2. Configure:
   - **Root directory:** `client`
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
3. Adicione a variável `VITE_API_URL` apontando para a URL do Railway.

### Webhook Kiwify (ativação de planos)

Configure no painel da Kiwify o endpoint:
```
POST https://<sua-url-railway>/api/webhook/kiwify
```
O backend processa os eventos `order.approved` e `order.refunded` para atualizar o plano do usuário no banco.

---

## Comandos úteis

```bash
# Rodar em desenvolvimento (frontend + backend)
npm run dev

# Build de produção do frontend
cd client && npm run build

# Abrir Prisma Studio (inspecionar banco)
cd server && npx prisma studio

# Criar nova migração após alterar schema.prisma
cd server && npx prisma migrate dev --name <nome-da-migracao>

# Aplicar migrações em produção
cd server && npx prisma migrate deploy

# Verificar tipos TypeScript
cd client && npx tsc --noEmit
```

---

## Documentação adicional

Documentos detalhados estão na pasta `documentos/`:

- `documentos/` — Relatórios de homologação, briefings de correções e alinhamentos de produto.

---

## Contato

Projeto: **Studr / SBM Cloud**  
Responsável: Fabio Patricio — appmagic2026@gmail.com

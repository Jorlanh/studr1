# Studr — Integrações de API Externas

Este documento detalha o ecossistema de APIs externas e webhooks integrados na plataforma **Studr**, descrevendo suas finalidades, fluxos de autenticação, estruturas de carga (*payload*) e mapeamento de eventos.

---

## 🔌 Tabela Geral de Integrações

O Studr conecta-se com três provedores externos para gerenciar pagamentos, comunicações por e-mail e processamento de assinaturas:

| Provedor | Função Principal | Tipo de Conexão | Biblioteca Utilizada |
|---|---|---|---|
| **Asaas** | Checkout direto de planos e assinaturas recorrentes | Rest API | Native Fetch |
| **Kiwify** | Ativação automática de acessos via Webhook de vendas | Webhook (HTTP POST) | Express Router |
| **Resend** | Envio de e-mails transacionais (boas-vindas, códigos MFA) | REST API | Official Node SDK (`resend`) |

---

## 💳 1. Integração Asaas (Gateways de Assinatura)

* **Código de Serviço:** `server/services/asaasService.js`
* **API Endpoints Utilizados:**
  * **Clientes:** `POST https://www.asaas.com/api/v3/customers`
  * **Assinaturas:** `POST https://www.asaas.com/api/v3/subscriptions`

### Fluxo de Pagamento Integrado
1. O estudante clica em assinar um plano na tela de preços (`PricingPage.tsx`).
2. O frontend chama o endpoint interno `POST /api/payments/create-checkout`.
3. O backend intercepta a chamada, valida o token do usuário e chama `asaasService.getOrCreateCustomer()` para registrar ou obter o `asaasCustomerId` do cliente associado ao e-mail.
4. O backend chama `asaasService.createSubscription()` passando o ID do cliente, o ciclo de cobrança (`MONTHLY` ou `YEARLY`) e o valor correspondente (Plano Mensal: R$ 59,00 / Plano Anual: R$ 564,00).
5. O Asaas processa e retorna uma `invoiceUrl` (URL da fatura) e o ID da assinatura.
6. O backend atualiza o usuário no banco como `subscriptionStatus: 'PENDING'` e devolve a URL para o cliente, redirecionando o estudante para a tela de pagamento seguro do Asaas.

---

## 🛒 2. Webhook da Kiwify (Vendas por Afiliados e Tráfego Pago)

* **Endpoints de Entrada:** `POST /api/webhooks/kiwify` ou `POST /api/webhook/kiwify` (Aceita no singular e no plural para evitar erros de cadastro de URL).
* **Fluxo de Autenticação:** A Kiwify valida o envio enviando o token de segurança na query string (`?token=SEU_TOKEN_CONFIGURADO`), que é validado contra a variável de ambiente `KIWIFY_TOKEN` ou `KIWIFY_WEBHOOK_SECRET`.

### Processamento de Eventos da Kiwify
A plataforma escuta os seguintes status de compra enviados pela Kiwify:

#### A. Evento: Compra Aprovada (`order_status === 'paid'`)
* **Tratamento:**
  1. Extrai as chaves da carga útil de dados (*payload*). A Kiwify envia dados em formato capitalizado (PascalCase). Ex: `Customer` (com e-mail e nome completo) e `Product` (com ID do produto/plano). O backend possui tolerância a case-sensitivity, aceitando chaves capitalizadas ou em minúsculo.
  2. Verifica se o e-mail do comprador já possui cadastro na base. 
     * **Caso não exista:** Cria automaticamente um novo usuário no banco, gerando uma senha forte aleatória e ativando o status verificado.
  3. Mapeia o ID do produto ou o ID do plano de recorrência (`Subscription.plan_id`) contra a tabela `Plan` do banco de dados para determinar o ciclo de faturamento (`MONTHLY` ou `YEARLY`) e nível de acesso.
  4. Atualiza o status do usuário para Premium (`isPremium: true` e `subscriptionStatus: 'ACTIVE'`).
  5. Se for um novo usuário, dispara um e-mail transacional via **Resend** contendo os dados de acesso e a senha temporária criada.

#### B. Evento: Reembolso, Chargeback ou Cancelamento (`'refunded' | 'chargeback' | 'canceled'`)
* **Tratamento:**
  * Localiza o usuário no banco pelo e-mail e remove instantaneamente seus privilégios de acesso, atualizando os campos para `isPremium: false` e `subscriptionStatus: 'CANCELED'`.

---

## 📧 3. E-mails Transacionais (Resend)

* **Código de Uso:** `server/index.js`
* **Biblioteca:** `@prisma/client` + `resend` (Node.js SDK)
* **Domínio de Envio:** Configurado em `process.env.RESEND_FROM_EMAIL` (padrão: `suporte@studr.com.br`).

O Studr utiliza o Resend para disparar e-mails dinâmicos estruturados em HTML de três tipos:

### A. Validação de Contas de Teste (Trial)
Disparado na rota `POST /api/auth/register`. Envia o código numérico de 6 dígitos necessário para validar o e-mail e iniciar o período experimental gratuito de 7 dias do aplicativo.

### B. Novo Aparelho Detectado (MFA por Dispositivo)
Disparado no fluxo `POST /api/auth/login`. Quando um usuário tenta fazer login de um dispositivo com `fingerprint` desconhecido, o backend impede a geração do token, gera um código de autorização temporário e envia por e-mail:
* **Assunto:** `🔒 Novo aparelho detectado - Studr`
* **Expiração:** 10 minutos.

### C. Recuperação de Senha
Disparado no fluxo `POST /api/auth/forgot-password`. Gera o código de segurança para redefinição segura de senha:
* **Assunto:** `🔑 Recuperação de Senha - Studr`

---

## 📝 Observações de Integração

- O webhook da Kiwify aceita payloads planos ou envelopados em `data`, e reconhece campos em diferentes formatos de case (`Customer` / `customer`, `product_id` / `productId`).
- A rota `POST /api/payments/create-checkout` usa `server/services/asaasService.js` e depende de `ASAAS_API_KEY` e `ASAAS_API_URL`.
- O Resend dispara e-mails em `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/forgot-password`, `POST /api/webhooks/kiwify` e `PUT /api/admin/affiliates/:id/approve`.
- Todas as rotas internas do backend estão definidas em `server/index.js`.
- Para documentação técnica completa de serviços e integrações, consulte `documentos/historico/documentacao_servicos_integracoes.md`.

---

## ⚙️ 4. APIs Internas do Backend

Todas as rotas internas consumidas pelo frontend e pelos webhooks estão definidas em `server/index.js`. O backend usa o prefixo `/api` para todos os endpoints e protege recursos sensíveis com `authenticateToken`; rotas administrativas também exigem `requireAdmin`.

### 4.1 Autenticação e Usuário

| Método | Endpoint | Requisitos | Descrição |
|---|---|---|---|
| POST | `/api/auth/register` | `authLimiter`, `validateTurnstile` | Registro de novo usuário |
| POST | `/api/auth/register-affiliate` | - | Cadastro de afiliado |
| POST | `/api/auth/verify` | - | Verificação de código enviado por e-mail |
| POST | `/api/auth/login` | `authLimiter` | Login de usuário |
| POST | `/api/auth/verify-device` | - | Verificação de novo dispositivo (código OTP) |
| POST | `/api/auth/forgot-password` | - | Solicitação de recuperação de senha |
| POST | `/api/auth/reset-password` | - | Redefinição de senha |
| GET | `/api/auth/me` | `authenticateToken` | Retorna dados do usuário logado |
| PUT | `/api/users/update` | `authenticateToken` | Atualiza informações de usuário |

### 4.2 Pagamento e Vendas

| Método | Endpoint | Requisitos | Descrição |
|---|---|---|---|
| POST | `/api/payments/create-checkout` | `authenticateToken` | Cria checkout de assinatura com Asaas |
| POST | `/api/webhooks/kiwify` | `webhookLimiter` | Webhook Kiwify de ativação/cancelamento |
| POST | `/api/webhook/kiwify` | `webhookLimiter` | Webhook Kiwify de ativação/cancelamento |

### 4.3 Premium e Conteúdo Protegido

| Método | Endpoint | Requisitos | Descrição |
|---|---|---|---|
| GET | `/api/premium/features` | `authenticateToken` | Lista recursos premium disponíveis |

### 4.4 Afiliados / Admin

| Método | Endpoint | Requisitos | Descrição |
|---|---|---|---|
| GET | `/api/admin/affiliates` | `authenticateToken`, `requireAdmin` | Lista afiliados pendentes e aprovados |
| PUT | `/api/admin/affiliates/:id/status` | `authenticateToken`, `requireAdmin` | Atualiza status do afiliado |
| GET | `/api/admin/affiliate-products` | `authenticateToken`, `requireAdmin` | Lista produtos Kiwify configurados |
| PUT | `/api/admin/affiliate-products/:productType` | `authenticateToken`, `requireAdmin` | Edita links de produto Kiwify |
| PUT | `/api/admin/affiliates/:id/approve` | `authenticateToken`, `requireAdmin` | Aprova afiliado e envia notificação |
| GET | `/api/admin/users` | `authenticateToken`, `requireAdmin` | Lista usuários do sistema |
| GET | `/api/admin/stats` | `authenticateToken`, `requireAdmin` | Estatísticas de admin |
| PATCH | `/api/admin/users/:id` | `authenticateToken`, `requireAdmin` | Atualiza dados de usuário específico |
| PUT | `/api/admin/users/:id/toggle-block` | `authenticateToken`, `requireAdmin` | Bloqueia/desbloqueia usuário |
| POST | `/api/admin/users` | `authenticateToken`, `requireAdmin` | Cria novo usuário pelo admin |

### 4.5 Afiliado Público

| Método | Endpoint | Requisitos | Descrição |
|---|---|---|---|
| GET | `/api/affiliate/:slug` | - | Busca dados públicos de afiliado por slug |

### 4.6 Prática, Simulados e Exames

| Método | Endpoint | Requisitos | Descrição |
|---|---|---|---|
| POST | `/api/practice/start` | `authenticateToken` | Inicia sessão de prática/resolução |
| POST | `/api/mock/start` | `authenticateToken` | Inicia simulado |
| POST | `/api/exams/:id/finalize` | `authenticateToken` | Finaliza exame |
| PUT | `/api/exams/:examId/questions/:orderIndex/answer` | `authenticateToken` | Envia resposta de questão |
| GET | `/api/exams` | `authenticateToken` | Lista exames do usuário |
| GET | `/api/exams/:id` | `authenticateToken` | Detalhes de exame específico |

### 4.7 Torre / Gamificação / Ranking

| Método | Endpoint | Requisitos | Descrição |
|---|---|---|---|
| GET | `/api/tower/state` | `authenticateToken` | Estado atual da Torre do usuário |
| POST | `/api/tower/submit` | `authenticateToken` | Entrega resultado de andar da torre |
| GET | `/api/tower/top3/:floorNumber` | `authenticateToken` | Ranking top 3 por andar |
| POST | `/api/gamification/event` | `authenticateToken` | Envia evento de gamificação (XP, medalhas, streaks) |
| GET | `/api/gamification/state` | `authenticateToken` | Recupera estado de gamificação do usuário |
| GET | `/api/ranking` | `authenticateToken` | Ranking geral/trilhas |

### 4.8 APIs de IA

| Método | Endpoint | Requisitos | Descrição |
|---|---|---|---|
| POST | `/api/ai/generate-questions` | `authenticateToken` | Geração de questões por IA |
| POST | `/api/ai/analyze-sisu` | `authenticateToken` | Análise de desempenho para SISU |
| POST | `/api/ai/study-plan` | `authenticateToken` | Geração de plano de estudos |
| POST | `/api/ai/essay-theme` | `authenticateToken` | Geração de tema de redação |
| POST | `/api/ai/evaluate-essay` | `authenticateToken` | Avaliação de redação pela IA |
| POST | `/api/ai/chat` | `authenticateToken` | Chat de tutor IA |
| POST | `/api/ai/study-map` | `authenticateToken` | Geração de mapa de estudos |
| POST | `/api/ai/grade-1000-example` | `authenticateToken` | Exemplo de nota 1000 / modelo de redação |

### 4.9 Saúde e Infra

| Método | Endpoint | Requisitos | Descrição |
|---|---|---|---|
| GET | `/api/health` | - | Health check da aplicação |

> `POST /api/webhooks/kiwify` e `POST /api/webhook/kiwify` atendem ao mesmo fluxo de webhook Kiwify.
> `POST /api/payments/create-checkout` integra o serviço de assinatura Asaas.

---
*Documento de mapeamento de integrações externas gerado em 18/06/2026.*

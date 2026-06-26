# APIs do Projeto Studr

Este documento reúne todas as rotas de API internas definidas no backend do projeto. Todas as APIs estão implementadas em `server/index.js`.

## 1. Autenticação e Usuário

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

## 2. Pagamento e Vendas

| Método | Endpoint | Requisitos | Descrição |
|---|---|---|---|
| POST | `/api/payments/create-checkout` | `authenticateToken` | Cria checkout de assinatura com Asaas |
| POST | `/api/webhooks/kiwify` | `webhookLimiter` | Webhook Kiwify de ativação/cancelamento |
| POST | `/api/webhooks/kiwify` | `webhookLimiter` | Webhook Kiwify (plural) |
| POST | `/api/webhook/kiwify` | `webhookLimiter` | Webhook Kiwify (singular) |

## 3. Premium e Conteúdo Protegido

| Método | Endpoint | Requisitos | Descrição |
|---|---|---|---|
| GET | `/api/premium/features` | `authenticateToken` | Lista recursos premium disponíveis |

## 4. Afiliados / Admin

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

## 5. Afiliado Público

| Método | Endpoint | Requisitos | Descrição |
|---|---|---|---|
| GET | `/api/affiliate/:slug` | - | Busca dados públicos de afiliado por slug |

## 6. Prática, Simulados e Exames

| Método | Endpoint | Requisitos | Descrição |
|---|---|---|---|
| POST | `/api/practice/start` | `authenticateToken` | Inicia sessão de prática/resolução |
| POST | `/api/mock/start` | `authenticateToken` | Inicia simulado |
| POST | `/api/exams/:id/finalize` | `authenticateToken` | Finaliza exame |
| PUT | `/api/exams/:examId/questions/:orderIndex/answer` | `authenticateToken` | Envia resposta de questão |
| GET | `/api/exams` | `authenticateToken` | Lista exames do usuário |
| GET | `/api/exams/:id` | `authenticateToken` | Detalhes de exame específico |

## 7. Torre / Gamificação / Ranking

| Método | Endpoint | Requisitos | Descrição |
|---|---|---|---|
| GET | `/api/tower/state` | `authenticateToken` | Estado atual da Torre do usuário |
| POST | `/api/tower/submit` | `authenticateToken` | Entrega resultado de andar da torre |
| GET | `/api/tower/top3/:floorNumber` | `authenticateToken` | Ranking top 3 por andar |
| POST | `/api/gamification/event` | `authenticateToken` | Envia evento de gamificação (XP, medalhas, streaks) |
| GET | `/api/gamification/state` | `authenticateToken` | Recupera estado de gamificação do usuário |
| GET | `/api/ranking` | `authenticateToken` | Ranking geral/trilhas |

## 8. APIs de IA

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

## 9. Saúde e Infra

| Método | Endpoint | Requisitos | Descrição |
|---|---|---|---|
| GET | `/api/health` | - | Health check da aplicação |

## 10. Observações

- O backend usa `authenticateToken` para proteger rotas de usuário e operações sensíveis.
- Os webhooks da Kiwify aceitam duas URIs (`/api/webhooks/kiwify` e `/api/webhook/kiwify`) para evitar erro de configuração.
- Todas as rotas acima são definidas diretamente em `server/index.js`.

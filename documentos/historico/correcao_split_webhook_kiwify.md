# Documentação das Correções — Webhook Kiwify para Split de Pagamento e Co-produção

Este documento detalha as ações tomadas para solucionar a falha de liberação de acesso aos alunos que realizam compras de planos e cursos através de links de split de pagamento (co-produção e afiliados) gerados pela Kiwify na plataforma Studr.

---

## 1. Problemas Identificados

1. **Payload Envelopado em Split/Co-produção:**
   * A Kiwify envia eventos de vendas com split de pagamentos (e co-produção) encapsulando as informações de transação e do comprador dentro de um objeto `"data"`.
   * O backend antigo do Studr buscava campos como `order_status` e `Customer` diretamente no nível raiz do corpo da requisição (`req.body`).
   * Por conta disso, propriedades críticas como `order_status` e `Customer` eram interpretadas como `undefined`, gerando um erro interno silencioso que resultava no retorno de `200 { received: true }` sem promover o comprador a Premium.

2. **Casing e Chaves Alternativas nos Payloads:**
   * Dependendo do tipo de produto ou fluxo da venda da Kiwify, os parâmetros de comprador e de status do pedido podiam ser retornados com nomes e casings variados (por exemplo, `status` em vez de `order_status` ou `customer_email` em vez de `Customer.email`).

3. **Incompatibilidade das Variáveis de Token de Webhook:**
   * O backend esperava exclusivamente a variável `KIWIFY_TOKEN` para autenticação de segurança, enquanto o ambiente de produção/README especificava a variável `KIWIFY_WEBHOOK_SECRET`. Isso causava inconsistências de validação.

4. **Link do Checkout Anual Desatualizado:**
   * A URL padrão do checkout anual no frontend apontava para um link expirado da Kiwify (`b5RTpGA`), necessitando atualização para o novo link ativo (`XRDY3Pq`).

---

## 2. Alterações Implementadas

### Backend (Servidor Express)

#### [MODIFY] [index.js](file:///c:/Users/Kaue_Martins/studr/studr/server/index.js)
* **Parsing Inteligente e Envelopado:**
  * Atualizamos a leitura para detectar dinamicamente se o payload do webhook está encapsulado em `data` ou no nível raiz:
    ```javascript
    const payload = body.data ? body.data : body;
    ```
* **Busca Tolerante a Falhas de Casings:**
  * Implementamos mecanismos de fallback para campos essenciais:
    * **Status:** `payload.order_status || payload.orderStatus || payload.Order_Status || payload.status`
    * **Email:** `customer?.email || payload.email || payload.customer_email`
    * **Nome:** `customer?.full_name || customer?.first_name || payload.name || payload.customer_name`
* **Normalização de Status:**
  * Os status de pagamento aceitos foram expandidos para incluir de forma insensível a maiúsculas/minúsculas os termos `paid` e `approved`.
  * Os status de revogação/reembolso aceitam `refunded`, `chargeback`, `canceled`, `cancelled` e `refund`.
* **Segurança Unificada:**
  * Alteramos a verificação de token para aceitar tanto `KIWIFY_TOKEN` quanto `KIWIFY_WEBHOOK_SECRET`:
    ```javascript
    const expectedToken = process.env.KIWIFY_TOKEN || process.env.KIWIFY_WEBHOOK_SECRET;
    ```
* **Log em Falhas de Identificação:**
  * Se o webhook for acionado sem um e-mail do cliente, o corpo completo da requisição é printado no log do servidor para permitir rastreamento rápido pelo suporte técnico.

### Frontend (React / Vite)

#### [MODIFY] [PricingPage.tsx](file:///c:/Users/Kaue_Martins/studr/studr/client/components/PricingPage.tsx)
* **Correção do Link de Checkout Anual:**
  * Atualizamos a URL padrão do checkout anual para a nova URL ativa da Kiwify: `https://pay.kiwify.com.br/XRDY3Pq`.

---

## 3. Testes e Validação

Criamos um arquivo de teste de integração robusto para simular o comportamento de ponta a ponta:

#### [NEW] [kiwifyWebhook.integration.test.js](file:///c:/Users/Kaue_Martins/studr/studr/server/test/kiwifyWebhook.integration.test.js)
* **Cenários Cobertos:**
  * Rejeição de requisição com token de query string inválido (`401 Unauthorized`).
  * Processamento com sucesso de payload plano tradicional e promoção automática do comprador a Premium.
  * Processamento com sucesso de payload de co-produção/split envelopado em `data` e promoção automática a Premium.
  * Processamento correto com chaves e status alternativos (ex: status `approved` e email em `customer_email`).
  * Remoção do acesso Premium quando recebido status de reembolso (`refunded`).

### Resultado dos Testes
Todos os testes de integração do webhook rodaram localmente e passaram com sucesso:
```bash
 ✓ test/kiwifyWebhook.integration.test.js (5 tests) 18387ms
     ✓ rejects request with invalid token  2510ms
     ✓ accepts request with valid token and promotes flat payload customer  5836ms
     ✓ accepts request and promotes customer with wrapped (data envelope) payload  2833ms
     ✓ handles casing variants (approved, customer_email)  2616ms
     ✓ removes access on refunded/chargeback/canceled status  2667ms
```

# Relatório de Teste — SAT Expert
## Cenário 1: Candidato Ivy League (MIT / Engineering)

**Data da execução:** 14/04/2026
**Tester:** Fabio
**Ambiente:** https://app.satexpert.site
**Viewport:** iPhone 14 (390x844) via Chrome DevTools Mobile Mode
**Status da execução:** Parcial — interrompida na transição onboarding → diagnostic_rw

---

## 1. Perfil testado

Adaptação do perfil "Alex" do plano de testes para o usuário logado (Fabio):

| Campo | Valor enviado | Esperado pelo plano |
|---|---|---|
| Nome | Fabio (do cadastro) | Alex |
| Universidade alvo | MIT | MIT |
| Major | Computer engineering | Engineering |
| Tier | (extraído pelo bot) ivy_league | ivy_league |
| Tentativas anteriores | 0 (first time) | 0 |
| Score atual | 1300 (practice tests) | 1300 |
| Data da prova | August (22, 2026) | August 22, 2026 |

---

## 2. Transcrição completa da conversa

### 2.1 Mensagem inicial do sistema

> **SAT Expert Brain:**
> "Hi Fabio. I'm SAT Expert — I work differently than a tutoring center. I'm calibrated on 8 official College Board tests, and I find exactly why prepared students underperform. Let's start with your goal: what school or type of school are you aiming for?"

### 2.2 Resposta do candidato — universidade alvo

> **Fabio:** "I want to get into MIT for computer engineering"

> **SAT Expert Brain:**
> "Got it, Fabio. MIT computer engineering — that's Ivy League tier, which means you're targeting 1500+. Before we start your diagnostic, I need three quick things: Have you taken the SAT before? If yes, what was your score?"

### 2.3 Resposta do candidato — tentativas + score

> **Fabio:** "This will be my first time, but I've been scoring around 1300 on practice tests"

> **SAT Expert Brain:**
> "First time and already at 1300 on practice tests — that's solid foundation, Fabio. You're 200 points away from MIT range, which is very doable. When are you planning to sit for the actual SAT?"

### 2.4 Resposta do candidato — data da prova

> **Fabio:** "August"

> **SAT Expert Brain:**
> "August 22, 2026 — that's 18 weeks out. Solid timeline to close that 200-point gap. Let me start your College Board diagnostic now, Fabio."

### 2.5 Após a mensagem de transição

**[Aguardado por mais de 18 segundos. Nenhuma mensagem subsequente apareceu. A primeira questão do diagnostic_rw NÃO foi enviada pelo sistema.]**

---

## 3. Validações do checklist do Cenário 1

### 3.1 Onboarding

| Validação | Status | Observação |
|---|---|---|
| Todas as mensagens em inglês | ⚠️ Parcial | Mensagens do bot OK em inglês. Header e placeholder do input em português (achados 1, 2 e 3) |
| Tom: direto, analítico, mentor — não genérico | ✅ Pass | Bot soou analítico e personalizado, com referências a College Board e dados |
| Usa o nome "Alex" naturalmente | ✅ Pass (adaptado) | Usou "Fabio" naturalmente em todas as respostas |
| `collected_data` tem todos os campos preenchidos | ✅ Pass (inferido) | Não foi possível verificar JSON — inferido pelo comportamento das respostas |
| `phase_complete: true` e `next_phase: "diagnostic_rw"` | ❌ Fail (suspeita) | Bot anunciou "Let me start your diagnostic now" mas não disparou |
| Score target calculado: 1550 (ivy_league tier) | ⚠️ Parcial | Bot mencionou "1500+" — não confirmou se internamente é 1550 |

### 3.2 Sistema deveria mostrar opções de datas (passo 7 do plano)

| Validação | Status | Observação |
|---|---|---|
| Sistema pergunta sobre data com opções e semanas restantes | ❌ Fail | Bot perguntou abertamente "When are you planning to sit for the actual SAT?" sem listar opções |

### 3.3 Diagnóstico Reading & Writing

| Validação | Status |
|---|---|
| Questões em formato SAT real (1 parágrafo + 4 alternativas A-D) | ⏸ Não testado |
| Cobre os 4 domínios de RW (mínimo 2 questões por domínio) | ⏸ Não testado |
| Adaptatividade funciona | ⏸ Não testado |
| `flag_inconsistencia` é detectado se aplicável | ⏸ Não testado |
| `diagnostic_summary.rw` gerado com scores por domínio | ⏸ Não testado |
| Transição automática para `diagnostic_math` | ⏸ Não testado |

### 3.4 Diagnóstico Math, Plan Generation e Verdict

⏸ Não testados — execução interrompida na fase 3.3.

---

## 4. Achados / Bugs

### 🔴 ALTA — #1: Branding errado no header durante o diagnóstico
**Onde:** Header da página após enviar "August"
**Observado:** Header mudou para `MODO SIMULADOR FGV (DIAGNÓSTICO ATIVO)`
**Esperado:** Algo como `DIAGNOSTIC MODE (ACTIVE)` ou similar, em inglês, sem referência à FGV
**Impacto:** FGV é a banca da OAB (produto irmão). Aparece para o usuário do SAT. Branding cruzado entre produtos.
**Hipótese:** Componente de header está hardcoded ou usando manifest da OAB por engano.

### 🔴 ALTA — #2: Auto-trigger para `diagnostic_rw` não disparou
**Onde:** Após resposta "August" e mensagem de transição do bot
**Observado:** Bot disse *"Let me start your College Board diagnostic now, Fabio."* e nada mais aconteceu por mais de 18 segundos. Nenhuma questão apareceu.
**Esperado:** Conforme spec ("Step 9: Transição automática para diagnostic_rw") e checklist do Cenário 7 ("Ao completar diagnostic_rw, o motor auto-trigger diagnostic_math sem esperar mensagem"), a primeira questão de RW deveria ser enviada automaticamente, concatenada ou subsequente à mensagem de transição.
**Impacto:** Bloqueante — não dá para validar nenhum diagnóstico.
**Hipótese:** `auto_trigger_phases` no manifest pode não estar incluindo `diagnostic_rw`, ou o trigger está esperando um input do usuário.

### 🟡 MÉDIA — #3: Pergunta da data sem opções nem semanas restantes
**Onde:** Após resposta "first time + 1300"
**Observado:** Bot perguntou `"When are you planning to sit for the actual SAT?"` aberto, sem listar as datas.
**Esperado:** Conforme spec ("Step 7: Sistema pergunta sobre data da prova (mostra opções com semanas restantes)"), deveria mostrar lista das próximas provas com semanas restantes (ex: May 2 — 2 weeks, June 6 — 8 weeks, August 22 — 18 weeks…).
**Impacto:** UX — candidato pode não saber as datas e travar.
**Observação:** Apesar disso, a extração funcionou bem (ele mandou "August" e o bot identificou "August 22, 2026").

### 🟢 BAIXA — #4: Header em português ("AUDITORIA BASE (COLETANDO DADOS)")
**Onde:** Header da página durante o onboarding
**Observado:** `AUDITORIA BASE (COLETANDO DADOS)` em português
**Esperado:** Em inglês (spec exige tudo em inglês para SAT_US)
**Impacto:** Quebra a imersão; usuário americano vai estranhar.

### 🟢 BAIXA — #5: Placeholder do input em português
**Onde:** Campo de input do chat
**Observado:** `Digite sua mensagem...`
**Esperado:** `Type your message...` ou similar
**Impacto:** Mesmo do #4.

### 🔴 ALTA — #6: Erro inicial de conexão ao sistema especializado
**Onde:** Primeira tentativa de carregar a aplicação após login
**Observado:** Header `SAT Expert Brain — CONECTANDO...` e mensagem `Desculpe, não consegui conectar ao sistema especializado.` (em português)
**Esperado:** Conectar diretamente sem erro
**Resolução:** Após intervenção do tester (não documentada — usuário disse "Resolvido"), passou a funcionar
**Impacto:** Pode acontecer com usuários reais. Mensagem de erro também em português.

---

## 5. Pontos positivos confirmados

- ✅ Mensagens do bot em inglês
- ✅ Tom analítico, autoritativo, com referências (College Board, IRT, "8 official tests")
- ✅ Personalização: usou "Fabio" naturalmente em todas as respostas
- ✅ Extração de dados funcionou para todas as 4 perguntas (universidade, major, tentativas, score, data)
- ✅ Identificação de tier correto (MIT → Ivy League)
- ✅ Cálculo correto de gap (1500 - 1300 = 200)
- ✅ Cálculo correto de semanas restantes (Apr 14 → Aug 22 = 18 semanas)
- ✅ Resposta a input ambíguo "August" foi inteligente (interpretou como Aug 22, 2026)
- ✅ Comunicação fluida e natural

---

## 6. Próximas ações sugeridas (prioridade)

1. **🔴 Investigar auto-trigger de `diagnostic_rw`** — verificar `auto_trigger_phases` no `sat_us.json` manifest
2. **🔴 Corrigir branding "MODO SIMULADOR FGV"** no header — buscar string hardcoded ou config do manifest errada
3. **🔴 Investigar erro de conexão inicial** ao sistema especializado
4. **🟡 Implementar listagem de datas** com semanas restantes na pergunta do exam date
5. **🟢 Traduzir headers** ("AUDITORIA BASE", "MODO SIMULADOR", placeholder do input)
6. **🟢 Verificar cálculo target score** — confirmar se Ivy League gera target 1550 internamente

---

## 7. Configuração do ambiente de teste

- **Browser:** Chrome
- **DevTools Mode:** Mobile (iPhone 14)
- **Viewport efetivo:** 390 x 844 (com DPR mobile)
- **URL:** https://app.satexpert.site/login
- **Usuário de teste:** fabio.patricio@gmail.com
- **Data/hora do teste:** 14/04/2026

---

*Relatório gerado durante execução assistida do Cenário 1 do plano de testes. Reexecutar após correção dos bugs ALTA listados acima.*

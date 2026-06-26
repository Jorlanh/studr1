# Studr — Inteligência Artificial (Orquestrador Híbrido)

Este documento descreve o funcionamento do sistema de Inteligência Artificial da plataforma **Studr**, detalhando a infraestrutura de modelos, o roteamento de tráfego, as estratégias de prompt e os algoritmos de validação.

---

## 🧠 Arquitetura do Orquestrador Híbrido

O backend do Studr (`server/services/aiService.js`) implementa um **Orquestrador Híbrido de Inteligência Artificial** que alterna dinamicamente o tráfego entre duas APIs com base em disponibilidade, latência, faturamento e limites de cota:

```text
               Chamada de IA (Frontend/Backend)
                             │
                             ▼
                    executeHybridAI()
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   Provedor 1: GEMINI                Provedor 2: GROQ
   (gemini-2.5-flash)                (llama-3.1-8b-instant)
   • Usado para exames,              • Usado para o Tutor Chat
     redações e sisu                 • Fallback veloz
            │                                 │
            └───────────────┬─────────────────┘
                            ▼
                  Análise e Limpeza
                  • parseSafeJSON()
                  • Fisher-Yates shuffle (Alternativas)
```

### 1. Modelo Principal (Gemini)
* **API:** Google Gemini API
* **Modelo:** `gemini-2.5-flash`
* **Principais Usos:** Geração de pacotes de questões, correção estruturada de redações (5 competências do ENEM) e análise de chances no SISU.
* **Características:** Excelente capacidade de raciocínio, contexto longo e suporte nativo a respostas em formato JSON estruturado (`responseMimeType: "application/json"`).

### 2. Modelo Secundário / Chat (Groq)
* **API:** Groq Cloud API
* **Modelo:** `llama-3.1-8b-instant`
* **Principais Usos:** Respostas em tempo real no chat do **Tutor IA** e provedor de redundância imediata (fallback) caso a cota do Gemini seja excedida.
* **Características:** Resposta em milissegundos e alto desempenho com o modelo aberto da Meta.

---

## ⚙️ Roteamento de Tráfego e Fallback Resiliente

Para evitar travamentos de usuários reais sob picos de acesso ou limites de cota de chaves gratuitas (Rate Limit HTTP 429), o sistema implementa:

1. **Janela de Cooldown:** Ao detectar erros de requisição de cota ou instabilidade de rede em um dos provedores, o sistema marca esse provedor com um período de congelamento (`COOLDOWN_TIME` de 5 minutos) e redireciona todo o tráfego subsequente de forma automática para o outro provedor.
2. **Sistema de Retry com Troca de Provedor:** O método central `executeHybridAI()` intercepta erros de timeout ou Rate Limit e faz nova tentativa alternando o destino da chamada.
3. **Gerenciador de Timeout Forçado:** Cada chamada é envelopada por um timeout estrito (`timeoutMs`). Se o provedor não responder na janela estipulada (ex: 45 segundos para geração de questões), o orquestrador mata a requisição e tenta a chamada no provedor parceiro.

---

## 🎯 Estratégias de Prompt e Filtros de Validação

Para garantir a qualidade pedagógica de uma plataforma focada no ENEM, as interações com a IA passam por regras rígidas de formatação:

### 1. Geração de Questões (`generateQuestionBatch`)
* **Prompt de Sistema:** Exige o retorno de um JSON estruturado com contextualização, comando direto e 5 alternativas.
* **Filtro de Qualidade Preguiçosa:** O sistema inspeciona o retorno da IA. Se qualquer alternativa tiver menos de 10 caracteres, o lote é considerado corrompido e descartado, forçando uma nova geração em segundo plano.
* **Correção de Vício de Alternativa (Gabarito C):** As IAs tendem a posicionar a resposta correta no índice 2 (letra C) com mais frequência. Para corrigir esse comportamento vicioso, o Studr implementa o algoritmo de embaralhamento **Fisher-Yates** em `shuffleOptionsAndIndex()`, que embaralha as 5 opções e recalcula dinamicamente o novo `correctIndex` antes de salvar no banco de dados.

### 2. Correção de Redação (`evaluateEssay`)
* **Prompt de Sistema:** Obriga a IA a pontuar o estudante estritamente de acordo com a matriz do INEP. A nota de cada competência deve ser apenas: `0, 40, 80, 120, 160 ou 200`. Pontuações quebradas são invalidadas.
* **Análise de Contexto sob Pressão (Torre Infinita):** Se o aluno realizou a redação no modo Jornada, o corretor recebe metadados de telemetria (total de teclas digitadas, tempo total gasto, contagem de pausas/hesitações maiores que 5 segundos). O prompt instrui a IA a fornecer um feedback tático de alta performance, avaliando a resistência mental do aluno sob estresse.
* **Consistência Matemática:** A pontuação total (`totalScore`) é recalculada matematicamente no backend pela soma real dos campos de competência retornados pela IA, impedindo qualquer erro de soma ou alucinação do modelo.

### 3. Mapas Mentais (`generateStudyMap`)
* O prompt do sistema gera um encadeamento lógico sequencial de subtemas ordenados por relevância e importância estatística no ENEM. O JSON gerado é interpretado pelo frontend para plotar as conexões de nó com a biblioteca `React Flow`.

---
*Documento de arquitetura da camada de Inteligência Artificial gerado em 18/06/2026.*

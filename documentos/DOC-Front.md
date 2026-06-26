# Studr — Frontend React (Client)

Este documento descreve a arquitetura, as funcionalidades, o ecossistema de gerenciamento de estado e as instruções de execução para a camada de **Frontend** da plataforma Studr.

---

## 🏗️ Stack Tecnológica

O frontend foi desenvolvido com foco em desempenho, visual moderno e design responsivo (Mobile-First):

| Tecnologia | Finalidade |
|---|---|
| **React 19** | Biblioteca base para construção da interface |
| **Vite 6** | Bundler ultra-rápido para desenvolvimento e compilação |
| **TypeScript** | Tipagem estática e segurança de código |
| **Tailwind CSS** | Estilização utilitária moderna e responsiva |
| **React Flow 11** | Renderização dos Mapas de Estudo (Fluxogramas Interativos) |
| **Recharts 3** | Gráficos e estatísticas de progresso e desempenho |
| **Lucide React** | Pacote de ícones vetoriais modernos |
| **FingerprintJS** | Identificação única de dispositivo para segurança contra compartilhamento de contas |

---

## 📂 Estrutura de Diretórios (`client/`)

```text
client/
├── components/          # Componentes de tela (Views) e elementos reutilizáveis de UI
├── contexts/            # Provedores de estado global (Context API)
├── hooks/               # Custom hooks (Restaurador de sessão, timer, rastreamento de afiliados)
├── services/            # Serviços HTTP e comunicação com a API Backend e IA
├── test/ / tests/       # Estrutura de testes unitários e de integração
├── types.ts             # Tipos TypeScript compartilhados
├── constants.ts         # Constantes e dicionários globais (Áreas do ENEM, matérias)
├── index.css            # Estilos globais e configurações Tailwind
├── index.tsx            # Ponto de entrada do React
└── vite.config.ts       # Configuração de portas, aliases e compilação do Vite
```

---

## 🎨 Principais Componentes e Telas (`components/`)

### 1. Área Autenticada Principal
* **`HomeView.tsx`:** Dashboard do estudante formatado em layout Bento Grid, que muda a interface dinamicamente se o usuário for Admin, Premium, Trial ou Simulado. Dá acesso rápido a todas as ferramentas.
* **`QuizScreen.tsx`:** Tela central de execução de exames. Gerencia o tempo restante, o progresso das questões de múltipla escolha (A a E), seleção de respostas e envio de rascunhos.
* **`ResultsView.tsx`:** Dashboard pós-prova que apresenta a pontuação estimada via TRI, tempo total gasto, gabarito detalhado com explicações da IA e recomendações inteligentes de estudo.
* **`StudyMapView.tsx`:** Renderiza graficamente o mapa mental de conceitos interativos gerados por IA através do `React Flow`.

### 2. Área de Redação e Chat
* **`EssayView.tsx` & `TowerEssayView.tsx`:** Interface de envio de redações por texto digitado. Apresenta o tema gerado por IA, dicas e a correção linha a linha baseada nos 5 critérios de avaliação do ENEM.
* **`EssayModelBank.tsx`:** Biblioteca de redações nota 1000 comentadas para estudo.
* **`ChatBot.tsx` (Tutor IA):** Janela flutuante integrada com o tutor conversacional para tirar dúvidas rápidas sobre qualquer matéria.

### 3. Painel Administrativo (`AdminShell.tsx`)
Exclusivo para usuários com papel `ADMIN` (ex: `admin@studr.com.br`).
* **`AdminDashboardView.tsx`:** Métricas gerais (total de usuários, conversão premium, XP).
* **`AdminUsersView.tsx`:** Gestão completa de alunos (bloqueio, criação manual e promoção de cargo).
* **`AdminAffiliatesView.tsx`:** Aprovação e controle de comissão de parceiros/afiliados.
* **`AdminAffiliateProductsView.tsx`:** Gestão de links de checkout Kiwify vinculados à plataforma.

### 4. Fluxo Institucional e Vendas
* **`LandingPageV3.tsx`:** Página principal de vendas da plataforma, apresentando recursos, FAQ e depoimentos.
* **`PricingPage.tsx`:** Página de planos que gera o checkout dinâmico da Kiwify aplicando cupons de afiliados se detectados na URL.
* **`AuthView.tsx`:** Controla todo o fluxo de Login, Registro, Verificação de Conta (Trial), Redefinição de Senha e Autorização de Novos Dispositivos (MFA via código no e-mail).

---

## ⚡ Gerenciamento de Estado Global (`contexts/`)

O aplicativo é orquestrado por um pipeline de contextos React aninhados:

1. **`NavigationContext`:** Controla o roteamento do aplicativo (Single Page Application) usando um enum `AppView` e navegação baseada em histórico local.
2. **`UIContext`:** Gerencia o tema escuro/claro, abertura do modal de preços, toast de conquistas e o pop-up de **Sessão Expirada**.
3. **`UserContext`:** Controla o estado de login do usuário, restauração automática de sessão anterior no carregamento da página (`useRestoreSession`) e limpeza de credenciais ao fazer logout.
4. **`GamificationContext`:** Cuida da barra de XP no header, nível atual do aluno e disparo das animações de conquistas.
5. **`PracticeContext`:** Gerencia as sessões de Prática Infinita (questões dinâmicas criadas por IA).
6. **`MockContext`:** Gerencia os Simulados Oficiais (Full ou por área), controlando o cronômetro regressivo e a persistência das respostas locais.

---

## 🔌 Camada de Integração API (`services/`)

A comunicação com o backend Express é centralizada em **`client/services/apiService.ts`**:

* **Injeção de Token:** Lê dinamicamente a chave `studr_token` do Local Storage e a injeta no cabeçalho `Authorization: Bearer <token>` em todas as requisições autenticadas.
* **Mecanismo de Retry (Auto-recuperação):** Caso o backend local ou no Railway demore para responder (status 502, 503, 504 ou 429), a engine tenta reenviar a requisição até 3 vezes com espaçamento progressivo de tempo (1.5s, 3s, 4.5s) antes de acusar erro na interface.
* **Interceptador de Sessão (401):** Qualquer resposta do servidor com status HTTP `401` dispara globalmente o evento `studr:session-expired`, exibindo instantaneamente o modal de bloqueio e forçando o redirecionamento para a tela de autenticação.

---

## 🛠️ Execução e Desenvolvimento Local

### 1. Instalar Dependências
Navegue até a pasta `client` ou execute na raiz:
```bash
# Na pasta client/
npm install
```

### 2. Rodar o Servidor de Desenvolvimento
Inicia o Vite na porta **`3001`**:
```bash
# Na pasta client/
npm run dev

# Ou a partir da raiz (com scripts corrigidos)
npm run dev
```

### 3. Compilar para Produção (Build)
Gera o bundle otimizado na pasta `client/dist/`:
```bash
# Na pasta client/
npm run build

# Ou a partir da raiz
npm run build
```

---
*Documentação desenvolvida em 18/06/2026 para mapeamento da estrutura do frontend da aplicação.*

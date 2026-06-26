# Studr — Banco de Dados (PostgreSQL + Prisma ORM)

Este documento descreve a modelagem de dados, a estrutura de tabelas, relacionamentos e comandos úteis para manutenção da camada de persistência do projeto **Studr**.

---

## 🏗️ Arquitetura de Dados

O banco de dados do Studr está hospedado na nuvem (Railway) e é modelado usando o **PostgreSQL**. A comunicação do backend Express com o banco ocorre por meio do **Prisma ORM** (Object-Relational Mapping), garantindo tipagem estática e facilidade nas migrações.

* **Schema principal:** `server/prisma/schema.prisma`
* **Localização do Banco:** Railway PostgreSQL Instance

---

## 🗄️ Modelagem e Tabelas

O schema está dividido em 5 núcleos de negócios principais:

### 1. Núcleo de Usuários e Segurança
* **`User`**: Perfil central do aluno. Guarda dados cadastrais, e-mail (chave única e normalizada), senha criptografada com `bcryptjs`, nível de acesso (`student` / `ADMIN` / `affiliate`), status da assinatura, nível e XP de gamificação.
* **`UserDevice`**: Registra as impressões digitais de dispositivos (`fingerprint`) autorizados. Usado para o fluxo de autenticação multifator (MFA) por e-mail e detecção de abuso de compartilhamento de contas.

### 2. Núcleo de Exames e Teoria de Resposta ao Item (TRI)
* **`Exam`**: Sessões de provas iniciadas. Guarda o tipo do exame (`PRACTICE`, `MOCK_AREA`, `MOCK_FULL`, `LEGACY`), a área do conhecimento, pontuação final recalibrada na TRI (`score`), o parâmetro de proficiência $\theta$ (`theta`) e o tempo gasto.
* **`ExamQuestion`**: Mapeia cada questão individual de uma sessão de prova. Armazena o JSON completo da questão (`questionJson`), a resposta inserida pelo aluno, a alternativa correta e o status de acerto (`isCorrect`).
* **`QuestionCalibration`**: Tabela que define a parametrização TRI fixa para dificuldades `EASY`, `MEDIUM` e `HARD`. Guarda os parâmetros:
  * $a$ (discriminação)
  * $b$ (dificuldade)
  * $c$ (acerto casual/chute)

### 3. Núcleo de Gamificação e Engajamento
* **`UserXp`**: Estatísticas de progresso semanais de experiência do aluno.
* **`XpRule`**: Tabela de parametrização que define a quantidade de XP ganho por cada ação (responder questões, gabaritar, completar missões diárias, etc.).
* **`LevelThreshold`**: Mapeia o XP acumulado necessário para subir para cada nível (de 1 a 50) e o título conquistado.
* **`Badge`**: Catálogo de medalhas/conquistas da plataforma (ex: "Nota Mil na Redação", "10 Dias de Hábito").
* **`UserBadge`**: Registro de medalhas conquistadas por cada estudante.
* **`UserStreak`**: Controla o número de dias consecutivos estudados e o multiplicador de XP ativo do estudante.
* **`UserProgress`**: Métricas de quantidade de questões respondidas e corretas filtradas por matéria específica (usado para gerar os relatórios de pontos fracos).
* **`RankingSnapshot`**: Registros semanais do ranking da liga (`BRONZE`, `SILVER`, `GOLD`, `DIAMOND`).

### 4. Núcleo de Afiliados e Vendas
* **`Plan`**: Mapeamento dos planos criados na Kiwify (ID Kiwify, nível de acesso, ciclo de cobrança).
* **`AffiliateProduct`**: Cadastra os links oficiais de checkout da Kiwify para os planos Mensal, Anual e Simulado.
* **`AffiliateLink`**: Associa os slugs personalizados de indicação (ex: `?affid=exemplo`) aos descontos configurados para cada parceiro.

### 5. Núcleo de Campanha (Torre Infinita)
* **`UserInfiniteTower`**: Estado de progresso global do aluno na subida da Torre Infinita (prédio atual e andar).
* **`TowerFloor`**: Mapeia andares específicos (Quiz de 5 questões ou redações de Chefão). Controla se está trancado (`isLocked`), se foi finalizado e a pontuação máxima obtida (`highScore`).

---

## 🚀 Comandos Úteis do Prisma

Todos os comandos devem ser executados dentro da pasta `server/` onde o arquivo `schema.prisma` reside:

### 1. Inspecionar o banco visualmente (Interface Gráfica)
Abre o painel visual do Prisma Studio no navegador (`http://localhost:5555`) para que você possa pesquisar, editar ou deletar registros manualmente:
```bash
npx prisma studio
```

### 2. Atualizar o Prisma Client local
Sempre execute após instalar dependências ou modificar o arquivo `schema.prisma` para atualizar a tipagem do cliente:
```bash
npx prisma generate
```

### 3. Criar uma nova Migração
Caso mude alguma tabela ou relacionamento no `schema.prisma`, execute para gerar os arquivos SQL de atualização do banco:
```bash
npx prisma migrate dev --name nome_da_sua_migracao
```

### 4. Rodar o script de Seed
Popula tabelas básicas do sistema (calibrações de TRI, regras de XP, medalhas de gamificação) e cria os usuários padrão de teste:
```bash
# Popula calibrações, XP e conquistas
npx prisma db seed

# Cria os usuários de teste (premium@studr.com.br, etc.)
node seed_test_users.js
```

### 5. Resetar o banco de dados
**Cuidado!** Apaga todos os dados e executa as migrações do zero:
```bash
npx prisma migrate reset
```

---
*Documento de arquitetura da camada de dados gerado em 18/06/2026.*

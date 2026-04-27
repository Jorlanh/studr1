import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── TRI Calibrations ─────────────────────────────────────────────────────────
async function seedCalibrations() {
  const calibrations = [
    { difficulty: 'EASY',   a: 1.0, b: -1.5, c: 0.20 },
    { difficulty: 'MEDIUM', a: 1.2, b:  0.0, c: 0.20 },
    { difficulty: 'HARD',   a: 1.4, b:  1.5, c: 0.20 },
  ];
  for (const cal of calibrations) {
    await prisma.questionCalibration.upsert({
      where: { difficulty: cal.difficulty },
      update: { a: cal.a, b: cal.b, c: cal.c },
      create: cal,
    });
  }
  console.log('✓ Calibrações TRI seedadas.');
}

// ─── XP Rules ─────────────────────────────────────────────────────────────────
async function seedXpRules() {
  const rules = [
    { eventType: 'ANSWER_ANY',          xp: 2   },
    { eventType: 'CORRECT_EASY',        xp: 3   },
    { eventType: 'CORRECT_MEDIUM',      xp: 5   },
    { eventType: 'CORRECT_HARD',        xp: 8   },
    { eventType: 'WRONG',               xp: 0   },
    { eventType: 'DAILY_MISSION',       xp: 20  },
    { eventType: 'WEEKLY_MISSION',      xp: 100 },
    { eventType: 'FINISH_MOCK_AREA',    xp: 50  },
    { eventType: 'FINISH_MOCK_FULL',    xp: 200 },
    { eventType: 'SUBMIT_ESSAY',        xp: 30  },
    { eventType: 'ESSAY_800_BONUS',     xp: 50  },
    { eventType: 'ESSAY_1000_BONUS',    xp: 150 },
    { eventType: 'FIRST_ANSWER_OF_DAY', xp: 5   },
    { eventType: 'FINISH_MOCK',         xp: 50  },
    { eventType: 'ANSWER_QUESTION',     xp: 2   },
    { eventType: 'REVIEW_ERROR',        xp: 3   },
    { eventType: 'FINISH_ESSAY',        xp: 30  },
  ];
  for (const rule of rules) {
    await prisma.xpRule.upsert({
      where: { eventType: rule.eventType },
      update: { xp: rule.xp },
      create: rule,
    });
  }
  console.log('✓ XP rules seedadas.');
}

// ─── Level Thresholds ─────────────────────────────────────────────────────────
function xpForLevel(n) {
  if (n <= 1) return 0;
  if (n <= 20) return 50 * (n - 1) + 10 * (n - 1) * (n - 1);
  return Math.round(xpForLevel(20) * Math.pow(1.2, n - 20));
}

function titleForLevel(n) {
  if (n <=  4) return 'Estudante Iniciante';
  if (n <=  9) return 'Estudante Dedicado';
  if (n <= 14) return 'Vestibulando';
  if (n <= 19) return 'Candidato Preparado';
  if (n <= 24) return 'Aprovado em Potencial';
  if (n <= 29) return 'Aspirante de Elite';
  return 'Mestre do ENEM';
}

async function seedLevels() {
  for (let level = 1; level <= 50; level++) {
    await prisma.levelThreshold.upsert({
      where: { level },
      update: { xpRequired: xpForLevel(level), title: titleForLevel(level) },
      create: { level, xpRequired: xpForLevel(level), title: titleForLevel(level) },
    });
  }
  console.log('✓ Level thresholds seedados (1-50).');
}

// ─── Badge Catalog ────────────────────────────────────────────────────────────
async function seedBadges() {
  const BADGES = [
    // Progress
    { key: 'progress.first_question',  title: 'Primeira tentativa',      description: 'Responder a primeira questão',          category: 'PROGRESS', criteria: {},                  iconEmoji: '🎯' },
    { key: 'progress.streak_10',       title: '10 em sequência',          description: '10 acertos consecutivos',               category: 'PROGRESS', criteria: { consecutiveCorrect: 10 }, iconEmoji: '🔥' },
    { key: 'progress.centurion',       title: 'Centurião',                description: '100 questões respondidas',              category: 'PROGRESS', criteria: { answered: 100 },   iconEmoji: '💯' },
    { key: 'progress.thousand_bright', title: 'Mil brilhantes',           description: '1.000 questões respondidas',            category: 'PROGRESS', criteria: { answered: 1000 },  iconEmoji: '🌟' },
    { key: 'progress.ten_thousand',    title: 'Dez mil de fôlego',        description: '10.000 questões respondidas',           category: 'PROGRESS', criteria: { answered: 10000 }, iconEmoji: '🏆' },
    // Essay
    { key: 'essay.first',              title: 'Primeira redação',         description: 'Entregou 1 redação',                    category: 'ESSAY',    criteria: {},                  iconEmoji: '✍️' },
    { key: 'essay.near_perfect',       title: 'Candidato a 900',          description: 'Nota ≥ 800 em uma redação',             category: 'ESSAY',    criteria: { minScore: 800 },   iconEmoji: '🎓' },
    { key: 'essay.perfect',            title: 'Nota Mil',                 description: 'Nota = 1000 em uma redação',            category: 'ESSAY',    criteria: { minScore: 1000 },  iconEmoji: '🏅' },
    // Mock
    { key: 'mock.first',               title: 'Primeira prova',           description: 'Completou 1 simulado',                  category: 'MOCK',     criteria: {},                  iconEmoji: '🎢' },
    { key: 'mock.marathon',            title: 'Maratonista',              description: 'Completou 1 simulado completo',         category: 'MOCK',     criteria: { type: 'MOCK_FULL' }, iconEmoji: '🎖️' },
    { key: 'mock.lightning',           title: 'Relâmpago',                description: 'Simulado por área em menos de 1h',      category: 'MOCK',     criteria: { maxTimeSec: 3600, type: 'MOCK_AREA' }, iconEmoji: '⚡' },
    { key: 'mock.rising',              title: 'Em ascensão',              description: '+100 pontos TRI entre provas',          category: 'MOCK',     criteria: { minImprovement: 100 }, iconEmoji: '📈' },
    { key: 'mock.elite',               title: 'Elite',                    description: 'TRI ≥ 800 em simulado completo',        category: 'MOCK',     criteria: { minScore: 800, type: 'MOCK_FULL' }, iconEmoji: '👑' },
    // Habit
    { key: 'habit.streak_3',           title: 'Iniciando o hábito',       description: '3 dias consecutivos de estudo',         category: 'HABIT',    criteria: { days: 3 },   iconEmoji: '📅' },
    { key: 'habit.streak_7',           title: 'Uma semana firme',         description: '7 dias consecutivos de estudo',         category: 'HABIT',    criteria: { days: 7 },   iconEmoji: '🗓️' },
    { key: 'habit.streak_15',          title: 'Quinzena de disciplina',   description: '15 dias consecutivos de estudo',        category: 'HABIT',    criteria: { days: 15 },  iconEmoji: '🎯' },
    { key: 'habit.streak_30',          title: 'Um mês sem falhar',        description: '30 dias consecutivos de estudo',        category: 'HABIT',    criteria: { days: 30 },  iconEmoji: '💪' },
    { key: 'habit.streak_60',          title: 'Dois meses de fogo',       description: '60 dias consecutivos de estudo',        category: 'HABIT',    criteria: { days: 60 },  iconEmoji: '🔥' },
    { key: 'habit.streak_100',         title: 'Lenda do ENEM',            description: '100 dias consecutivos de estudo',       category: 'HABIT',    criteria: { days: 100 }, iconEmoji: '🏛️' },
  ];

  const SUBJECTS = [
    'Matemática', 'Português', 'Literatura', 'Inglês', 'Espanhol',
    'Artes', 'Educação Física', 'História', 'Geografia',
    'Filosofia', 'Sociologia', 'Física', 'Química', 'Biologia',
  ];
  const TIERS = [
    { tier: 'bronze',  count: 10,  emoji: '🥉' },
    { tier: 'silver',  count: 50,  emoji: '🥈' },
    { tier: 'gold',    count: 200, emoji: '🥇' },
    { tier: 'diamond', count: 500, emoji: '💎' },
  ];

  for (const subject of SUBJECTS) {
    const keySubject = subject.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z]/g, '_');
    for (const t of TIERS) {
      BADGES.push({
        key: `subject.${keySubject}.${t.tier}`,
        title: `${t.tier[0].toUpperCase() + t.tier.slice(1)} em ${subject}`,
        description: `${t.count} acertos em ${subject}`,
        category: 'SUBJECT',
        criteria: { subject, count: t.count },
        iconEmoji: t.emoji,
      });
    }
  }

  for (const b of BADGES) {
    await prisma.badge.upsert({
      where: { key: b.key },
      update: { title: b.title, description: b.description, category: b.category, criteria: b.criteria, iconEmoji: b.iconEmoji },
      create: b,
    });
  }
  console.log(`✓ ${BADGES.length} badges seedadas.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await seedCalibrations();
  await seedXpRules();
  await seedLevels();
  await seedBadges();
  console.log('\n✅ Seed completo.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

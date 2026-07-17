import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Caches ───────────────────────────────────────────────────────────────────

let _rules = null, _rulesAt = 0;
async function getXpRules() {
  if (_rules && Date.now() - _rulesAt < 10 * 60 * 1000) return _rules;
  const rows = await prisma.xpRule.findMany();
  _rules = Object.fromEntries(rows.map(r => [r.eventType, r.xp]));
  _rulesAt = Date.now();
  return _rules;
}

let _levels = null;
async function getLevelThresholds() {
  if (_levels) return _levels;
  _levels = await prisma.levelThreshold.findMany({ orderBy: { level: 'asc' } });
  return _levels;
}

let _badges = null, _badgesAt = 0;
async function getAllBadges() {
  if (_badges && Date.now() - _badgesAt < 10 * 60 * 1000) return _badges;
  _badges = await prisma.badge.findMany();
  _badgesAt = Date.now();
  return _badges;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function levelFromXp(totalXp, thresholds) {
  let current = 1;
  for (const t of thresholds) {
    if (totalXp >= t.xpRequired) current = t.level;
    else break;
  }
  return current;
}

function startOfWeek(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const diff = x.getDay() === 0 ? 6 : x.getDay() - 1; // Mon=0
  x.setDate(x.getDate() - diff);
  return x;
}

async function getOrCreateUserXp(userId) {
  return prisma.userXp.upsert({
    where: { userId },
    update: {},
    create: { userId, weekStartsAt: startOfWeek(), league: 'BRONZE' },
  });
}

async function getOrCreateUserStreak(userId) {
  return prisma.userStreak.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

// ─── Streak ───────────────────────────────────────────────────────────────────

async function updateStreak(userId) {
  const streak = await getOrCreateUserStreak(userId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last = streak.lastActiveDate ? new Date(streak.lastActiveDate) : null;
  if (last) last.setHours(0, 0, 0, 0);

  let { currentStreak, longestStreak } = streak;

  if (!last) {
    currentStreak = 1;
  } else {
    const diffDays = Math.round((today - last) / 86400000);
    if (diffDays === 0) {
      // same day — no change
    } else if (diffDays === 1) {
      currentStreak += 1;
    } else {
      currentStreak = 1; // broken
    }
  }
  longestStreak = Math.max(longestStreak, currentStreak);

  let multiplier = 1.0;
  if      (currentStreak >= 100) multiplier = 2.0;
  else if (currentStreak >= 60)  multiplier = 1.7;
  else if (currentStreak >= 30)  multiplier = 1.5;
  else if (currentStreak >= 15)  multiplier = 1.3;
  else if (currentStreak >= 7)   multiplier = 1.2;
  else if (currentStreak >= 3)   multiplier = 1.1;

  return prisma.userStreak.update({
    where: { userId },
    data: { currentStreak, longestStreak, multiplier, lastActiveDate: new Date() },
  });
}

// ─── XP Processing ────────────────────────────────────────────────────────────

async function processEvent(userId, eventType, payload = {}) {
  const rules = await getXpRules();

  // Base XP for this event
  let delta = rules[eventType] ?? 0;

  // For ANSWER_QUESTION: also add ANSWER_ANY and difficulty bonus
  if (eventType === 'ANSWER_QUESTION') {
    const diffKey = payload.correct
      ? (payload.difficulty === 'HARD' ? 'CORRECT_HARD' : payload.difficulty === 'MEDIUM' ? 'CORRECT_MEDIUM' : 'CORRECT_EASY')
      : 'WRONG';
    delta = (rules['ANSWER_ANY'] ?? 0) + (rules[diffKey] ?? 0);
  }

  // Apply streak multiplier
  const streak = await updateStreak(userId);
  delta = Math.round(delta * streak.multiplier);

  // Update UserXp
  const userXp = await getOrCreateUserXp(userId);
  const currentWeek = startOfWeek();
  const resetWeek = startOfWeek(userXp.weekStartsAt).getTime() !== currentWeek.getTime();

  const newTotal = userXp.totalXp + delta;
  const thresholds = await getLevelThresholds();
  const newLevel = levelFromXp(newTotal, thresholds);
  const leveledUp = newLevel > userXp.level;

  await prisma.userXp.update({
    where: { userId },
    data: {
      totalXp: newTotal,
      level: newLevel,
      weeklyXp: resetWeek ? delta : { increment: delta },
      ...(resetWeek ? { weekStartsAt: currentWeek } : {}),
    },
  });

  return { xpDelta: delta, totalXp: newTotal, level: newLevel, leveledUp };
}

// ─── Subject Progress ─────────────────────────────────────────────────────────

export async function updateSubjectProgress(userId, subject, correct) {
  return prisma.userProgress.upsert({
    where: { userId_subject: { userId, subject } },
    update: {
      questionsAnswered: { increment: 1 },
      questionsCorrect: { increment: correct ? 1 : 0 },
    },
    create: { userId, subject, questionsAnswered: 1, questionsCorrect: correct ? 1 : 0 },
  });
}

// ─── Badge Checking ───────────────────────────────────────────────────────────

async function badgeEarned(userId, badge, eventType, payload) {
  const { category, criteria } = badge;
  const c = typeof criteria === 'string' ? JSON.parse(criteria) : criteria;

  if (badge.key === 'progress.first_question') {
    return eventType === 'ANSWER_QUESTION';
  }

  if (category === 'PROGRESS') {
    if (badge.key === 'progress.streak_10') return (payload.consecutiveCorrect ?? 0) >= 10;
    if (c.answered) {
      const agg = await prisma.userProgress.aggregate({
        where: { userId },
        _sum: { questionsAnswered: true },
      });
      return (agg._sum.questionsAnswered ?? 0) >= c.answered;
    }
  }

  if (category === 'SUBJECT' && c.subject && c.count) {
    const row = await prisma.userProgress.findUnique({
      where: { userId_subject: { userId, subject: c.subject } },
    });
    return (row?.questionsCorrect ?? 0) >= c.count;
  }

  if (category === 'ESSAY') {
    // essay.first: awarded on first SUBMIT_ESSAY event
    if (badge.key === 'essay.first') return eventType === 'SUBMIT_ESSAY';
    // Score-based essay badges come from payload
    if (c.minScore) return (payload.essayScore ?? 0) >= c.minScore;
    // Count-based essay badges: require essay count field — skip for now
    return false;
  }

  if (category === 'MOCK') {
    if (badge.key === 'mock.first')     return eventType === 'FINISH_MOCK';
    if (badge.key === 'mock.marathon')  return eventType === 'FINISH_MOCK' && payload.mockType === 'MOCK_FULL';
    if (badge.key === 'mock.lightning') return eventType === 'FINISH_MOCK' && payload.mockType === 'MOCK_AREA' && (payload.timeSpentSec ?? Infinity) < 3600;
    if (badge.key === 'mock.elite')     return eventType === 'FINISH_MOCK' && payload.mockType === 'MOCK_FULL' && (payload.score ?? 0) >= 800;
    if (badge.key === 'mock.rising')    return eventType === 'FINISH_MOCK' && (payload.improvement ?? 0) >= 100;
  }

  if (category === 'HABIT' && c.days) {
    const s = await prisma.userStreak.findUnique({ where: { userId } });
    return (s?.currentStreak ?? 0) >= c.days;
  }

  return false;
}

export async function checkBadges(userId, eventType, payload) {
  const [all, existing] = await Promise.all([
    getAllBadges(),
    prisma.userBadge.findMany({ where: { userId }, select: { badgeKey: true } }),
  ]);
  const have = new Set(existing.map(e => e.badgeKey));
  const awarded = [];

  for (const badge of all) {
    if (have.has(badge.key)) continue;
    try {
      const earned = await badgeEarned(userId, badge, eventType, payload);
      if (earned) {
        await prisma.userBadge.create({ data: { userId, badgeKey: badge.key } });
        awarded.push(badge);
      }
    } catch (err) {
      console.warn(`[badges] Erro ao checar badge ${badge.key}:`, err?.message);
    }
  }
  return awarded;
}

// ─── Main API ─────────────────────────────────────────────────────────────────

export async function emitEvent(userId, eventType, payload = {}) {
  // Update subject progress for answer events
  if (eventType === 'ANSWER_QUESTION' && payload.subject) {
    await updateSubjectProgress(userId, payload.subject, payload.correct ?? false);
  }

  const xpResult = await processEvent(userId, eventType, payload);
  const newBadges = await checkBadges(userId, eventType, payload);
  return { ...xpResult, newBadges };
}

export async function getState(userId) {
  const [xp, streak, badges, progress] = await Promise.all([
    prisma.userXp.findUnique({ where: { userId } }),
    prisma.userStreak.findUnique({ where: { userId } }),
    prisma.userBadge.findMany({ where: { userId }, include: { badge: true } }),
    prisma.userProgress.findMany({ where: { userId } }),
  ]);

  const thresholds = await getLevelThresholds();
  const lvl = xp?.level ?? 1;
  const currentTitle = thresholds.find(t => t.level === lvl)?.title ?? 'Estudante Iniciante';
  const nextThreshold = thresholds.find(t => t.level === lvl + 1);
  const currentThreshold = thresholds.find(t => t.level === lvl);

  return {
    xp: {
      totalXp: xp?.totalXp ?? 0,
      level: lvl,
      weeklyXp: xp?.weeklyXp ?? 0,
      league: xp?.league ?? 'BRONZE'
    },
    title: currentTitle,
    currentLevelXp: currentThreshold?.xpRequired ?? 0,
    nextLevelXp: nextThreshold?.xpRequired ?? null,
    streak: {
      currentStreak: streak?.currentStreak ?? 0,
      longestStreak: streak?.longestStreak ?? 0,
      multiplier: streak?.multiplier ?? 1.0,
    },
    badges: badges.map(b => ({ ...b.badge, awardedAt: b.awardedAt })),
    progress,
  };
}

// ─── Ranking Oficial (Motor de Processamento) ─────────────────────────────────

export async function getCurrentRanking(userId, limit = 50, offset = 0) {
  const currentWeekTime = startOfWeek().getTime();

  // 1. Descobre qual é a liga atual do usuário solicitante
  const me = await prisma.userXp.findUnique({ where: { userId }, select: { league: true } });
  const myLeague = me?.league || 'BRONZE';

  // 2. Busca APENAS os usuários que estão na MESMA liga
  const userXps = await prisma.userXp.findMany({
    where: { league: myLeague },
    include: {
      user: { select: { id: true, name: true } }
    }
  });

  // 3. Aplica a penalidade temporal (zera o XP visual se não jogou nesta semana)
  let entries = userXps.map(x => {
    const isCurrentWeek = x.weekStartsAt && new Date(x.weekStartsAt).getTime() === currentWeekTime;
    return {
      id: x.user?.id || x.userId,
      name: x.user?.name || 'Estudante',
      weeklyXp: isCurrentWeek ? (x.weeklyXp || 0) : 0,
      level: x.level || 1,
      league: x.league
    };
  });

  // 4. Ordenação Implacável
  entries.sort((a, b) => {
    if (b.weeklyXp !== a.weeklyXp) return b.weeklyXp - a.weeklyXp;
    if (b.level !== a.level) return b.level - a.level;
    return a.name.localeCompare(b.name);
  });

  const myIndex = entries.findIndex(e => e.id === userId);
  const myPosition = myIndex !== -1 ? myIndex + 1 : 0;

  const paginatedEntries = entries.slice(offset, offset + limit).map((e, idx) => ({
    rank: offset + idx + 1,
    name: e.name,
    weeklyXp: e.weeklyXp,
    level: e.level,
    isMe: e.id === userId
  }));

  return {
    league: myLeague, 
    myPosition: myPosition,
    totalInLeague: entries.length,
    entries: paginatedEntries
  };
}

// ─── Mecânica de Rebaixamento e Promoção (Cron Job) ───────────────────────────

export async function rolloverWeek() {
  const leagues = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'CHALLENGER'];
  const currentWeek = startOfWeek();
  const users = await prisma.userXp.findMany();

  const byLeague = { 'BRONZE': [], 'SILVER': [], 'GOLD': [], 'DIAMOND': [], 'CHALLENGER': [] };
  users.forEach(u => {
    if (byLeague[u.league]) byLeague[u.league].push(u);
    else byLeague['BRONZE'].push(u); 
  });

  const updates = [];

  for (let i = 0; i < leagues.length; i++) {
    const league = leagues[i];
    let players = byLeague[league];

    // Ordena os jogadores da liga pelo XP atual antes de zerar
    players.sort((a, b) => {
      if (b.weeklyXp !== a.weeklyXp) return b.weeklyXp - a.weeklyXp;
      return b.level - a.level;
    });

    const total = players.length;
    if (total === 0) continue;

    // A foice dos 20%
    const top20Count = Math.max(1, Math.floor(total * 0.20));
    const bottom20Count = Math.max(1, Math.floor(total * 0.20));

    players.forEach((p, index) => {
      let newLeague = league;

      // Promoção (não aplica para Challenger)
      if (index < top20Count && i < leagues.length - 1) {
        newLeague = leagues[i + 1];
      }
      // Rebaixamento (não aplica para Bronze)
      else if (index >= total - bottom20Count && i > 0) {
        newLeague = leagues[i - 1];
      }

      updates.push(
        prisma.userXp.update({
          where: { userId: p.userId },
          data: {
            league: newLeague,
            weeklyXp: 0,
            weekStartsAt: currentWeek
          }
        })
      );
    });
  }

  // Executa todas as atualizações no banco de uma vez
  await prisma.$transaction(updates);
  return { status: 'Rollover executed', usersProcessed: users.length };
}
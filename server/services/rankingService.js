/**
 * rankingService.js
 * -----------------
 * Ranking semanal por liga (Bronze → Prata → Ouro → Diamante).
 * Virada de semana: snapshot + promoção/rebaixamento + reset de weeklyXp.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const LEAGUES = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND'];

export const LEAGUE_LABELS = {
  BRONZE:  'Bronze',
  SILVER:  'Prata',
  GOLD:    'Ouro',
  DIAMOND: 'Diamante',
};

// Taxa de promoção por liga
const PROMOTE_RATE = { BRONZE: 0.20, SILVER: 0.15, GOLD: 0.10, DIAMOND: 0 };
// Taxa de rebaixamento (Bronze não rebaixa)
const DEMOTE_RATE  = { BRONZE: 0.00, SILVER: 0.10, GOLD: 0.10, DIAMOND: 0.10 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function startOfWeek(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const diff = x.getDay() === 0 ? 6 : x.getDay() - 1; // Seg = 0
  x.setDate(x.getDate() - diff);
  return x;
}

function nextLeague(l) {
  const i = LEAGUES.indexOf(l);
  return i < LEAGUES.length - 1 ? LEAGUES[i + 1] : l;
}

function prevLeague(l) {
  const i = LEAGUES.indexOf(l);
  return i > 0 ? LEAGUES[i - 1] : l;
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

/**
 * Retorna os alunos da liga do usuário logado, ordenados por weeklyXp desc.
 * Inclui a posição do próprio usuário na liga.
 */
export async function getCurrentRanking(userId, limit = 50, offset = 0) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { xpRecord: true },
  });
  const league = user?.currentLeague ?? 'BRONZE';

  const [entries, myCount] = await Promise.all([
    prisma.user.findMany({
      where: { currentLeague: league },
      include: { xpRecord: true },
      orderBy: { xpRecord: { weeklyXp: 'desc' } },
      take: limit,
      skip: offset,
    }),
    prisma.user.count({
      where: {
        currentLeague: league,
        xpRecord: { weeklyXp: { gt: user?.xpRecord?.weeklyXp ?? 0 } },
      },
    }),
  ]);

  const myPosition = myCount + 1;

  return {
    league,
    leagueLabel: LEAGUE_LABELS[league] ?? league,
    myPosition,
    totalInLeague: await prisma.user.count({ where: { currentLeague: league } }),
    entries: entries.map((u, i) => ({
      rank: offset + i + 1,
      name: u.name ?? 'Aluno',
      weeklyXp: u.xpRecord?.weeklyXp ?? 0,
      level: u.xpRecord?.level ?? 1,
      isMe: u.id === userId,
    })),
  };
}

// ─── Virada semanal ───────────────────────────────────────────────────────────

/**
 * Deve ser chamado na segunda-feira às 00:05 (fuso America/Sao_Paulo).
 * 1. Salva RankingSnapshot da semana encerrada.
 * 2. Promove top N% e rebaixa bottom 10%.
 * 3. Concede badge de pódio (top 3 de cada liga).
 * 4. Zera weeklyXp de todos.
 */
export async function rolloverWeek() {
  const currentWeek  = startOfWeek();
  const previousWeek = new Date(currentWeek);
  previousWeek.setDate(previousWeek.getDate() - 7);

  console.log(`[ranking] Virada semana: ${previousWeek.toISOString().slice(0, 10)} → ${currentWeek.toISOString().slice(0, 10)}`);

  for (const league of LEAGUES) {
    const users = await prisma.user.findMany({
      where: { currentLeague: league },
      include: { xpRecord: true },
      orderBy: { xpRecord: { weeklyXp: 'desc' } },
    });

    if (users.length === 0) continue;

    // 1. Snapshot
    const snapshots = users.map((u, i) => ({
      userId:   u.id,
      weekStart: previousWeek,
      league,
      weeklyXp: u.xpRecord?.weeklyXp ?? 0,
      position: i + 1,
    }));
    await prisma.rankingSnapshot.createMany({ data: snapshots, skipDuplicates: true });

    // 2. Promoção / rebaixamento
    const promoteCount = Math.floor(users.length * PROMOTE_RATE[league]);
    const demoteCount  = Math.floor(users.length * DEMOTE_RATE[league]);

    const toPromote = users.slice(0, promoteCount).map(u => u.id);
    const toDemote  = users.slice(users.length - demoteCount).map(u => u.id);

    // Evitar que o mesmo usuário seja promovido e rebaixado (edge case: liga 1 pessoa)
    const toPromoteSet = new Set(toPromote);
    const toDemoteFinal = toDemote.filter(id => !toPromoteSet.has(id));

    if (toPromote.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: toPromote } },
        data:  { currentLeague: nextLeague(league) },
      });
    }
    if (toDemoteFinal.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: toDemoteFinal } },
        data:  { currentLeague: prevLeague(league) },
      });
    }

    // 3. Badge de pódio para top 3
    const podiumDate = previousWeek.toISOString().slice(0, 10);
    const podium = users.slice(0, Math.min(3, users.length));
    for (const u of podium) {
      const badgeKey = `ranking.podium.${podiumDate}`;
      // Badge dinâmica — não precisa existir na tabela Badge, só cria UserBadge diretamente
      try {
        await prisma.userBadge.upsert({
          where:  { userId_badgeKey: { userId: u.id, badgeKey } },
          update: {},
          create: { userId: u.id, badgeKey },
        });
      } catch {
        // Se a FK de Badge bloquear (badge dinâmica não existe), ignora silenciosamente
      }
    }

    console.log(`[ranking] ${league}: ${users.length} alunos | +${toPromote.length} promovidos | -${toDemoteFinal.length} rebaixados`);
  }

  // 4. Zerar weeklyXp de todos
  await prisma.userXp.updateMany({
    data: { weeklyXp: 0, weekStartsAt: currentWeek },
  });

  console.log('[ranking] weeklyXp zerado para todos.');
}

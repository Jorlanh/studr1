import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ESSAY_THEMES = [
  "Os impactos da inteligência artificial no mercado de trabalho brasileiro",
  "O estigma associado às doenças mentais na sociedade",
  "A democratização do acesso à cultura no Brasil",
  "Caminhos para combater a evasão escolar no ensino médio",
  "A importância da educação financeira nas escolas"
];

// ─── LÓGICA DE PRÉDIOS (CANDY CRUSH / DUOLINGO) ──────────────────────────────
function generateFloorConfig(floorNumber) {
  // A cada 5 andares, formamos 1 Prédio (Mundo)
  const predio = Math.ceil(floorNumber / 5); 
  const posicaoNoPredio = floorNumber % 5; // Retorna 1, 2, 3, 4 ou 0 (que é o 5º)

  let area, type, isBoss, topic;

  // A dificuldade cresce a cada Prédio novo!
  const targetTriBase = 350 + (predio * 40); 
  const targetRedacaoBase = 500 + (predio * 50);

  // Ordem Fixa de Matérias por Andar
  if (posicaoNoPredio === 1) {
    area = 'LINGUAGENS'; type = 'QUIZ'; isBoss = false; topic = 'Interpretação e Literatura';
  } else if (posicaoNoPredio === 2) {
    area = 'HUMANAS'; type = 'QUIZ'; isBoss = false; topic = 'História e Sociedade';
  } else if (posicaoNoPredio === 3) {
    area = 'NATUREZA'; type = 'QUIZ'; isBoss = false; topic = 'Biologia, Física e Química';
  } else if (posicaoNoPredio === 4) {
    area = 'MATEMATICA'; type = 'QUIZ'; isBoss = false; topic = 'Cálculos e Geometria Plana';
  } else {
    // Posição 0 (Andar 5, 10, 15...) é sempre a Redação do Chefão para mudar de Prédio!
    area = null; type = 'ESSAY'; isBoss = true; topic = ESSAY_THEMES[(predio - 1) % ESSAY_THEMES.length];
  }

  // Define a nota mínima para não reprovar de andar
  const targetScore = isBoss ? Math.min(targetRedacaoBase, 960) : Math.min(targetTriBase, 800);

  return { type, topic, area, targetScore, isBoss };
}

function calculateStars(type, score, targetScore) {
  if (score < targetScore) return 0; // Se tirou menos que a meta, 0 estrelas e REPROVADO
  const margin2Stars = type === 'ESSAY' ? 100 : 80;
  const margin3Stars = type === 'ESSAY' ? 200 : 150;

  if (score >= targetScore + margin3Stars) return 3;
  if (score >= targetScore + margin2Stars) return 2;
  return 1;
}

export async function getUserTower(userId) {
  let tower = await prisma.userInfiniteTower.findUnique({
    where: { userId },
    include: { floors: { orderBy: { floorNumber: 'asc' } } }
  });

  if (!tower) {
    tower = await prisma.userInfiniteTower.create({ data: { userId, highestFloor: 1 } });
  }

  // Savepoint: Garante que o andar atual exista
  const currentFloorExists = tower.floors?.find(f => f.floorNumber === tower.highestFloor);
  if (!currentFloorExists) {
    const config = generateFloorConfig(tower.highestFloor);
    await prisma.towerFloor.create({
      data: { towerId: tower.id, floorNumber: tower.highestFloor, ...config }
    });
    tower = await prisma.userInfiniteTower.findUnique({
      where: { userId }, include: { floors: { orderBy: { floorNumber: 'asc' } } }
    });
  }
  return tower;
}

export async function submitFloorResult(userId, floorId, score) {
  const floor = await prisma.towerFloor.findUnique({ where: { id: floorId }, include: { tower: true } });
  if (!floor || floor.tower.userId !== userId) throw new Error("Andar inválido.");

  // Se for MENOR que a meta, isWin é false e ele NÃO PASSA de fase!
  const isWin = score >= floor.targetScore; 
  const starsEarned = calculateStars(floor.type, score, floor.targetScore);
  const isFirstClear = !floor.completed && isWin;

  await prisma.towerFloor.update({
    where: { id: floorId },
    data: {
      attempts: floor.attempts + 1,
      bestScore: Math.max(floor.bestScore, score),
      completed: isWin ? true : floor.completed,
      stars: Math.max(floor.stars, starsEarned)
    }
  });

  // Gamificação simplificada
  let xpGained = isFirstClear ? (floor.isBoss ? 250 : 50 + (starsEarned * 10)) : (isWin ? 5 : 0);

  if (xpGained > 0) {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())); 
    startOfWeek.setHours(0, 0, 0, 0);
    await prisma.userXp.upsert({
      where: { userId },
      update: { totalXp: { increment: xpGained }, weeklyXp: { increment: xpGained } },
      create: { userId, totalXp: xpGained, weeklyXp: xpGained, level: 1, weekStartsAt: startOfWeek }
    });
  }

  // Só libera o próximo andar se bater a meta (isWin === true)
  let unlockedNext = false;
  if (isFirstClear && floor.floorNumber === floor.tower.highestFloor) {
    const nextFloorNumber = floor.floorNumber + 1;
    await prisma.userInfiniteTower.update({
      where: { id: floor.tower.id }, data: { highestFloor: nextFloorNumber }
    });
    await prisma.towerFloor.create({
      data: { towerId: floor.tower.id, floorNumber: nextFloorNumber, ...generateFloorConfig(nextFloorNumber) }
    });
    unlockedNext = true;
  }

  return { isWin, score, targetScore: floor.targetScore, stars: starsEarned, xpGained, unlockedNext };
}

// NOVO: Busca o Top 3 daquele Prédio específico
export async function getTop3ForBuilding(floorNumber) {
  const topFloors = await prisma.towerFloor.findMany({
    where: { floorNumber: parseInt(floorNumber), completed: true },
    orderBy: { bestScore: 'desc' },
    take: 3,
    include: { tower: { include: { user: { select: { name: true, xp: true } } } } }
  });

  return topFloors.map((f, i) => ({
    position: i + 1,
    name: f.tower.user.name || 'Herói Anônimo',
    score: f.bestScore
  }));
}
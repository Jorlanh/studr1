import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// --- DEFINIÇÃO DOS DISTRITOS (MAPA GLOBAL) ---
const DISTRICTS = [
    { name: "Distrito Inicial", startBldg: 1, endBldg: 9, theme: "bg-emerald-50" },
    { name: "Cidade Base", startBldg: 10, endBldg: 24, theme: "bg-blue-50" },
    { name: "Zona Intermediária", startBldg: 25, endBldg: 44, theme: "bg-indigo-50" },
    { name: "Cidade Elite", startBldg: 45, endBldg: 69, theme: "bg-purple-50" },
    { name: "Complexo Nacional", startBldg: 70, endBldg: 89, theme: "bg-slate-900 text-white" },
    { name: "Torre Suprema", startBldg: 90, endBldg: 99, theme: "bg-black text-yellow-500" },
    { name: "Torre dos 1000 Pontos", startBldg: 100, endBldg: 100, theme: "bg-gradient-to-r from-yellow-600 to-amber-900 text-white" }
];

// --- MOTOR DE CÁLCULO DE QUESTÕES POR PRÉDIO ---
function calculateQuestionsForBuilding(buildingNum) {
    if (buildingNum < 2) return 5;
    if (buildingNum < 3) return 6; // Prédio 2: 6 questões
    if (buildingNum < 4) return 7;
    if (buildingNum < 5) return 8;
    if (buildingNum < 10) return 9;
    if (buildingNum < 15) return 12;
    if (buildingNum < 20) return 15;
    if (buildingNum < 25) return 18;
    if (buildingNum < 30) return 22;
    if (buildingNum < 35) return 25;
    if (buildingNum < 40) return 30;
    if (buildingNum < 45) return 35;
    if (buildingNum < 50) return 40;
    if (buildingNum < 60) return 45;
    if (buildingNum < 70) return 60;
    if (buildingNum < 80) return 75;
    if (buildingNum < 90) return 90;
    if (buildingNum < 100) return 120;
    return 180;
}

// --- MOTOR DE PONTUAÇÃO (PROPORCIONAL AOS ACERTOS) ---
function calculateScoreFromHits(hits, buildingNum) {
    const totalQuestions = calculateQuestionsForBuilding(buildingNum);
    if (totalQuestions <= 0) return 0;
    // Transforma acertos em nota de 0 a 1000
    return Math.round((hits / totalQuestions) * 1000);
}

// --- MOTOR DE DIFICULDADE (TRI ALVO) ---
function calculateTargetScoreForBuilding(buildingNum) {
    const baseScore = 400;
    const maxScore = 950;
    const increment = (maxScore - baseScore) / 100;
    return Math.floor(baseScore + (buildingNum * increment));
}

function getDistrictForBuilding(buildingNum) {
    return DISTRICTS.find(d => buildingNum >= d.startBldg && buildingNum <= d.endBldg) || DISTRICTS[0];
}

export const getUserTower = async (userId) => {
  try {
    let towerUser = await prisma.userInfiniteTower.findUnique({
      where: { userId },
      include: {
        floors: {
          orderBy: [{ building: 'asc' }, { floorNumber: 'asc' }]
        }
      }
    });

    if (!towerUser) {
      towerUser = await prisma.userInfiniteTower.create({
        data: {
          userId,
          currentBuilding: 1,
          currentFloor: 1,
          totalXp: 0,
          floors: {
            create: [
              { building: 1, floorNumber: 1, isLocked: false, targetScore: 400 }
            ]
          }
        },
        include: { floors: true }
      });
    }
    return towerUser;
  } catch (error) {
    console.error('Erro em getUserTower:', error);
    throw error;
  }
};

export const submitFloorResult = async (userId, floorId, hits) => {
  try {
    // 1. Obter dados do andar e da torre do utilizador
    const floor = await prisma.towerFloor.findUnique({ 
        where: { id: floorId },
        include: { tower: true }
    });
    if (!floor) throw new Error('Andar não encontrado');

    const towerUser = floor.tower;
    const buildingNum = floor.building;

    // 2. Calcular nota baseada nos acertos (hits vem do frontend)
    const currentScore = calculateScoreFromHits(hits, buildingNum);
    const isWin = currentScore >= floor.targetScore;
    
    let xpGained = 0;
    let stars = 0;

    if (isWin) {
      // Cálculo de estrelas (proporcional à performance)
      if (currentScore >= 900) stars = 3;
      else if (currentScore >= 700) stars = 2;
      else stars = 1;

      xpGained = Math.round(currentScore * 0.1 * stars);

      // Atualizar status do andar
      await prisma.towerFloor.update({
        where: { id: floorId },
        data: {
          isCompleted: true,
          highScore: Math.max(currentScore, floor.highScore || 0),
          stars: Math.max(stars, floor.stars || 0)
        }
      });

      // Lógica de Progressão: 5 andares por prédio
      const isLastFloorInBuilding = floor.floorNumber >= 5;
      let nextBuilding = buildingNum;
      let nextFloorNum = floor.floorNumber + 1;

      if (isLastFloorInBuilding) {
        nextBuilding = buildingNum + 1;
        nextFloorNum = 1;
      }

      // 3. Garantir criação do próximo andar se não existir
      const nextFloorExists = await prisma.towerFloor.findFirst({
        where: { towerUserId: towerUser.id, building: nextBuilding, floorNumber: nextFloorNum }
      });

      if (!nextFloorExists) {
          await prisma.towerFloor.create({
            data: {
              towerUserId: towerUser.id,
              building: nextBuilding,
              floorNumber: nextFloorNum,
              isLocked: false,
              targetScore: calculateTargetScoreForBuilding(nextBuilding)
            }
          });
      }

      // 4. RESOLUÇÃO DO TRAVAMENTO: Cálculo de valor absoluto de progresso
      const userCurrentAbsProgress = (towerUser.currentBuilding * 100) + towerUser.currentFloor;
      const nextAbsProgress = (nextBuilding * 100) + nextFloorNum;

      if (nextAbsProgress > userCurrentAbsProgress) {
          await prisma.userInfiniteTower.update({
             where: { id: towerUser.id },
             data: { 
                 currentBuilding: nextBuilding, 
                 currentFloor: nextFloorNum,
                 totalXp: { increment: xpGained }
             }
          });
      } else {
          // Apenas incrementa XP se estiver a repetir o andar
          await prisma.userInfiniteTower.update({
             where: { id: towerUser.id },
             data: { totalXp: { increment: xpGained } }
          });
      }

      // Sincronizar XP com a conta principal
      if (xpGained > 0) {
          await prisma.user.update({
              where: { id: userId },
              data: { xp: { increment: xpGained } }
          });
      }
    }

    return {
      isWin,
      score: currentScore,
      targetScore: floor.targetScore,
      stars,
      xpGained,
      nextUnlocked: isWin
    };
  } catch (error) {
    console.error('Erro em submitFloorResult:', error);
    throw error;
  }
};

export const getTowerMetadata = async () => {
    const buildings = [];
    for(let i = 1; i <= 100; i++) {
        const district = getDistrictForBuilding(i);
        buildings.push({
            id: i,
            questionsCount: calculateQuestionsForBuilding(i),
            districtName: district.name,
            theme: district.theme
        });
    }
    return { districts: DISTRICTS, totalBuildings: 100, buildingsMap: buildings };
};

export const getTop3ForBuilding = async (floorNumber) => {
    try {
        const topFloors = await prisma.towerFloor.findMany({
            where: {
                floorNumber: parseInt(floorNumber),
                isCompleted: true
            },
            orderBy: { highScore: 'desc' },
            take: 3,
            include: {
                tower: {
                    include: { user: { select: { name: true } } }
                }
            }
        });

        return topFloors.map((f, index) => ({
            position: index + 1,
            name: f.tower.user.name || "Jogador Anónimo",
            score: f.highScore
        }));
    } catch (error) {
        console.error('Erro em getTop3ForBuilding:', error);
        return [];
    }
};
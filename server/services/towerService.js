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
// Implementa exatamente a escala solicitada: do Prédio 1 (5q) até Prédio 90+ (120q)
function calculateQuestionsForBuilding(buildingNum) {
    if (buildingNum < 2) return 5;
    if (buildingNum < 3) return 6;
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
    return 180; // Prédio 100 = Simulado ENEM Completo
}

// --- MOTOR DE CÁLCULO DE DIFICULDADE (TRI ALVO) ---
function calculateTargetScoreForBuilding(buildingNum) {
    // Começa em ~400 e termina em ~950 (Elite lendária)
    const baseScore = 400;
    const maxScore = 950;
    const increment = (maxScore - baseScore) / 100;
    return Math.floor(baseScore + (buildingNum * increment));
}

// Função para identificar o distrito de um prédio
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

export const submitFloorResult = async (userId, floorId, score) => {
  try {
    const floor = await prisma.towerFloor.findUnique({ where: { id: floorId } });
    if (!floor) throw new Error('Andar não encontrado');

    const isWin = score >= floor.targetScore;
    let xpGained = 0;
    let stars = 0;

    if (isWin) {
      if (score >= floor.targetScore * 1.5) stars = 3;
      else if (score >= floor.targetScore * 1.2) stars = 2;
      else stars = 1;

      xpGained = Math.round(score * 0.1 * stars);

      await prisma.towerFloor.update({
        where: { id: floorId },
        data: {
          isCompleted: true,
          highScore: Math.max(score, floor.highScore || 0),
          stars: Math.max(stars, floor.stars || 0)
        }
      });

      // Lógica Infinita: Descobre qual é o próximo andar ou prédio
      const isLastFloorInBuilding = floor.floorNumber >= 5; // Mantemos 5 andares por prédio, mas as questões crescem
      let nextBuilding = floor.building;
      let nextFloorNum = floor.floorNumber + 1;

      if (isLastFloorInBuilding) {
        nextBuilding = floor.building + 1;
        nextFloorNum = 1;
      }

      // Verifica se o próximo andar já existe, se não, cria
      const nextFloorExists = await prisma.towerFloor.findFirst({
        where: { towerUserId: floor.towerUserId, building: nextBuilding, floorNumber: nextFloorNum }
      });

      if (!nextFloorExists) {
          // Calcula a dificuldade adaptativa do novo prédio baseado na escala lendária
          const newTargetScore = calculateTargetScoreForBuilding(nextBuilding);
          
          await prisma.towerFloor.create({
            data: {
              towerUserId: floor.towerUserId,
              building: nextBuilding,
              floorNumber: nextFloorNum,
              isLocked: false,
              targetScore: newTargetScore
            }
          });

          // Atualiza o progresso do usuário para refletir a nova conquista
          await prisma.userInfiniteTower.update({
             where: { id: floor.towerUserId },
             data: { 
                 currentBuilding: nextBuilding, 
                 currentFloor: nextFloorNum,
                 totalXp: { increment: xpGained }
             }
          });
      }

      // 🔥 CORREÇÃO DE XP: Envia o XP conquistado na Batalha para a conta principal do aluno
      if (xpGained > 0) {
          await prisma.user.update({
              where: { id: userId },
              data: { xp: { increment: xpGained } }
          });
      }
    }

    return {
      isWin,
      score,
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

// Nova rota utilitária: Retorna metadados arquiteturais sobre os 100 prédios
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
}

// --- FUNÇÃO RECUPERADA: RANKING TOP 3 DO CHEFÃO DO PRÉDIO ---
export const getTop3ForBuilding = async (floorNumber) => {
    try {
        // Encontra os 3 maiores scores na tabela TowerFloor para o andar/prédio específico
        const topFloors = await prisma.towerFloor.findMany({
            where: {
                floorNumber: parseInt(floorNumber),
                isCompleted: true
            },
            orderBy: {
                highScore: 'desc'
            },
            take: 3,
            include: {
                tower: {
                    include: {
                        user: {
                            select: { name: true }
                        }
                    }
                }
            }
        });

        // Mapeia os resultados para o formato que o frontend espera no Modal
        return topFloors.map((f, index) => ({
            position: index + 1,
            name: f.tower.user.name || "Jogador Anônimo",
            score: f.highScore
        }));

    } catch (error) {
        console.error('Erro em getTop3ForBuilding:', error);
        return [];
    }
};
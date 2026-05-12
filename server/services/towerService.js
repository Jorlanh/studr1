import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const DISTRICTS = [
    { name: "Distrito Inicial", startBldg: 1, endBldg: 9, theme: "bg-emerald-50" },
    { name: "Cidade Base", startBldg: 10, endBldg: 24, theme: "bg-blue-50" },
    { name: "Zona Intermediária", startBldg: 25, endBldg: 44, theme: "bg-indigo-50" },
    { name: "Cidade Elite", startBldg: 45, endBldg: 69, theme: "bg-purple-50" },
    { name: "Complexo Nacional", startBldg: 70, endBldg: 89, theme: "bg-slate-900 text-white" },
    { name: "Torre Suprema", startBldg: 90, endBldg: 99, theme: "bg-black text-yellow-500" },
    { name: "Torre dos 1000 Pontos", startBldg: 100, endBldg: 100, theme: "bg-gradient-to-r from-yellow-600 to-amber-900 text-white" }
];

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
    return 180;
}

function calculateScoreFromHits(hits, buildingNum) {
    const totalQuestions = calculateQuestionsForBuilding(buildingNum);
    if (totalQuestions <= 0) return 0;
    const score = Math.round((hits / totalQuestions) * 1000);
    return Math.min(Math.max(score, 0), 1000); 
}

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
      include: { floors: { orderBy: [{ building: 'asc' }, { floorNumber: 'asc' }] } }
    });

    if (!towerUser) {
      towerUser = await prisma.userInfiniteTower.create({
        data: {
          userId,
          currentBuilding: 1,
          currentFloor: 1,
          totalXp: 0,
          floors: { create: [{ building: 1, floorNumber: 1, isLocked: false, targetScore: 400 }] }
        },
        include: { floors: true }
      });
    }
    return towerUser;
  } catch (error) { throw error; }
};

export const submitFloorResult = async (userId, floorId, hits, overrideScore = null) => {
  try {
    const towerUser = await prisma.userInfiniteTower.findUnique({ where: { userId } });
    
    let floor = null;
    let bNum = null;
    let fNum = null;

    if (floorId.startsWith('mock-')) {
        const parts = floorId.split('-');
        bNum = parseInt(parts[1]);
        fNum = parseInt(parts[2]);
    } else {
        floor = await prisma.towerFloor.findUnique({ where: { id: floorId } });
        if (floor) {
            bNum = floor.building;
            fNum = floor.floorNumber;
        }
    }

    if (!floor && bNum && fNum) {
        floor = await prisma.towerFloor.findFirst({
            where: { towerUserId: towerUser.id, building: bNum, floorNumber: fNum }
        });
        
        if (!floor) {
            floor = await prisma.towerFloor.create({
                data: {
                    towerUserId: towerUser.id,
                    building: bNum,
                    floorNumber: fNum,
                    isLocked: false,
                    targetScore: calculateTargetScoreForBuilding(bNum)
                }
            });
        }
    }

    if (!floor) throw new Error('Falha crítica ao localizar ou gerar o andar.');

    const currentScore = overrideScore !== null && overrideScore !== undefined 
                         ? overrideScore 
                         : calculateScoreFromHits(hits, bNum);
                         
    let xpGained = 0;
    let stars = 0;

    // A meta do andar só serve para definir as estrelas individuais agora
    const isFloorTargetMet = currentScore >= floor.targetScore;
    
    if (isFloorTargetMet) {
      if (currentScore >= 900) stars = 3;
      else if (currentScore >= 700) stars = 2;
      else stars = 1;
    }

    // Dá XP de qualquer forma proporcional ao score
    xpGained = Math.round(currentScore * 0.1 * (stars > 0 ? stars : 1));

    await prisma.towerFloor.update({
      where: { id: floor.id },
      data: {
        isCompleted: true,
        highScore: Math.max(currentScore, floor.highScore || 0),
        stars: Math.max(stars, floor.stars || 0)
      }
    });

    // --- 🚨 REGRA DE PROGRESSÃO CONTÍNUA 🚨 ---
    // Passa de andar sempre, A NÃO SER que esteja no Andar 5 e a média do prédio falhe.
    let canProgress = true;
    const isBossFloor = fNum >= 5;

    if (isBossFloor) {
        const buildingFloors = await prisma.towerFloor.findMany({
            where: { towerUserId: towerUser.id, building: bNum, isCompleted: true }
        });
        
        // Substitui a nota antiga pela nova para não prejudicar o cálculo na mesma submissão
        let totalScoreInBuilding = currentScore; 
        let floorsCounted = 1;
        
        buildingFloors.forEach(bf => {
           if(bf.id !== floor.id) {
               totalScoreInBuilding += (bf.highScore || 0);
               floorsCounted++;
           }
        });
        
        // Garante a divisão correta pelos andares feitos
        const avgScore = Math.round(totalScoreInBuilding / Math.max(floorsCounted, 1));
        
        if (avgScore < floor.targetScore) {
            canProgress = false; // Média baixa = Bloqueia o próximo prédio
        }
    }

    if (canProgress) {
        let nextBuilding = bNum;
        let nextFloorNum = fNum + 1;

        if (isBossFloor) {
            nextBuilding = bNum + 1;
            nextFloorNum = 1;
        }

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

        const userCurrentAbsProgress = (towerUser.currentBuilding * 100) + towerUser.currentFloor;
        const nextAbsProgress = (nextBuilding * 100) + nextFloorNum;

        if (nextAbsProgress > userCurrentAbsProgress) {
            await prisma.userInfiniteTower.update({
                where: { id: towerUser.id },
                data: { currentBuilding: nextBuilding, currentFloor: nextFloorNum, totalXp: { increment: xpGained } }
            });
        } else {
            await prisma.userInfiniteTower.update({
                where: { id: towerUser.id },
                data: { totalXp: { increment: xpGained } }
            });
        }
    } else {
        await prisma.userInfiniteTower.update({
            where: { id: towerUser.id },
            data: { totalXp: { increment: xpGained } }
        });
    }

    if (xpGained > 0) {
        await prisma.user.update({
            where: { id: userId },
            data: { xp: { increment: xpGained } }
        });
    }

    return {
      isWin: canProgress,
      score: currentScore,
      targetScore: floor.targetScore,
      stars,
      xpGained,
      nextUnlocked: canProgress
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
            where: { floorNumber: parseInt(floorNumber), isCompleted: true },
            orderBy: { highScore: 'desc' },
            take: 3,
            include: { tower: { include: { user: { select: { name: true } } } } }
        });

        return topFloors.map((f, index) => ({
            position: index + 1,
            name: f.tower.user.name || "Jogador Anónimo",
            score: f.highScore
        }));
    } catch (error) { return []; }
};
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── 3PL Model (Modelo Logístico de 3 Parâmetros) ──────────────────────────
export function p3PL(theta, a, b, c) {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

// ─── Estimador de Máxima Verossimilhança (MLE) ─────────────────────────────
function logLikelihood(responses, theta) {
  let sum = 0;
  for (const r of responses) {
    // Parâmetros simulados baseados na dificuldade da questão
    const a = r.difficulty === 'HARD' ? 1.5 : (r.difficulty === 'MEDIUM' ? 1.0 : 0.5); // Discriminação
    const b = r.difficulty === 'HARD' ? 1.5 : (r.difficulty === 'MEDIUM' ? 0.0 : -1.5); // Dificuldade real
    const c = 0.2; // Taxa de acerto casual (chute - 20% no ENEM com 5 opções)
    
    const p = p3PL(theta, a, b, c);
    const eps = 1e-9;
    sum += r.correct ? Math.log(p + eps) : Math.log(1 - p + eps);
  }
  return sum;
}

function estimateTheta(responses) {
  let bestTheta = 0;
  let bestLL = -Infinity;

  // Busca grossa
  for (let theta = -3; theta <= 3; theta += 0.1) {
    const ll = logLikelihood(responses, theta);
    if (ll > bestLL) { bestLL = ll; bestTheta = theta; }
  }

  // Refinamento
  const min = Math.max(-3, bestTheta - 0.1);
  const max = Math.min(3,  bestTheta + 0.1);
  for (let theta = min; theta <= max; theta += 0.01) {
    const ll = logLikelihood(responses, theta);
    if (ll > bestLL) { bestLL = ll; bestTheta = theta; }
  }

  return bestTheta;
}

// ─── Conversão de Escala (Nota ENEM 0 a 1000) ─────────────────────────────────
export function thetaToScore(theta) {
  // O ENEM padroniza a proficiência com média ~500 e desvio padrão ~100
  const raw = 500 + (100 * theta);
  return Math.max(0, Math.min(1000, Math.round(raw)));
}

export function scoreToBand(score) {
  if (score < 400) return 'Insuficiente';
  if (score < 550) return 'Em desenvolvimento';
  if (score < 700) return 'Competitivo';
  if (score < 800) return 'Forte';
  if (score < 900) return 'Excelente';
  return 'Elite';
}

// ─── API Pública ──────────────────────────────────────────────────────────────
export async function calculateScore(responses) {
  if (!responses || responses.length === 0) {
    return { theta: null, score: 0, band: 'Insuficiente' };
  }

  // Agrupar respostas por área de conhecimento
  const responsesByArea = {
    HUMANAS: [],
    LINGUAGENS: [],
    NATUREZA: [],
    EXATAS: []
  };

  responses.forEach(r => {
    // Tratativa para caso o frontend mande o nome em vez do enum, ou não mande area
    const areaMap = {
      'Ciências Humanas': 'HUMANAS',
      'Linguagens': 'LINGUAGENS',
      'Ciências da Natureza': 'NATUREZA',
      'Exatas': 'EXATAS'
    };
    const mappedArea = areaMap[r.area] || r.area;
    
    if (responsesByArea[mappedArea]) {
      responsesByArea[mappedArea].push(r);
    }
  });

  const scoresByArea = {};
  let totalScoreSum = 0;
  let areasCount = 0;

  // Calcula a nota TRI para cada área separadamente
  for (const [area, areaResponses] of Object.entries(responsesByArea)) {
    if (areaResponses.length > 0) {
      const areaTheta = estimateTheta(areaResponses);
      const areaScore = thetaToScore(areaTheta);
      scoresByArea[area] = areaScore;
      totalScoreSum += areaScore;
      areasCount++;
    }
  }

  // A nota final do Simulado é a média aritmética das áreas que o aluno respondeu
  const finalScore = areasCount > 0 ? Math.round(totalScoreSum / areasCount) : 0;
  const overallTheta = estimateTheta(responses);

  return { 
    theta: overallTheta, 
    score: finalScore, 
    band: scoreToBand(finalScore),
    scoresByArea 
  };
}

// ─── Lógica Adicionada (Redação e Média Final) ──────────────────────────────
export async function calculateFinalGrade(responses, redacaoScore = 0) {
  const triResults = await calculateScore(responses); 
  
  // Se não houver nota de redação definida, usamos apenas a média das áreas.
  // Se houver, dividimos o total (Soma das Áreas + Redação) por (Número de áreas + 1)
  const areasTotal = Object.values(triResults.scoresByArea).reduce((a, b) => a + b, 0);
  const totalSum = areasTotal + redacaoScore;
  const divisor = Object.keys(triResults.scoresByArea).length + (redacaoScore > 0 ? 1 : 0);
  
  const finalAverage = divisor > 0 ? Math.round(totalSum / divisor) : 0;
  
  return {
    ...triResults,
    redacaoScore,
    finalAverage,
    band: scoreToBand(finalAverage)
  };
}
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── BLINDAGEM DE NORMALIZAÇÃO ─────────────────────────────────────────────

// Filtro Universal de Áreas (Pega qualquer variação de texto do Front/IA)
// Filtro Universal de Áreas (Mapeamento Completo ENEM)
function normalizeArea(rawArea) {
  if (!rawArea) return 'OUTROS';
  const upper = String(rawArea).toUpperCase();
  
  // 1. LINGUAGENS (Checado primeiro para isolar "Educação Física" e não cair em Natureza)
  if (
    upper.includes('LINGUAGEN') || 
    upper.includes('CÓDIGO') || upper.includes('CODIGO') ||
    upper.includes('PORTUGUÊS') || upper.includes('PORTUGUES') || 
    upper.includes('LITERATURA') || 
    upper.includes('INGLÊS') || upper.includes('INGLES') || 
    upper.includes('ESPANHOL') || 
    upper.includes('ARTE') || 
    upper.includes('EDUCAÇÃO FÍSICA') || upper.includes('EDUCACAO FISICA') ||
    upper.includes('EDUCAÇÃO') || upper.includes('EDUCACAO') ||
    upper.includes('TECNOLOGIA DA INFORMAÇÃO') || upper.includes('TECNOLOGIA DA INFORMACAO')
  ) return 'LINGUAGENS';

  // 2. EXATAS
  if (
    upper.includes('EXATA') || 
    upper.includes('MATEMÁTICA') || upper.includes('MATEMATICA')
  ) return 'EXATAS';

  // 3. NATUREZA
  if (
    upper.includes('NATUREZA') || 
    upper.includes('FÍSICA') || upper.includes('FISICA') || 
    upper.includes('QUÍMICA') || upper.includes('QUIMICA') || 
    upper.includes('BIOLOGIA')
  ) return 'NATUREZA';

  // 4. HUMANAS
  if (
    upper.includes('HUMANA') || 
    upper.includes('HISTÓRIA') || upper.includes('HISTORIA') || 
    upper.includes('GEOGRAFIA') || 
    upper.includes('FILOSOFIA') || 
    upper.includes('SOCIOLOGIA')
  ) return 'HUMANAS';

  return 'OUTROS';
}

// Filtro Universal de Dificuldade
function normalizeDifficulty(rawDiff) {
  if (!rawDiff) return 'MEDIUM';
  const upper = String(rawDiff).toUpperCase();
  
  if (upper.includes('HARD') || upper.includes('DIFÍ') || upper.includes('DIFI')) return 'HARD';
  if (upper.includes('EASY') || upper.includes('FÁCIL') || upper.includes('FACIL')) return 'EASY';
  
  return 'MEDIUM';
}

// ─── 3PL Model (Modelo Logístico de 3 Parâmetros) ──────────────────────────
export function p3PL(theta, a, b, c) {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

/**
 * Implementação do Modelo Logístico de 3 Parâmetros (3PL)
 * @param {number} theta - Proficiência do aluno
 * @param {number} a - Discriminação
 * @param {number} b - Dificuldade
 * @param {number} c - Acerto Casual (Chute)
 */
export const calculateProbability = (theta, a, b, c) => {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
};

export const computeFinalTRI = (hits) => {
  // Exemplo de calibração simplificada para o modelo
  // O sistema agora calcula a média ponderada baseada na dificuldade dos itens
  if (hits.length === 0) return { tri: 0, proficiency: "Insuficiente" };
  
  const totalScore = hits.reduce((acc, item) => acc + item.difficultyFactor, 0);
  const normalizedTRI = (totalScore / hits.length) * 1000; // Ajuste conforme escala INEP
  
  return {
    tri: Math.round(normalizedTRI),
    proficiency: normalizedTRI > 500 ? "Satisfatória" : "Insuficiente"
  };
};

// ─── Estimador de Máxima Verossimilhança (MLE) ─────────────────────────────
function logLikelihood(responses, theta) {
  let sum = 0;
  for (const r of responses) {
    // Agora a dificuldade é extraída em segurança
    const diff = normalizeDifficulty(r.difficulty);
    
    // Parâmetros simulados baseados na dificuldade da questão
    const a = diff === 'HARD' ? 1.5 : (diff === 'MEDIUM' ? 1.0 : 0.5); // Discriminação
    const b = diff === 'HARD' ? 1.5 : (diff === 'MEDIUM' ? 0.0 : -1.5); // Dificuldade real
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
    return { theta: null, score: 0, band: 'Insuficiente', scoresByArea: {} };
  }

  // Agrupar respostas por área de conhecimento usando gavetas fixas
  const responsesByArea = {
    HUMANAS: [],
    LINGUAGENS: [],
    NATUREZA: [],
    EXATAS: [],
    OUTROS: [] // Salva-vidas para evitar perda de dados
  };

  responses.forEach(r => {
    // Transforma "Exatas e Suas Tecnologias" diretamente na chave "EXATAS"
    const safeArea = normalizeArea(r.area);
    responsesByArea[safeArea].push(r);
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
      
      // Somamos apenas as áreas principais (para não diluir a nota com a gaveta OUTROS)
      if (area !== 'OUTROS') {
          totalScoreSum += areaScore;
          areasCount++;
      }
    }
  }

  // A nota final do Simulado é a média aritmética das áreas principais que o aluno respondeu
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
    
    // Filtra apenas áreas que possuem dados (evita dividir por algo não respondido)
    const validAreas = Object.keys(triResults.scoresByArea).filter(k => k !== 'OUTROS');
    
    // Soma apenas as áreas que existem
    const areasTotal = validAreas.reduce((sum, area) => sum + triResults.scoresByArea[area], 0);
    
    // Divisor dinâmico: áreas respondidas + (1 se houver redação)
    const areasCount = validAreas.length;
    const hasRedacao = redacaoScore > 0;
    const divisor = areasCount + (hasRedacao ? 1 : 0);
    
    // Cálculo da média final
    const finalAverage = divisor > 0 ? Math.round((areasTotal + redacaoScore) / divisor) : 0;
    
    return {
        theta: triResults.theta,
        score: finalAverage, // Agora a média reflete a realidade das áreas respondidas
        band: scoreToBand(finalAverage),
        scoresByArea: triResults.scoresByArea,
        redacaoScore: redacaoScore
    };
}
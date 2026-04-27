import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Calibration cache (10 min TTL) ──────────────────────────────────────────
let _cal = null;
let _calAt = 0;

async function getCalibrations() {
  if (_cal && Date.now() - _calAt < 10 * 60 * 1000) return _cal;
  const rows = await prisma.questionCalibration.findMany();
  _cal = Object.fromEntries(rows.map(r => [r.difficulty, r]));
  _calAt = Date.now();
  return _cal;
}

// ─── 3PL Model ───────────────────────────────────────────────────────────────

/**
 * Probabilidade de acerto no modelo 3PL (Three-Parameter Logistic).
 * @param {number} theta  - Habilidade do candidato
 * @param {number} a      - Parâmetro de discriminação
 * @param {number} b      - Parâmetro de dificuldade
 * @param {number} c      - Parâmetro de pseudo-acerto (chute)
 */
export function p3PL(theta, a, b, c) {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

// ─── MLE Estimator ───────────────────────────────────────────────────────────

function logLikelihood(responses, theta, cal) {
  let sum = 0;
  for (const r of responses) {
    const params = cal[r.difficulty];
    if (!params) continue;
    const p = p3PL(theta, params.a, params.b, params.c);
    const eps = 1e-9;
    sum += r.correct ? Math.log(p + eps) : Math.log(1 - p + eps);
  }
  return sum;
}

/**
 * Estima θ por grid search em duas passagens:
 *  1. Grid grosso de -3 a +3 com passo 0.1
 *  2. Refinamento de ±0.1 em torno do melhor ponto com passo 0.01
 */
function estimateTheta(responses, cal) {
  let bestTheta = 0;
  let bestLL = -Infinity;

  for (let theta = -3; theta <= 3; theta += 0.1) {
    const ll = logLikelihood(responses, theta, cal);
    if (ll > bestLL) { bestLL = ll; bestTheta = theta; }
  }

  const min = Math.max(-3, bestTheta - 0.1);
  const max = Math.min(3,  bestTheta + 0.1);
  for (let theta = min; theta <= max; theta += 0.01) {
    const ll = logLikelihood(responses, theta, cal);
    if (ll > bestLL) { bestLL = ll; bestTheta = theta; }
  }

  return bestTheta;
}

// ─── Scale conversion ─────────────────────────────────────────────────────────

/**
 * Converte θ para a escala ENEM (300–900).
 * Fórmula linear: 500 + 100 * θ, clampada nos extremos.
 */
export function thetaToScore(theta) {
  const raw = 500 + 100 * theta;
  return Math.max(300, Math.min(900, Math.round(raw)));
}

export function scoreToBand(score) {
  if (score < 400) return 'Insuficiente';
  if (score < 550) return 'Em desenvolvimento';
  if (score < 700) return 'Competitivo';
  if (score < 800) return 'Forte';
  if (score < 900) return 'Excelente';
  return 'Elite';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Calcula nota TRI pelo modelo 3PL via MLE numérico.
 *
 * @param {Array<{ difficulty: 'EASY'|'MEDIUM'|'HARD', correct: boolean }>} responses
 * @returns {Promise<{ theta: number, score: number, band: string }>}
 */
export async function calculateScore(responses) {
  if (!responses || responses.length === 0) {
    return { theta: null, score: 300, band: 'Insuficiente' };
  }

  const cal = await getCalibrations();

  if (Object.keys(cal).length === 0) {
    console.warn('[scoringService] Nenhuma calibração encontrada no banco. Execute o seed.');
    // Fallback: heurística simples para não travar a produção
    const correct = responses.filter(r => r.correct).length;
    const pct = correct / responses.length;
    const score = Math.round(300 + 600 * Math.pow(pct, 0.9));
    return { theta: null, score: Math.max(300, Math.min(900, score)), band: scoreToBand(score) };
  }

  const theta = estimateTheta(responses, cal);
  const score = thetaToScore(theta);
  return { theta, score, band: scoreToBand(score) };
}

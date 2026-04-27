/**
 * scoringService.test.js
 * ----------------------
 * Unit tests for the 3PL TRI scoring engine.
 * Prisma is mocked via server/test/setup.js — no real DB calls.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { p3PL, thetaToScore, scoreToBand, calculateScore } from './scoringService.js';
import { CALIBRATIONS } from '../test/setup.js';

// ─── Pull the mocked prisma out for per-test configuration ────────────────────
const { _mock: prismaMock } = await import('@prisma/client');

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.questionCalibration.findMany.mockResolvedValue(Object.values(CALIBRATIONS));
});

// ─── p3PL ─────────────────────────────────────────────────────────────────────

describe('p3PL', () => {
  it('retorna c quando θ é muito menor que b', () => {
    // θ = -10, muito abaixo do parâmetro b, probabilidade cai ao nível de chute
    expect(p3PL(-10, 1.0, 0, 0.20)).toBeCloseTo(0.20, 2);
  });

  it('retorna próximo de 1 quando θ é muito maior que b', () => {
    expect(p3PL(10, 1.0, 0, 0.20)).toBeGreaterThan(0.99);
  });

  it('ponto b (dificuldade) dá probabilidade (1+c)/2', () => {
    // P(θ=b) = c + (1-c)/2 = (1+c)/2
    const c = 0.25;
    const b = 0.5;
    expect(p3PL(b, 1.2, b, c)).toBeCloseTo((1 + c) / 2, 4);
  });

  it('c=0 comporta como modelo 2PL', () => {
    const theta = 1.0;
    const expected = 1 / (1 + Math.exp(-1.0 * (theta - 0)));
    expect(p3PL(theta, 1.0, 0, 0)).toBeCloseTo(expected, 5);
  });

  it('probabilidade está sempre em [c, 1]', () => {
    const c = 0.2;
    for (const theta of [-5, -2, 0, 2, 5]) {
      const p = p3PL(theta, 1.0, 0, c);
      expect(p).toBeGreaterThanOrEqual(c);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

// ─── thetaToScore ─────────────────────────────────────────────────────────────

describe('thetaToScore', () => {
  it('θ=0 → 500 (ponto médio da escala)', () => {
    expect(thetaToScore(0)).toBe(500);
  });

  it('θ=-2 → 300 (mínimo, clampado)', () => {
    expect(thetaToScore(-2)).toBe(300);
  });

  it('θ=2 → 700', () => {
    expect(thetaToScore(2)).toBe(700);
  });

  it('θ=4 → 900 (máximo, clampado)', () => {
    expect(thetaToScore(4)).toBe(900);
  });

  it('θ=-10 clampado a 300', () => {
    expect(thetaToScore(-10)).toBe(300);
  });

  it('θ=10 clampado a 900', () => {
    expect(thetaToScore(10)).toBe(900);
  });
});

// ─── scoreToBand ──────────────────────────────────────────────────────────────

describe('scoreToBand', () => {
  it.each([
    [300, 'Insuficiente'],
    [399, 'Insuficiente'],
    [400, 'Em desenvolvimento'],
    [549, 'Em desenvolvimento'],
    [550, 'Competitivo'],
    [699, 'Competitivo'],
    [700, 'Forte'],
    [799, 'Forte'],
    [800, 'Excelente'],
    [899, 'Excelente'],
    [900, 'Elite'],
  ])('score %i → faixa "%s"', (score, expected) => {
    expect(scoreToBand(score)).toBe(expected);
  });
});

// ─── calculateScore ───────────────────────────────────────────────────────────

describe('calculateScore', () => {
  it('array vazio retorna nota mínima (300)', async () => {
    const { score, band } = await calculateScore([]);
    expect(score).toBe(300);
    expect(band).toBe('Insuficiente');
  });

  it('null/undefined retorna nota mínima', async () => {
    const { score } = await calculateScore(null);
    expect(score).toBe(300);
  });

  it('ignora questões com difficulty desconhecida, não quebra', async () => {
    const { score } = await calculateScore([
      { difficulty: 'UNKNOWN', correct: true },
      { difficulty: 'MEDIUM',  correct: true },
    ]);
    expect(score).toBeGreaterThan(300);
  });

  it('acertar tudo (HARD) dá nota alta (>= 700)', async () => {
    const responses = Array(45).fill({ difficulty: 'HARD', correct: true });
    const { score } = await calculateScore(responses);
    expect(score).toBeGreaterThanOrEqual(700);
  });

  it('errar tudo (EASY) dá nota baixa (<=500)', async () => {
    const responses = Array(45).fill({ difficulty: 'EASY', correct: false });
    const { score } = await calculateScore(responses);
    expect(score).toBeLessThanOrEqual(500);
  });

  it('nota é determinística para o mesmo input', async () => {
    const responses = Array(45).fill({ difficulty: 'MEDIUM', correct: true });
    const [a, b, c] = await Promise.all([
      calculateScore(responses),
      calculateScore(responses),
      calculateScore(responses),
    ]);
    expect(a.score).toBe(b.score);
    expect(b.score).toBe(c.score);
  });

  it('fallback heurístico quando calibrações não existem', async () => {
    prismaMock.questionCalibration.findMany.mockResolvedValueOnce([]);
    const responses = Array(45).fill({ difficulty: 'MEDIUM', correct: true });
    const { score } = await calculateScore(responses);
    // Fallback usa porcentagem bruta; não deve quebrar e deve ser >= 300
    expect(score).toBeGreaterThanOrEqual(300);
    expect(score).toBeLessThanOrEqual(900);
  });

  it('theta retornado para acertar tudo (MEDIUM) é maior que 0', async () => {
    const responses = Array(45).fill({ difficulty: 'MEDIUM', correct: true });
    const { theta } = await calculateScore(responses);
    expect(theta).toBeGreaterThan(0);
  });

  it('theta retornado para errar tudo (MEDIUM) é menor que 0', async () => {
    const responses = Array(45).fill({ difficulty: 'MEDIUM', correct: false });
    const { theta } = await calculateScore(responses);
    expect(theta).toBeLessThan(0);
  });
});

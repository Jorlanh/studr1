/**
 * scoringService.test.js
 * ----------------------
 * Unit tests for the 3PL TRI scoring engine.
 * O motor matemático agora é puro e autossuficiente (sem necessidade de mock do Prisma).
 */

import { describe, it, expect } from 'vitest';
import { p3PL, thetaToScore, scoreToBand, calculateScore } from './scoringService.js';

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

  it('θ=-2 → 300 (calculado: 500 - 200)', () => {
    expect(thetaToScore(-2)).toBe(300);
  });

  it('θ=2 → 700 (calculado: 500 + 200)', () => {
    expect(thetaToScore(2)).toBe(700);
  });

  it('θ=-10 clampado a 0 (novo padrão do sistema)', () => {
    expect(thetaToScore(-10)).toBe(0);
  });

  it('θ=10 clampado a 1000 (novo padrão do sistema)', () => {
    expect(thetaToScore(10)).toBe(1000);
  });
});

// ─── scoreToBand ──────────────────────────────────────────────────────────────

describe('scoreToBand', () => {
  it.each([
    [0, 'Insuficiente'],
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
    [1000, 'Elite'],
  ])('score %i → faixa "%s"', (score, expected) => {
    expect(scoreToBand(score)).toBe(expected);
  });
});

// ─── calculateScore ───────────────────────────────────────────────────────────

describe('calculateScore', () => {
  it('array vazio retorna nota mínima da nova arquitetura (0)', async () => {
    const { score, band } = await calculateScore([]);
    expect(score).toBe(0);
    expect(band).toBe('Insuficiente');
  });

  it('null/undefined retorna nota mínima (0)', async () => {
    const { score } = await calculateScore(null);
    expect(score).toBe(0);
  });

  it('ignora questões com difficulty desconhecida, trata como MEDIUM e não quebra', async () => {
    // Adicionamos 'area: EXATAS' para garantir que não cai no air-bag 'OUTROS'
    const { score } = await calculateScore([
      { difficulty: 'UNKNOWN', correct: true, area: 'EXATAS' },
      { difficulty: 'MEDIUM',  correct: true, area: 'EXATAS' },
    ]);
    expect(score).toBeGreaterThan(0);
  });

  it('acertar tudo (HARD) dá nota alta (>= 700)', async () => {
    const responses = Array(45).fill({ difficulty: 'HARD', correct: true, area: 'EXATAS' });
    const { score } = await calculateScore(responses);
    expect(score).toBeGreaterThanOrEqual(700);
  });

  it('errar tudo (EASY) dá nota baixa (<=500)', async () => {
    const responses = Array(45).fill({ difficulty: 'EASY', correct: false, area: 'NATUREZA' });
    const { score } = await calculateScore(responses);
    expect(score).toBeLessThanOrEqual(500);
  });

  it('nota é determinística para o mesmo input', async () => {
    const responses = Array(45).fill({ difficulty: 'MEDIUM', correct: true, area: 'HUMANAS' });
    const [a, b, c] = await Promise.all([
      calculateScore(responses),
      calculateScore(responses),
      calculateScore(responses),
    ]);
    expect(a.score).toBe(b.score);
    expect(b.score).toBe(c.score);
  });

  it('theta retornado para acertar tudo (MEDIUM) é maior que 0', async () => {
    const responses = Array(45).fill({ difficulty: 'MEDIUM', correct: true, area: 'LINGUAGENS' });
    const { theta } = await calculateScore(responses);
    expect(theta).toBeGreaterThan(0);
  });

  it('theta retornado para errar tudo (MEDIUM) é menor que 0', async () => {
    const responses = Array(45).fill({ difficulty: 'MEDIUM', correct: false, area: 'EXATAS' });
    const { theta } = await calculateScore(responses);
    expect(theta).toBeLessThan(0);
  });
});
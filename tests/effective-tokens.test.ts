import { describe, expect, it } from 'vitest'

import {
  REFERENCE_RATE,
  effectiveTokensFromCost,
  effectiveTokensFromUsage,
  effectiveTokens,
  type EffectiveTokenUsage,
} from '../src/effective-tokens.js'

describe('effectiveTokensFromCost', () => {
  it('re-expresses cost as cost / REFERENCE_RATE', () => {
    expect(effectiveTokensFromCost(3e-6)).toBeCloseTo(1)
    expect(effectiveTokensFromCost(3)).toBeCloseTo(1_000_000)
    expect(effectiveTokensFromCost(REFERENCE_RATE * 42)).toBeCloseTo(42)
  })

  it('clamps zero, negative, and non-finite cost to 0', () => {
    expect(effectiveTokensFromCost(0)).toBe(0)
    expect(effectiveTokensFromCost(-5)).toBe(0)
    expect(effectiveTokensFromCost(NaN)).toBe(0)
    expect(effectiveTokensFromCost(Infinity)).toBe(0)
  })
})

describe('effectiveTokensFromUsage (unpriced-model fallback)', () => {
  const usage = (over: Partial<EffectiveTokenUsage> = {}): EffectiveTokenUsage => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    ...over,
  })

  it('weights each token type by its burden (in 1, out 5, cacheWrite 1.25, cacheRead 0.1)', () => {
    expect(effectiveTokensFromUsage(usage({ inputTokens: 100 }))).toBe(100)
    expect(effectiveTokensFromUsage(usage({ outputTokens: 100 }))).toBe(500)
    expect(effectiveTokensFromUsage(usage({ cacheCreationInputTokens: 100 }))).toBe(125)
    expect(effectiveTokensFromUsage(usage({ cacheReadInputTokens: 100 }))).toBe(10)
    expect(
      effectiveTokensFromUsage(usage({ inputTokens: 10, outputTokens: 10, cacheCreationInputTokens: 10, cacheReadInputTokens: 10 })),
    ).toBeCloseTo(10 + 50 + 12.5 + 1)
  })

  it('clamps non-finite / negative token counts to 0', () => {
    expect(effectiveTokensFromUsage(usage({ inputTokens: -100, outputTokens: NaN, cacheReadInputTokens: 100 }))).toBe(10)
  })

  it('matches cost ÷ REFERENCE_RATE under standard Claude-ish rates', () => {
    // The fallback weights are calibrated so the two paths land on one scale:
    // cost = in·3e-6 + out·15e-6 + cacheWrite·3.75e-6 + cacheRead·0.3e-6
    const u = usage({ inputTokens: 1000, outputTokens: 500, cacheCreationInputTokens: 200, cacheReadInputTokens: 90000 })
    const cost = 1000 * 3e-6 + 500 * 15e-6 + 200 * 3.75e-6 + 90000 * 0.3e-6
    expect(effectiveTokensFromUsage(u)).toBeCloseTo(effectiveTokensFromCost(cost), 5)
  })
})

describe('effectiveTokens (cost-first, usage fallback)', () => {
  it('uses the cost-derived value when the model is priced', () => {
    const u: EffectiveTokenUsage = { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 1, cacheReadInputTokens: 1 }
    expect(effectiveTokens(3, u)).toBeCloseTo(1_000_000)
  })

  it('falls back to token weighting when cost is 0 (unpriced model) so the row does not vanish', () => {
    const u: EffectiveTokenUsage = { inputTokens: 1000, outputTokens: 200, cacheCreationInputTokens: 0, cacheReadInputTokens: 50000 }
    const result = effectiveTokens(0, u)
    expect(result).toBeGreaterThan(0)
    expect(result).toBe(effectiveTokensFromUsage(u))
  })

  it('returns 0 when cost is 0 and no usage is available', () => {
    expect(effectiveTokens(0)).toBe(0)
  })
})

describe('ranking invariance', () => {
  const costs = [0.0001, 12.5, 3.2, 0.0, 7.7, 0.45, 100, 0.0001]

  it('ranks rows in the same order as cost (effective tokens is a monotonic transform)', () => {
    const byCost = [...costs].map((c, i) => ({ i, c })).sort((a, b) => b.c - a.c).map(x => x.i)
    const byEff = [...costs].map((c, i) => ({ i, e: effectiveTokensFromCost(c) })).sort((a, b) => b.e - a.e).map(x => x.i)
    expect(byEff).toEqual(byCost)
  })

  it('order is independent of the chosen reference rate', () => {
    // Dividing every value by the same positive constant cannot change the order,
    // so REFERENCE_RATE only sets magnitude, never ranking.
    const order = (rate: number) =>
      [...costs].map((c, i) => ({ i, e: c > 0 ? c / rate : 0 })).sort((a, b) => b.e - a.e).map(x => x.i)
    expect(order(3e-6)).toEqual(order(1e-5))
    expect(order(3e-6)).toEqual(order(0.5))
  })
})

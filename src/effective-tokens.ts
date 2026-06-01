import type { TokenUsage } from './types.js'

// Display unit for magnitudes across the dashboard / JSON / export. Default is
// 'tokens' (token-first); `--cost` selects 'cost' to restore the dollar view.
export type Unit = 'tokens' | 'cost'

// "Effective tokens" — a single magnitude that ranks usage the way cost does, but
// expressed in token units instead of dollars. The dashboard defaults to this so
// the tool reads as "where am I burning tokens / where's the waste?" rather than
// cost-policing, while `--cost` flips everything back to USD.
//
// Definition: effectiveTokens = costUSD / REFERENCE_RATE. Because every row is
// divided by the same constant, the ranking is *identical* to today's cost
// ranking — REFERENCE_RATE only sets the absolute magnitude, never the order.
//
// REFERENCE_RATE is a mid input rate (~$3 / 1M tokens). It is deliberately chosen
// so the fallback weighting below (used for models missing from the pricing
// snapshot) lands on the same scale as the cost-derived value: under standard
// Claude-ish rates, cost / 3e-6 ≈ in·1 + out·5 + cacheWrite·1.25 + cacheRead·0.1.
export const REFERENCE_RATE = 3e-6

// Fallback weights, applied only when a model has no pricing data (costUSD == 0).
// Cache reads are ~10× cheaper than fresh input and ~50× cheaper than output, so
// raw token sums would let cheap cache volume dominate the ranking. These weights
// mirror the burden each token type carries in calculateCost().
const FALLBACK_INPUT_WEIGHT = 1
const FALLBACK_OUTPUT_WEIGHT = 5
const FALLBACK_CACHE_WRITE_WEIGHT = 1.25
const FALLBACK_CACHE_READ_WEIGHT = 0.1

// Clamp non-finite / negative inputs to 0, matching calculateCost() (models.ts)
// and formatTokens() (format.ts): corrupt JSONL can emit NaN or negative counts.
const safe = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0)

export function effectiveTokensFromCost(costUSD: number): number {
  if (!Number.isFinite(costUSD) || costUSD <= 0) return 0
  return costUSD / REFERENCE_RATE
}

// Subset of TokenUsage the fallback needs. Accepting a structural type keeps this
// usable from any aggregate that carries the four token fields.
export type EffectiveTokenUsage = Pick<
  TokenUsage,
  'inputTokens' | 'outputTokens' | 'cacheCreationInputTokens' | 'cacheReadInputTokens'
>

export function effectiveTokensFromUsage(u: EffectiveTokenUsage): number {
  return (
    safe(u.inputTokens) * FALLBACK_INPUT_WEIGHT +
    safe(u.outputTokens) * FALLBACK_OUTPUT_WEIGHT +
    safe(u.cacheCreationInputTokens) * FALLBACK_CACHE_WRITE_WEIGHT +
    safe(u.cacheReadInputTokens) * FALLBACK_CACHE_READ_WEIGHT
  )
}

// Primary entry point. Use the cost-derived value when the model is priced;
// otherwise fall back to token weighting so an unpriced model still produces a
// non-zero magnitude (it doesn't vanish from the ranking). Aggregates that don't
// carry token breakdowns (e.g. category/skill totals) simply omit `usage` and get
// cost-derived effective tokens.
export function effectiveTokens(costUSD: number, usage?: EffectiveTokenUsage): number {
  if (costUSD > 0) return effectiveTokensFromCost(costUSD)
  return usage ? effectiveTokensFromUsage(usage) : 0
}

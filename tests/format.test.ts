import { describe, expect, it } from 'vitest'
import stripAnsi from 'strip-ansi'

import { renderStatusBar } from '../src/format.js'
import type { ParsedApiCall, ProjectSummary, SessionSummary, TokenUsage } from '../src/types.js'

const EMPTY_CATEGORY_BREAKDOWN = {
  coding: { turns: 0, costUSD: 0, retries: 0, editTurns: 0, oneShotTurns: 0 },
  debugging: { turns: 0, costUSD: 0, retries: 0, editTurns: 0, oneShotTurns: 0 },
  feature: { turns: 0, costUSD: 0, retries: 0, editTurns: 0, oneShotTurns: 0 },
  refactoring: { turns: 0, costUSD: 0, retries: 0, editTurns: 0, oneShotTurns: 0 },
  testing: { turns: 0, costUSD: 0, retries: 0, editTurns: 0, oneShotTurns: 0 },
  exploration: { turns: 0, costUSD: 0, retries: 0, editTurns: 0, oneShotTurns: 0 },
  planning: { turns: 0, costUSD: 0, retries: 0, editTurns: 0, oneShotTurns: 0 },
  delegation: { turns: 0, costUSD: 0, retries: 0, editTurns: 0, oneShotTurns: 0 },
  git: { turns: 0, costUSD: 0, retries: 0, editTurns: 0, oneShotTurns: 0 },
  'build/deploy': { turns: 0, costUSD: 0, retries: 0, editTurns: 0, oneShotTurns: 0 },
  conversation: { turns: 0, costUSD: 0, retries: 0, editTurns: 0, oneShotTurns: 0 },
  brainstorming: { turns: 0, costUSD: 0, retries: 0, editTurns: 0, oneShotTurns: 0 },
  general: { turns: 0, costUSD: 0, retries: 0, editTurns: 0, oneShotTurns: 0 },
} satisfies SessionSummary['categoryBreakdown']

function usage(over: Partial<TokenUsage> = {}): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    webSearchRequests: 0,
    ...over,
  }
}

function makeCall(costUSD: number, u: TokenUsage, timestamp: string): ParsedApiCall {
  return {
    provider: 'local', model: 'unpriced-local', usage: u, costUSD,
    tools: [], mcpTools: [], skills: [], subagentTypes: [],
    hasAgentSpawn: false, hasPlanMode: false, speed: 'standard',
    timestamp, bashCommands: [], deduplicationKey: `${timestamp}-${costUSD}`,
  }
}

function makeProjectWithCall(call: ParsedApiCall, timestamp: string): ProjectSummary {
  const session: SessionSummary = {
    sessionId: 's1', project: 'p', firstTimestamp: timestamp, lastTimestamp: timestamp,
    totalCostUSD: call.costUSD, totalInputTokens: call.usage.inputTokens,
    totalOutputTokens: call.usage.outputTokens, totalCacheReadTokens: call.usage.cacheReadInputTokens,
    totalCacheWriteTokens: call.usage.cacheCreationInputTokens, apiCalls: 1,
    turns: [{ userMessage: '', assistantCalls: [call], timestamp, sessionId: 's1', category: 'general', retries: 0, hasEdits: false }],
    modelBreakdown: {}, toolBreakdown: {}, mcpBreakdown: {}, bashBreakdown: {},
    categoryBreakdown: { ...EMPTY_CATEGORY_BREAKDOWN }, skillBreakdown: {}, subagentBreakdown: {},
  }
  return { project: 'p', projectPath: 'p', sessions: [session], totalCostUSD: call.costUSD, totalApiCalls: 1 }
}

describe('renderStatusBar', () => {
  const now = new Date().toISOString()

  it('token mode shows a non-zero magnitude for an unpriced model via the usage fallback', () => {
    // costUSD 0 (model missing from pricing) but real token usage: deriving from
    // cost alone would print "0 tok"; the per-call usage fallback keeps it real.
    const call = makeCall(0, usage({ inputTokens: 100_000, outputTokens: 20_000 }), now)
    const out = stripAnsi(renderStatusBar([makeProjectWithCall(call, now)], 'tokens'))
    expect(out).toMatch(/Today\s+\S+ tok/)
    expect(out).not.toMatch(/Today\s+0 tok/)
  })

  it('cost mode still shows $0.00 for an unpriced model', () => {
    const call = makeCall(0, usage({ inputTokens: 100_000, outputTokens: 20_000 }), now)
    const out = stripAnsi(renderStatusBar([makeProjectWithCall(call, now)], 'cost'))
    expect(out).toMatch(/Today\s+\$0/)
  })
})

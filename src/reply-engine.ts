/** LLM-backed reply drafting + gate decision. @module @rellopn/dsh-p2p-lan */

import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { appendDiagLog } from './diag-log.ts'
import type { ReplyEngine } from './agent.ts'
import type { Sensitivity } from './config.ts'
import type { Envelope } from './messages.ts'

/** How long one draft may take before degrading to the human gate (LLM gateway stalls must not hang inbound routing). */
export const DRAFT_TIMEOUT_MS = 30_000

export interface LlmReplyEngineOptions {
  provider: string
  model: string
  sensitivity: Sensitivity
  persona: string
  /** This node's own name, injected into the draft prompt so replies can be factual. */
  nodeName: string
  /** This node's own project names, injected so "what projects do you have" is answered truthfully. */
  projects: string[]
}

/** A reply engine whose LLM route + gate bias can be updated live (no restart). */
export interface MutableReplyEngine extends ReplyEngine {
  updateOptions(next: Partial<LlmReplyEngineOptions>): void
}

function sensitivityClause(sensitivity: Sensitivity): string {
  switch (sensitivity) {
    case 'lenient':
      return 'Require human review only for clearly irreversible or destructive actions; when in doubt, auto-reply.'
    case 'strict':
      return 'Always require human review before sending.'
    case 'standard':
      return 'Require human review for formal contracts, risky actions, or decisions needing sign-off.'
  }
}

function systemPrompt(persona: string, sensitivity: Sensitivity, nodeName: string, projects: string[]): string {
  const identity = persona.length > 0 ? `Your role: ${persona}.` : 'You are a helpful colleague.'
  const projectFacts = projects.length > 0
    ? `Your node is named "${nodeName}" and currently offers these projects (real, never invent others): ${projects.join(', ')}.`
    : `Your node is named "${nodeName}" and currently offers no projects.`
  return [
    identity,
    'Draft a plain-text reply to the incoming message from another colleague on the LAN.',
    projectFacts,
    'Answer factually from the facts above; if the incoming message asks for information you do not have, say so instead of inventing.',
    'Decide whether the reply needs human review before it is sent.',
    sensitivityClause(sensitivity),
    'Reply with a single JSON object: {"needsGate": boolean, "body": string}.',
    'Output only the JSON object — no Markdown fences, no commentary.',
  ].join('\n')
}

function frame(envelope: Envelope): string {
  return `From ${envelope.from.name}:\n${envelope.body}`
}

function parseDraft(text: string): { needsGate: boolean; body: string } {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const parsed = JSON.parse(stripped) as { needsGate?: unknown; body?: unknown }
  if (typeof parsed.needsGate === 'boolean' && typeof parsed.body === 'string') {
    return { needsGate: parsed.needsGate, body: parsed.body }
  }
  throw new Error('draft output must be {"needsGate": boolean, "body": string}')
}

/** Build the LLM-backed reply engine. Any failure degrades to the human gate. */
export function createLlmReplyEngine(ctx: Context, options: LlmReplyEngineOptions): MutableReplyEngine {
  // Live-mutable options: the settings panel can change the route/gate bias
  // without rebuilding the node; each draft reads the current snapshot.
  let current: LlmReplyEngineOptions = { ...options }
  return {
    async draftReply(envelope) {
      const { provider, model, sensitivity, persona, nodeName, projects } = current
      const started = Date.now()
      appendDiagLog('info', `draft ${envelope.id}: start provider=${provider || '(none)'} model=${model || '(none)'} sensitivity=${sensitivity}`)
      if (sensitivity === 'strict' || provider === '' || model === '') {
        appendDiagLog('warn', `draft ${envelope.id}: gate (strict / empty route)`)
        return { needsGate: true, body: '' }
      }
      const system = systemPrompt(persona, sensitivity, nodeName, projects)
      try {
        // Collect the stream with a hard timeout: a stalled LLM gateway must
        // degrade to the human gate instead of hanging inbound routing forever
        // (which previously left messages inbox-only with no approval UI).
        const assembler = await withTimeout(async () => {
          const user = createUserMessage({
            content: [{ type: 'text', text: frame(envelope) }],
            source: { kind: 'plugin', plugin: 'dsh-p2p-lan' },
          })
          const collect = new BlockAssembler()
          for await (const chunk of ctx.llm.stream({
            provider,
            model,
            messages: [user],
            system,
            maxTokens: 1024,
            // Drafting is a small JSON decision ({"needsGate", "body"}); disable
            // thinking so a reasoning model does not spend the whole token budget
            // on chain-of-thought and end with an empty content block (the adapter
            // reports that as EMPTY_RESPONSE -> gate, not auto-reply).
            reasoningEffort: ReasoningEffortId('off'),
          })) {
            collect.push(chunk)
          }
          return collect
        }, DRAFT_TIMEOUT_MS)
        if (assembler.finish.kind !== 'stop') {
          appendDiagLog('warn', `draft ${envelope.id}: finish=${assembler.finish.kind} -> gate`)
          return { needsGate: true, body: '' }
        }
        const blocks = assembler.blocks()
        const text = blocks
          .filter((block): block is Extract<(typeof blocks)[number], { type: 'text' }> => block.type === 'text')
          .map(block => block.text)
          .join('')
        const draft = parseDraft(text)
        appendDiagLog('info', `draft ${envelope.id}: done in ${Date.now() - started}ms needsGate=${draft.needsGate} bodyLen=${draft.body.length}`)
        return draft
      } catch (error) {
        appendDiagLog('error', `draft ${envelope.id}: FAILED after ${Date.now() - started}ms (${error instanceof Error ? error.message : String(error)}) -> gate`)
        return { needsGate: true, body: '' }
      }
    },
    updateOptions(next) {
      current = { ...current, ...next }
    },
  }
}

/** Race a promise against a timeout; rejects when the deadline passes. */
function withTimeout<T>(run: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`draft timeout after ${ms}ms`)), ms)
    run().then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

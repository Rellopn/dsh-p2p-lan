/** LLM-backed reply drafting + gate decision. @module @rellopn/dsh-p2p-lan */

import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ReplyEngine } from './agent.ts'
import type { Sensitivity } from './config.ts'
import type { Envelope } from './messages.ts'

export interface LlmReplyEngineOptions {
  provider: string
  model: string
  sensitivity: Sensitivity
  persona: string
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

function systemPrompt(persona: string, sensitivity: Sensitivity): string {
  const identity = persona.length > 0 ? `Your role: ${persona}.` : 'You are a helpful colleague.'
  return [
    identity,
    'Draft a plain-text reply to the incoming message from another colleague on the LAN.',
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
export function createLlmReplyEngine(ctx: Context, options: LlmReplyEngineOptions): ReplyEngine {
  const system = systemPrompt(options.persona, options.sensitivity)
  return {
    async draftReply(envelope) {
      if (options.sensitivity === 'strict' || options.provider === '' || options.model === '') {
        return { needsGate: true, body: '' }
      }
      try {
        const user = createUserMessage({
          content: [{ type: 'text', text: frame(envelope) }],
          source: { kind: 'plugin', plugin: 'dsh-p2p-lan' },
        })
        const assembler = new BlockAssembler()
        for await (const chunk of ctx.llm.stream({
          provider: options.provider,
          model: options.model,
          messages: [user],
          system,
          maxTokens: 1024,
        })) {
          assembler.push(chunk)
        }
        if (assembler.finish.kind !== 'stop') return { needsGate: true, body: '' }
        const blocks = assembler.blocks()
        const text = blocks
          .filter((block): block is Extract<(typeof blocks)[number], { type: 'text' }> => block.type === 'text')
          .map(block => block.text)
          .join('')
        return parseDraft(text)
      } catch {
        return { needsGate: true, body: '' }
      }
    },
  }
}

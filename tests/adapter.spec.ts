import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  CallId,
  LlmAdapter,
  LlmRuntime,
  createAssistantMessage,
  createToolResultMessage,
  createUserMessage,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { CaptainAdapter } from '../src/adapter.ts'
import { DEFAULT_CAPTAIN_CONFIG } from '../src/config.ts'
import type { CaptainConfig } from '../src/types.ts'

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe('CaptainAdapter native parent loop', () => {
  it('forwards DeepSeek todo/subagent tool calls as native chunks with parent capabilities intact', async () => {
    const requests: GenerateOptions[] = []
    const { adapter } = await harness(requests, async function* (options) {
      if (options.provider === 'gpt-relay') {
        yield* textResponse(planJson(), 'Plan repository work.')
        return
      }
      yield { type: 'usage', usage: { inputTokens: 12, outputTokens: 3, cacheReadTokens: 9 } }
      yield* toolResponse('todo-1', 'todo_write', '{"todos":[{"content":"inspect","status":"in_progress"}]}')
    })
    const options = initialOptions()

    const chunks = await collect(adapter.stream(options))

    const tool = chunks.find((chunk): chunk is Extract<StreamChunk, { type: 'block-end' }> => (
      chunk.type === 'block-end' && chunk.block.type === 'tool-call'
    ))
    expect(tool?.block).toEqual({
      type: 'tool-call',
      id: CallId('todo-1'),
      name: 'todo_write',
      arguments: '{"todos":[{"content":"inspect","status":"in_progress"}]}',
    })
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' } })
    expect(chunks.some(chunk => chunk.type === 'reasoning-delta' && chunk.text.includes('DeepSeek Worker'))).toBe(false)
    expect(chunks).toContainEqual({ type: 'usage', usage: { inputTokens: 12, outputTokens: 3, cacheReadTokens: 9 } })
    const workerRequest = requests.find(request => request.provider === 'deepseek-official')
    expect(workerRequest?.system).toBe(options.system)
    expect(workerRequest?.tools).toBe(options.tools)
    expect(workerRequest?.sessionId).toBe(options.sessionId)
    expect(workerRequest?.messages.at(-1)?.source).toMatchObject({ kind: 'plugin', plugin: 'captain', form: 'relay' })
    expect(requestText(workerRequest)).toContain('native todo_write tool')
  })

  it('skips GPT planning on the tool-result step and remaps native blocks from index zero', async () => {
    const requests: GenerateOptions[] = []
    let deepseekCalls = 0
    const { adapter } = await harness(requests, async function* (options) {
      if (options.provider === 'gpt-relay' && requestText(options).includes('planning brain')) {
        yield* textResponse(planJson(), 'Plan once.')
        return
      }
      if (options.provider === 'gpt-relay') {
        yield* textResponse('{"pass":true,"summary":"accepted","findings":[]}', 'Review diff.')
        return
      }
      deepseekCalls += 1
      if (deepseekCalls === 1) yield* toolResponse('todo-1', 'todo_write', '{"todos":[]}')
      else yield* textResponse('Implementation complete.', 'DeepSeek native reasoning.')
    })
    const firstOptions = initialOptions()
    const first = await collect(adapter.stream(firstOptions))
    expect(first.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'tool-calls' } })
    expect(first.some(chunk => chunk.type === 'reasoning-delta' && chunk.text.startsWith('GPT Planner · '))).toBe(true)

    const second = await collect(adapter.stream(continuationOptions(firstOptions)))

    const plannerRequests = requests.filter(request => request.provider === 'gpt-relay' && requestText(request).includes('planning brain'))
    expect(plannerRequests).toHaveLength(1)
    const workerRequests = requests.filter(request => request.provider === 'deepseek-official')
    expect(workerRequests).toHaveLength(2)
    expect(requestText(workerRequests[0])).toContain('GPT Captain plan:')
    expect(requestText(workerRequests[1])).not.toContain('GPT Captain plan:')
    expect(requestText(workerRequests[1])).toContain('Continue the current Captain execution')
    expect(second).toContainEqual({ type: 'block-start', index: 0, blockType: 'reasoning' })
    expect(second).toContainEqual({ type: 'reasoning-delta', index: 0, text: 'DeepSeek native reasoning.' })
    expect(second).toContainEqual({ type: 'block-end', index: 0, block: { type: 'reasoning', text: 'DeepSeek native reasoning.' } })
    expect(second).toContainEqual({ type: 'text-delta', index: 1, text: 'Implementation complete.' })
    expect(second.some(chunk => chunk.type === 'reasoning-delta' && chunk.text === 'Review diff.')).toBe(true)
    expect(second.some(chunk => chunk.type === 'reasoning-delta' && chunk.text.includes('GPT Reviewer'))).toBe(false)
    expect(second.some(chunk => chunk.type === 'text-delta' && chunk.text.includes('Captain review passed.'))).toBe(true)
    expect(second.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
  })

  it('does not replan an orphaned native tool continuation after adapter state is lost', async () => {
    const requests: GenerateOptions[] = []
    const { adapter } = await harness(requests, async function* (options) {
      if (options.provider === 'deepseek-official') {
        yield* textResponse('Recovered and completed.')
        return
      }
      if (requestText(options).includes('Review the incremental implementation')) {
        yield* textResponse('{"pass":true,"summary":"accepted","findings":[]}')
        return
      }
      throw new Error('GPT planner must not run for a tool continuation')
    })
    const options = continuationOptions(initialOptions())

    const chunks = await collect(adapter.stream(options))

    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
    expect(requests.filter(request => request.provider === 'gpt-relay')).toHaveLength(1)
    expect(requests.some(request => request.provider === 'gpt-relay' && requestText(request).includes('planning brain'))).toBe(false)
  })

  it('starts a fresh GPT plan when a new direct user message arrives', async () => {
    const requests: GenerateOptions[] = []
    const { adapter } = await harness(requests, async function* (options) {
      if (options.provider === 'gpt-relay') {
        yield* textResponse(planJson())
        return
      }
      yield* toolResponse(`call-${requests.length}`, 'todo_write', '{}')
    })
    const first = initialOptions()
    await collect(adapter.stream(first))
    const second = {
      ...first,
      messages: [...first.messages, createUserMessage({ content: [{ type: 'text', text: 'a different task' }], source: { kind: 'user' } })],
    }

    await collect(adapter.stream(second))

    expect(requests.filter(request => request.provider === 'gpt-relay' && requestText(request).includes('planning brain'))).toHaveLength(2)
  })

  it('closes an open DeepSeek reasoning block before forwarding an aborted finish', async () => {
    const requests: GenerateOptions[] = []
    const controller = new AbortController()
    const { adapter } = await harness(requests, async function* (options) {
      if (options.provider === 'gpt-relay') {
        yield* textResponse(planJson())
        return
      }
      yield { type: 'block-start', index: 0, blockType: 'reasoning' }
      yield { type: 'reasoning-delta', index: 0, text: 'Working...' }
      await new Promise<void>((resolve) => {
        if (options.signal?.aborted) resolve()
        else options.signal?.addEventListener('abort', () => { resolve() }, { once: true })
      })
      yield { type: 'finish', reason: { kind: 'aborted', failure: { message: 'stopped', code: 'ABORTED' } } }
    })
    const iterator = adapter.stream({ ...initialOptions(), signal: controller.signal })[Symbol.asyncIterator]()
    const chunks: StreamChunk[] = []
    while (!chunks.some(chunk => chunk.type === 'reasoning-delta' && chunk.text === 'Working...')) {
      const item = await iterator.next()
      if (item.done) throw new Error('stream ended before DeepSeek reasoning')
      chunks.push(item.value)
    }
    controller.abort()
    for (;;) {
      const item = await iterator.next()
      if (item.done) break
      chunks.push(item.value)
    }

    const working = chunks.find(chunk => chunk.type === 'reasoning-delta' && chunk.text === 'Working...')
    expect(working).toBeDefined()
    const workingIndex = working !== undefined && 'index' in working ? working.index : -1
    expect(chunks).toContainEqual({ type: 'block-end', index: workingIndex, block: { type: 'reasoning', text: 'Working...' } })
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'aborted' } })
  })

  it('skips review entirely when review is disabled', async () => {
    const requests: GenerateOptions[] = []
    const config = structuredClone(DEFAULT_CAPTAIN_CONFIG)
    config.reviewerEnabled = false
    const { adapter } = await harness(requests, async function* (options) {
      if (options.provider === 'gpt-relay') {
        yield* textResponse(planJson(), 'Plan repository work.')
        return
      }
      if (requestText(options).includes('Review the incremental implementation')) {
        yield* textResponse('{"pass":true,"summary":"accepted","findings":[]}')
        return
      }
      yield* textResponse('Implementation complete.', 'DeepSeek native reasoning.')
    }, config)

    const chunks = await collect(adapter.stream(initialOptions()))

    expect(requests.filter(request => request.provider === 'gpt-relay')).toHaveLength(1)
    expect(requests.filter(request => request.provider === 'deepseek-official')).toHaveLength(1)
    expect(requests.some(request => requestText(request).includes('Review the incremental implementation'))).toBe(false)
    expect(chunks.some(chunk => chunk.type === 'text-delta' && chunk.text === 'Implementation complete.')).toBe(true)
    expect(chunks.some(chunk => chunk.type === 'text-delta' && chunk.text.includes('Captain review'))).toBe(false)
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
  })
})

async function harness(
  requests: GenerateOptions[],
  respond: (options: GenerateOptions) => AsyncIterable<StreamChunk>,
  config: CaptainConfig = structuredClone(DEFAULT_CAPTAIN_CONFIG),
): Promise<{ ctx: Context; adapter: CaptainAdapter }> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  Object.defineProperty(ctx, 'agents', { value: { get: () => undefined }, configurable: true })
  const provider = new class extends LlmAdapter {
    async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      requests.push(options)
      yield* respond(options)
    }
  }()
  ctx.llm.registerAdapter(['gpt-relay', 'deepseek-official'], provider)
  return { ctx, adapter: new CaptainAdapter(ctx, () => structuredClone(config)) }
}

function initialOptions(): GenerateOptions {
  return {
    provider: 'captain',
    model: 'captain:test',
    messages: [createUserMessage({ content: [{ type: 'text', text: 'fix the native execution UI' }], source: { kind: 'user' } })],
    system: 'Parent Harness system prompt.',
    tools: [
      { name: 'todo_write', description: 'native plan', parameters: { type: 'object' } },
      { name: 'subagent', description: 'native child agent', parameters: { type: 'object' } },
    ],
    sessionId: SessionId('captain-native-session'),
  }
}

function continuationOptions(initial: GenerateOptions): GenerateOptions {
  const callId = CallId('todo-1')
  return {
    ...initial,
    messages: [
      ...initial.messages,
      createAssistantMessage({
        content: [{ type: 'tool-call', id: callId, name: 'todo_write', arguments: '{}' }],
        source: { provider: 'captain', model: initial.model },
      }),
      createToolResultMessage({ callId, content: [{ type: 'text', text: 'todo updated' }], isError: false }),
    ],
  }
}

function planJson(): string {
  return '{"tasks":[{"id":"task-1","prompt":"fix native execution","dependsOn":[],"files":[],"tokenBudget":8000}],"acceptance":["native tool cards visible"]}'
}

async function* textResponse(text: string, reasoning?: string): AsyncIterable<StreamChunk> {
  let index = 0
  if (reasoning !== undefined) {
    yield { type: 'block-start', index, blockType: 'reasoning' }
    yield { type: 'reasoning-delta', index, text: reasoning }
    yield { type: 'block-end', index, block: { type: 'reasoning', text: reasoning } }
    index += 1
  }
  yield { type: 'block-start', index, blockType: 'text' }
  yield { type: 'text-delta', index, text }
  yield { type: 'block-end', index, block: { type: 'text', text } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

async function* toolResponse(id: string, name: string, args: string): AsyncIterable<StreamChunk> {
  const callId = CallId(id)
  yield { type: 'block-start', index: 0, blockType: 'tool-call' }
  yield { type: 'tool-call-delta', index: 0, id: callId, name, argumentsDelta: args }
  yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name, arguments: args } }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}

function requestText(options: GenerateOptions | undefined): string {
  if (options === undefined) return ''
  return options.messages.flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])).join('\n')
}

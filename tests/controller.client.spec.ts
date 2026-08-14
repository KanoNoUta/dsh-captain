import { describe, expect, it } from 'vitest'
import { CaptainCardController } from '../src/client/captain-card-controller.ts'
import { DEFAULT_CAPTAIN_CONFIG } from '../src/client/constants.ts'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { IApiClient, ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client'
import type { CaptainConfig } from '../src/types.ts'

const groups: ModelProviderGroup[] = [
  {
    id: 'gpt-relay',
    name: 'GPT Relay',
    models: [
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', reasoning: { efforts: [{ id: 'high', name: 'High' }] } },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', reasoning: { efforts: [{ id: 'max', name: 'Max' }] } },
    ],
  },
  { id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }] },
]

function apiOf(catalog: readonly ModelProviderGroup[] = groups): Pick<IApiClient, 'llm'> {
  return {
    llm: {
      models: async () => ({ result: { ok: true, value: { groups: [...catalog], failures: [] } } }),
    },
  } as unknown as Pick<IApiClient, 'llm'>
}

function scopeOf(initial: CaptainConfig = structuredClone(DEFAULT_CAPTAIN_CONFIG)): SettingsScope<CaptainConfig> {
  let snapshot: SettingsScopeSnapshot<CaptainConfig> = {
    status: 'ready', value: initial, base: initial, user: {}, revision: 1, writable: true, mode: 'host',
  }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    set: async (field, value) => {
      const next = structuredClone(snapshot.value ?? initial)
      const [group, key] = field.split('.', 2)
      if (group === 'orchestration' && key !== undefined) (next.orchestration as unknown as Record<string, unknown>)[key] = value
      else (next as unknown as Record<string, unknown>)[field] = value
      snapshot = { ...snapshot, value: next, user: { [field]: value }, revision: (snapshot.revision ?? 0) + 1 }
      for (const listener of listeners) listener()
    },
    unset: async () => undefined,
  }
}

describe('Captain settings controller', () => {
  it('stages edits and writes every settings group through the bound scope', async () => {
    const scope = scopeOf()
    const controller = new CaptainCardController(scope, apiOf())
    const face = controller.inject()
    face.edit('orchestration.maxAgents', '8')
    expect(face.hooks.captainCard.getSnapshot().draft.orchestration.maxAgents).toBe(8)
    face.save()
    await new Promise(resolve => setTimeout(resolve, 0))
    const state = face.hooks.captainCard.getSnapshot()
    expect(state.dirty).toBe(false)
    expect(state.saved).toBe(true)
    expect(scope.getSnapshot().value?.orchestration.maxAgents).toBe(8)
  })

  it('resets a staged draft without touching the remote value', () => {
    const scope = scopeOf()
    const controller = new CaptainCardController(scope, apiOf())
    const face = controller.inject()
    face.edit('policy', 'balanced')
    face.reset()
    expect(face.hooks.captainCard.getSnapshot().draft.policy).toBe(DEFAULT_CAPTAIN_CONFIG.policy)
    expect(face.hooks.captainCard.getSnapshot().dirty).toBe(false)
  })

  it('keeps string orchestration fields as strings', () => {
    const scope = scopeOf()
    const controller = new CaptainCardController(scope, apiOf())
    const face = controller.inject()
    face.edit('orchestration.mode', 'fixed')
    expect(face.hooks.captainCard.getSnapshot().draft.orchestration.mode).toBe('fixed')
  })

  it('stages the reviewer toggle and persists it with the settings groups', async () => {
    const scope = scopeOf()
    const controller = new CaptainCardController(scope, apiOf())
    const face = controller.inject()
    face.edit('reviewerEnabled', false)
    expect(face.hooks.captainCard.getSnapshot().draft.reviewerEnabled).toBe(false)
    face.save()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(scope.getSnapshot().value?.reviewerEnabled).toBe(false)
  })

  it('loads the host model catalog and keeps provider, model, and effort edits compatible', async () => {
    const controller = new CaptainCardController(scopeOf(), apiOf())
    await controller.loadModels()
    const face = controller.inject()
    expect(face.hooks.captainCard.getSnapshot().catalogGroups).toEqual(groups)

    face.edit('planner.reasoningEffort', 'high')
    face.edit('planner.provider', 'deepseek-official')
    const planner = face.hooks.captainCard.getSnapshot().draft.planner
    expect(planner).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      reasoningEffort: 'high',
    })
  })
})

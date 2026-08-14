// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CaptainSettingsCard } from '../src/client/CaptainSettingsCard.tsx'
import type { CaptainSettingsCardProps } from '../src/client/CaptainSettingsCard.tsx'
import type { CaptainCardState } from '../src/client/captain-card-controller.ts'
import { DEFAULT_CAPTAIN_CONFIG } from '../src/client/constants.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const state: CaptainCardState = {
  available: true,
  writable: true,
  dirty: false,
  saving: false,
  saved: false,
  catalogStatus: 'ready',
  catalogGroups: [
    {
      id: 'gpt-relay',
      name: 'GPT Relay',
      models: [{
        id: 'gpt-5.6-sol',
        name: 'GPT-5.6 Sol',
        reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'max', name: 'Max' }] },
      }, { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }, { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra' }],
    },
    {
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }],
    },
    {
      id: 'opencode-go',
      name: 'opencode-go',
      models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }],
    },
  ],
  draft: {
    ...structuredClone(DEFAULT_CAPTAIN_CONFIG),
    planner: { provider: 'gpt-relay', model: 'gpt-5.6-sol', reasoningEffort: 'high' },
    worker: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: '' },
  },
}

function renderCard() {
  const actions = { edit: vi.fn(), loadModels: vi.fn(), save: vi.fn(), reset: vi.fn() }
  const props = {
    ...actions,
    t: (key: keyof typeof en) => en[key],
    useCaptainCard: (selector: (value: CaptainCardState) => unknown) => selector(state),
  } as unknown as CaptainSettingsCardProps
  render(<CaptainSettingsCard {...props} />)
  fireEvent.click(screen.getByRole('button', { name: new RegExp(en.title) }))
  return actions
}

describe('Captain settings card', () => {
  it('uses selects for route, effort, policy, and scheduling choices', () => {
    const actions = renderCard()
    expect(actions.loadModels).toHaveBeenCalledOnce()

    const planner = screen.getByRole('heading', { name: en.planner }).parentElement?.parentElement
    if (planner == null) throw new Error('planner section missing')
    const plannerFields = within(planner)
    expect((plannerFields.getByRole('combobox', { name: en.provider }) as HTMLSelectElement).value).toBe('gpt-relay')
    expect((plannerFields.getByRole('combobox', { name: en.model }) as HTMLSelectElement).value).toBe('gpt-5.6-sol')
    expect((plannerFields.getByRole('combobox', { name: en.effort }) as HTMLSelectElement).value).toBe('high')

    expect((screen.getByRole('combobox', { name: en.policy }) as HTMLSelectElement).value).toBe('ultra')
    expect((screen.getByRole('combobox', { name: en.mode }) as HTMLSelectElement).value).toBe('auto')
    expect((screen.getByRole('spinbutton', { name: en.maxAgents }) as HTMLInputElement).valueAsNumber).toBe(16)
  })

  it('shows the GPT relay low, medium, high, and xhigh controls when metadata is absent', () => {
    const fallbackState = structuredClone(state)
    const firstGroup = fallbackState.catalogGroups[0]
    if (firstGroup === undefined) throw new Error('GPT relay group missing')
    fallbackState.catalogGroups = [{
      ...firstGroup,
      models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }],
    }, ...fallbackState.catalogGroups.slice(1)]
    const actions = { edit: vi.fn(), loadModels: vi.fn(), save: vi.fn(), reset: vi.fn() }
    const props = {
      ...actions,
      t: (key: keyof typeof en) => en[key],
      useCaptainCard: (selector: (value: CaptainCardState) => unknown) => selector(fallbackState),
    } as unknown as CaptainSettingsCardProps
    render(<CaptainSettingsCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.title) }))
    const planner = screen.getByRole('heading', { name: en.planner }).parentElement?.parentElement
    if (planner == null) throw new Error('planner section missing')
    const options = within(planner).getByRole('combobox', { name: en.effort }).querySelectorAll('option')
    expect([...options].map(option => option.getAttribute('value'))).toEqual(['', 'low', 'medium', 'high', 'xhigh'])
    expect(actions.loadModels).toHaveBeenCalledOnce()
  })

  it('distinguishes the official and OpenCode DeepSeek routes', () => {
    renderCard()
    const worker = screen.getByRole('heading', { name: en.worker }).parentElement?.parentElement
    if (worker == null) throw new Error('worker section missing')
    const provider = within(worker).getByRole('combobox', { name: en.provider }) as HTMLSelectElement
    expect([...provider.options].map(option => option.textContent)).toContain('Official DeepSeek')
    expect([...provider.options].map(option => option.textContent)).toContain('OpenCode DeepSeek')
  })

  it('offers dedicated Luna and Terra routes for vision instead of the Sol planner', () => {
    renderCard()
    const vision = screen.getByRole('heading', { name: en.vision }).parentElement?.parentElement
    if (vision == null) throw new Error('vision section missing')
    const fields = within(vision)
    const model = fields.getByRole('combobox', { name: en.model }) as HTMLSelectElement
    expect([...model.options].map(option => option.value)).toEqual(['gpt-5.6-luna', 'gpt-5.6-terra'])
    expect(fields.queryByRole('combobox', { name: en.effort })).toBeNull()
  })
})

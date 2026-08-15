import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { IApiClient, ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client'
import type { CaptainConfig } from '../types.ts'
import { DEFAULT_CAPTAIN_CONFIG } from './constants.ts'

/** Browser projection of the Captain settings card. */
export interface CaptainCardState {
  available: boolean
  writable: boolean
  dirty: boolean
  saving: boolean
  saved: boolean
  error?: string
  catalogStatus: 'idle' | 'loading' | 'ready' | 'error'
  catalogError?: string
  catalogGroups: readonly ModelProviderGroup[]
  draft: CaptainConfig
}

/** Face injected into the settings slot component. */
export interface CaptainCardFace {
  hooks: { captainCard: SnapshotStore<CaptainCardState> }
  edit: (path: string, value: string | boolean) => void
  loadModels: () => void
  save: () => void
  reset: () => void
}

/** Staged form controller over the Host-owned Captain settings namespace. */
export class CaptainCardController {
  private draft: CaptainConfig = structuredClone(DEFAULT_CAPTAIN_CONFIG)
  private dirty = false
  private saving = false
  private saved = false
  private error: string | undefined
  private catalogStatus: CaptainCardState['catalogStatus'] = 'idle'
  private catalogError: string | undefined
  private catalogGroups: readonly ModelProviderGroup[] = []
  private catalogGeneration = 0
  private readonly store: SnapshotStore<CaptainCardState>

  constructor(
    private readonly scope: SettingsScope<CaptainConfig>,
    private readonly api: Pick<IApiClient, 'llm'>,
  ) {
    this.store = createSnapshotStore(this.snapshot())
    scope.subscribe(() => {
      const value = scope.getSnapshot().value
      if (value !== undefined && !this.dirty && !this.saving) this.draft = structuredClone(value)
      this.publish()
    })
  }

  /** Build the slot face.
   * @returns Browser-facing hooks and settings actions.
   */
  inject(): CaptainCardFace {
    return {
      hooks: { captainCard: this.store },
      edit: (path, value) => { this.edit(path, value) },
      loadModels: () => { void this.loadModels() },
      save: () => { void this.save() },
      reset: () => { this.reset() },
    }
  }

  private snapshot(): CaptainCardState {
    const remote = this.scope.getSnapshot()
    return {
      available: remote.status === 'ready',
      writable: remote.writable,
      dirty: this.dirty,
      saving: this.saving,
      saved: this.saved,
      ...this.error === undefined ? {} : { error: this.error },
      catalogStatus: this.catalogStatus,
      ...this.catalogError === undefined ? {} : { catalogError: this.catalogError },
      catalogGroups: this.catalogGroups,
      draft: this.draft,
    }
  }

  private publish(): void { this.store.set(this.snapshot()) }

  private edit(path: string, value: string | boolean): void {
    const next = structuredClone(this.draft)
    const [group, field] = path.split('.', 2)
    if (group === 'policy' && typeof value === 'string') next.policy = value as CaptainConfig['policy']
    else if (group === 'orchestration' && field !== undefined) {
      const current = next.orchestration[field as keyof CaptainConfig['orchestration']]
      if (typeof current === 'boolean') next.orchestration[field as 'adaptiveConcurrency'] = Boolean(value)
      else if (typeof current === 'number') next.orchestration[field as keyof CaptainConfig['orchestration']] = Number(value) as never
      else next.orchestration[field as keyof CaptainConfig['orchestration']] = String(value) as never
    } else if (group === 'reviewerEnabled' && typeof value === 'boolean') next.reviewerEnabled = value
    else if (group !== undefined && group in next && field !== undefined) {
      const role = next[group as 'default' | 'planner' | 'worker' | 'reviewer' | 'vision']
      if (field === 'provider') {
        role.provider = String(value)
        const models = this.catalogGroups.find(entry => entry.id === role.provider)?.models ?? []
        if (!models.some(model => model.id === role.model)) role.model = models[0]?.id ?? ''
        this.clearUnsupportedEffort(role)
      } else if (field === 'model') {
        role.model = String(value)
        this.clearUnsupportedEffort(role)
      } else if (field === 'reasoningEffort') role.reasoningEffort = String(value)
    }
    this.draft = next
    this.dirty = true
    this.saved = false
    this.error = undefined
    this.publish()
  }

  private clearUnsupportedEffort(route: CaptainConfig['planner']): void {
    if (route.reasoningEffort.length === 0) return
    const model = this.catalogGroups
      .find(group => group.id === route.provider)
      ?.models.find(entry => entry.id === route.model)
    if (model?.reasoning === undefined) return
    if (!model.reasoning.efforts.some(effort => effort.id === route.reasoningEffort)) route.reasoningEffort = ''
  }

  /** Refresh the host-scoped model catalog used by route selects. */
  async loadModels(): Promise<void> {
    const generation = ++this.catalogGeneration
    this.catalogStatus = 'loading'
    this.catalogError = undefined
    this.publish()
    try {
      const response = await this.api.llm.models({})
      if (!response.result.ok) throw new Error(response.result.error.message)
      if (generation !== this.catalogGeneration) return
      this.catalogGroups = response.result.value.groups
      this.catalogStatus = 'ready'
    } catch (error) {
      if (generation !== this.catalogGeneration) return
      this.catalogStatus = 'error'
      this.catalogError = error instanceof Error ? error.message : String(error)
    }
    this.publish()
  }

  private async save(): Promise<void> {
    if (!this.dirty || this.saving || !this.scope.getSnapshot().writable) return
    this.saving = true
    this.error = undefined
    this.publish()
    try {
      await this.scope.set('default', this.draft.default)
      await this.scope.set('planner', this.draft.planner)
      await this.scope.set('worker', this.draft.worker)
      await this.scope.set('reviewer', this.draft.reviewer)
      await this.scope.set('vision', this.draft.vision)
      await this.scope.set('reviewerEnabled', this.draft.reviewerEnabled)
      await this.scope.set('policy', this.draft.policy)
      await this.scope.set('orchestration', this.draft.orchestration)
      this.dirty = false
      this.saved = true
    } catch (error) {
      this.error = String(error)
    } finally {
      this.saving = false
      this.publish()
    }
  }

  private reset(): void {
    this.draft = structuredClone(this.scope.getSnapshot().value ?? DEFAULT_CAPTAIN_CONFIG)
    this.dirty = false
    this.error = undefined
    this.publish()
  }
}

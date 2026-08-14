import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CaptainCardFace, CaptainCardState } from './captain-card-controller.ts'
import css from './CaptainSettingsCard.module.css'
import type { CaptainConfig, CaptainRoleRoute } from '../types.ts'
import { isLikelyVisionModel } from '../vision-model.ts'

const GPT_RELAY_EFFORTS = [
  { value: 'low', labelKey: 'effortLow' },
  { value: 'medium', labelKey: 'effortMedium' },
  { value: 'high', labelKey: 'effortHigh' },
  { value: 'xhigh', labelKey: 'effortXHigh' },
] as const

export type CaptainSettingsCardProps =
  PropsRuntime<'settings.plugin.item'> & PropsLocale<'captain'> & InjectFace<CaptainCardFace>

/** Render the native Captain configuration card inside Plugins settings. */
export function CaptainSettingsCard(props: CaptainSettingsCardProps) {
  const state = props.useCaptainCard(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  if (!state.available) return null

  return <li className={css.card}>
    <button
      type="button"
      className={css.header}
      aria-expanded={open}
      onClick={() => {
        const next = !open
        setOpen(next)
        if (next) props.loadModels()
      }}
    >
      <span className={css.title}>{props.t('title')}</span>
      <span className={css.description}>{props.t('description')}</span>
    </button>
    {open && <div className={css.body}>
      <p className={css.hint}>{props.t('relayHint')}</p>
      <RoleSection
        title={props.t('planner')}
        role="planner"
        route={state.draft.planner}
        effort={state.draft.planner.reasoningEffort}
        groups={state.catalogGroups}
        disabled={!state.writable}
        onEdit={props.edit}
        t={props.t}
      />
      <RoleSection
        title={props.t('worker')}
        role="worker"
        route={state.draft.worker}
        effort={state.draft.worker.reasoningEffort}
        groups={state.catalogGroups}
        disabled={!state.writable}
        onEdit={props.edit}
        t={props.t}
      />
      <RoleSection
        title={props.t('reviewer')}
        role="reviewer"
        route={state.draft.reviewer}
        effort={state.draft.reviewer.reasoningEffort}
        groups={state.catalogGroups}
        disabled={!state.writable || !state.draft.reviewerEnabled}
        enabled={state.draft.reviewerEnabled}
        onToggle={(value) => { props.edit('reviewerEnabled', value) }}
        onEdit={props.edit}
        t={props.t}
      />
      <RoleSection
        title={props.t('vision')}
        role="vision"
        route={state.draft.vision}
        effort={state.draft.vision.reasoningEffort}
        groups={state.catalogGroups}
        disabled={!state.writable}
        onEdit={props.edit}
        t={props.t}
      />
      <div className={css.section}>
        <h3 className={css.sectionTitle}>{props.t('orchestration')}</h3>
        <div className={css.grid}>
          <SelectField
            label={props.t('policy')}
            value={state.draft.policy}
            options={[
              { value: 'balanced', label: props.t('policyBalanced') },
              { value: 'high-quality', label: props.t('policyHighQuality') },
              { value: 'ultra', label: props.t('policyUltra') },
            ]}
            disabled={!state.writable}
            onChange={(value) => { props.edit('policy', value) }}
          />
          <SelectField
            label={props.t('mode')}
            value={state.draft.orchestration.mode}
            options={[
              { value: 'auto', label: props.t('modeAuto') },
              { value: 'fixed', label: props.t('modeFixed') },
            ]}
            disabled={!state.writable}
            onChange={(value) => { props.edit('orchestration.mode', value) }}
          />
          <NumberField
            label={props.t('minAgents')}
            value={String(state.draft.orchestration.minAgents)}
            min={1}
            max={128}
            disabled={!state.writable}
            onChange={(value) => { props.edit('orchestration.minAgents', value) }}
          />
          <NumberField
            label={props.t('maxAgents')}
            value={String(state.draft.orchestration.maxAgents)}
            min={1}
            max={128}
            disabled={!state.writable}
            onChange={(value) => { props.edit('orchestration.maxAgents', value) }}
          />
          <NumberField
            label={props.t('maxParallel')}
            value={String(state.draft.orchestration.maxParallel)}
            min={0}
            max={128}
            disabled={!state.writable}
            onChange={(value) => { props.edit('orchestration.maxParallel', value) }}
          />
          <NumberField
            label={props.t('totalTokenBudget')}
            value={String(state.draft.orchestration.totalTokenBudget)}
            min={1}
            disabled={!state.writable}
            onChange={(value) => { props.edit('orchestration.totalTokenBudget', value) }}
          />
          <NumberField
            label={props.t('reviewerTokenBudget')}
            value={String(state.draft.orchestration.reviewerTokenBudget)}
            min={1}
            disabled={!state.writable}
            onChange={(value) => { props.edit('orchestration.reviewerTokenBudget', value) }}
          />
          <NumberField
            label={props.t('maxRepairRounds')}
            value={String(state.draft.orchestration.maxRepairRounds)}
            min={0}
            max={20}
            disabled={!state.writable}
            onChange={(value) => { props.edit('orchestration.maxRepairRounds', value) }}
          />
          <label className={css.field}>
            <span className={css.label}>{props.t('adaptiveConcurrency')}</span>
            <input
              className={css.checkbox}
              type="checkbox"
              checked={state.draft.orchestration.adaptiveConcurrency}
              disabled={!state.writable}
              onChange={(event) => { props.edit('orchestration.adaptiveConcurrency', event.target.checked) }}
            />
          </label>
        </div>
      </div>
      <div className={css.footer}>
        <button type="button" className={css.button} onClick={() => { props.reset() }}>{props.t('reset')}</button>
        <button
          type="button"
          className={`${css.button} ${css.buttonPrimary}`}
          disabled={!state.dirty || state.saving}
          onClick={() => { props.save() }}
        >
          {state.saving ? props.t('saving') : props.t('save')}
        </button>
        {state.saved && <span className={css.status}>{props.t('saved')}</span>}
        {state.error && <span className={css.status}>{state.error}</span>}
        {state.catalogError && <span className={css.status}>{props.t('catalogFailed')}: {state.catalogError}</span>}
      </div>
    </div>}
  </li>
}

function RoleSection({
  title,
  role,
  route,
  effort,
  groups,
  disabled,
  enabled,
  onToggle,
  onEdit,
  t,
}: {
  title: string
  role: keyof Pick<CaptainConfig, 'planner' | 'worker' | 'reviewer' | 'vision'>
  route: CaptainRoleRoute
  effort: string
  groups: CaptainCardState['catalogGroups']
  disabled: boolean
  enabled?: boolean
  onToggle?: (value: boolean) => void
  onEdit: CaptainSettingsCardProps['edit']
  t: CaptainSettingsCardProps['t']
}) {
  const providerOptions = groups.map(group => ({ value: group.id, label: displayProviderName(group.id, group.name) }))
  appendCurrentOption(providerOptions, route.provider, displayProviderName(route.provider, route.provider))
  const group = groups.find(entry => entry.id === route.provider)
  const providerModels = group?.models ?? []
  const likelyVisionModels = role === 'vision' ? providerModels.filter(model => isLikelyVisionModel(model.id)) : []
  const selectableModels = role === 'vision' && likelyVisionModels.length > 0 ? likelyVisionModels : providerModels
  const modelOptions = selectableModels.map(model => ({ value: model.id, label: model.name }))
  if (role !== 'vision' || likelyVisionModels.length === 0) appendCurrentOption(modelOptions, route.model)
  const model = group?.models.find(entry => entry.id === route.model)
  const advertisedEfforts = model?.reasoning?.efforts
    ?? (isGptRelayModel(route.provider, route.model)
      ? GPT_RELAY_EFFORTS.map(entry => ({ value: entry.value, label: t(entry.labelKey) }))
      : [])
  const effortOptions = [
    { value: '', label: t('effortAuto') },
    ...advertisedEfforts.map(entry => ({
      value: 'id' in entry ? entry.id : entry.value,
      label: 'name' in entry ? entry.name : entry.label,
    })),
  ]
  appendCurrentOption(effortOptions, effort)
  return <div className={css.section}>
    <div className={css.sectionHeading}>
      <h3 className={css.sectionTitle}>{title}</h3>
      {onToggle !== undefined && <label className={css.toggle}>
        <span className={css.label}>{t('reviewerEnabled')}</span>
        <input
          className={css.checkbox}
          type="checkbox"
          checked={enabled === true}
          onChange={(event) => { onToggle(event.target.checked) }}
        />
      </label>}
    </div>
    {onToggle !== undefined && enabled === false
      ? <p className={css.hint}>{t('reviewerFallback')}</p>
      : <div className={css.grid}>
      <SelectField
        label={t('provider')}
        value={route.provider}
        options={providerOptions}
        disabled={disabled}
        onChange={(value) => { onEdit(`${role}.provider`, value) }}
      />
      <SelectField
        label={t('model')}
        value={route.model}
        options={modelOptions}
        disabled={disabled}
        onChange={(value) => { onEdit(`${role}.model`, value) }}
      />
      {role !== 'vision' && <SelectField
        label={t('effort')}
        value={effort}
        options={effortOptions}
        disabled={disabled}
        onChange={(value) => { onEdit(`${role}.reasoningEffort`, value) }}
      />}
      </div>}
  </div>
}

function isGptRelayModel(provider: string, model: string): boolean {
  return provider === 'gpt-relay' && model.startsWith('gpt-')
}

interface SelectOption {
  value: string
  label: string
}

function appendCurrentOption(options: SelectOption[], current: string, label = current): void {
  if (current.length > 0 && !options.some(option => option.value === current)) {
    options.push({ value: current, label })
  }
}

/** Keep the two active DeepSeek routes distinct in the settings selector. */
function displayProviderName(provider: string, name: string): string {
  if (provider === 'deepseek-official') return 'Official DeepSeek'
  if (provider === 'opencode-go') return 'OpenCode DeepSeek'
  return name
}

function SelectField({ label, value, options, disabled, onChange }: {
  label: string
  value: string
  options: readonly SelectOption[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  return <label className={css.field}>
    <span className={css.label}>{label}</span>
    <select
      className={css.select}
      value={value}
      disabled={disabled}
      onChange={(event) => { onChange(event.target.value) }}
    >
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>
}

function NumberField({ label, value, min, max, disabled, onChange }: {
  label: string
  value: string
  min: number
  max?: number
  disabled: boolean
  onChange: (value: string) => void
}) {
  return <label className={css.field}>
    <span className={css.label}>{label}</span>
    <input
      className={css.input}
      type="number"
      step={1}
      min={min}
      {...max === undefined ? {} : { max }}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        if (event.target.value.length > 0) onChange(event.target.value)
      }}
    />
  </label>
}

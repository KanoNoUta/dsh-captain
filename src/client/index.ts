/** Captain browser half: native model-directory presence plus Plugins settings card. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { CaptainSettingsCard } from './CaptainSettingsCard.tsx'
import { CaptainCardController } from './captain-card-controller.ts'
import { CAPTAIN_SETTINGS_NAMESPACE } from './constants.ts'
import { en, NS, zh } from './locales.ts'

export { CaptainSettingsCard } from './CaptainSettingsCard.tsx'
export type { CaptainCardFace, CaptainCardState } from './captain-card-controller.ts'
export type { CaptainLocaleKey } from './locales.ts'

export const inject = ['slots', 'locale', 'settingsScope', 'connection']

/** Register Captain dictionaries and its feature-owned settings card. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'captain: dictionaries')
  const connection = ctx.get('connection') as ConnectionHandle
  const controller = new CaptainCardController(
    ctx.settingsScope.bind({ namespace: CAPTAIN_SETTINGS_NAMESPACE }),
    connection.api,
  )
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item', id: 'captain', order: 30, locale: NS, inject: () => controller.inject(),
  }, CaptainSettingsCard))
}

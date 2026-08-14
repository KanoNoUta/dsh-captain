import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { CaptainCardFace } from './captain-card-controller.ts';
export type CaptainSettingsCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<'captain'> & InjectFace<CaptainCardFace>;
/** Render the native Captain configuration card inside Plugins settings. */
export declare function CaptainSettingsCard(props: CaptainSettingsCardProps): import("react").JSX.Element | null;
//# sourceMappingURL=CaptainSettingsCard.d.ts.map
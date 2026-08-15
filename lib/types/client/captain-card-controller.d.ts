import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { IApiClient, ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client';
import type { CaptainConfig } from '../types.ts';
/** Browser projection of the Captain settings card. */
export interface CaptainCardState {
    available: boolean;
    writable: boolean;
    dirty: boolean;
    saving: boolean;
    saved: boolean;
    error?: string;
    catalogStatus: 'idle' | 'loading' | 'ready' | 'error';
    catalogError?: string;
    catalogGroups: readonly ModelProviderGroup[];
    draft: CaptainConfig;
}
/** Face injected into the settings slot component. */
export interface CaptainCardFace {
    hooks: {
        captainCard: SnapshotStore<CaptainCardState>;
    };
    edit: (path: string, value: string | boolean) => void;
    loadModels: () => void;
    save: () => void;
    reset: () => void;
}
/** Staged form controller over the Host-owned Captain settings namespace. */
export declare class CaptainCardController {
    private readonly scope;
    private readonly api;
    private draft;
    private dirty;
    private saving;
    private saved;
    private error;
    private catalogStatus;
    private catalogError;
    private catalogGroups;
    private catalogGeneration;
    private readonly store;
    constructor(scope: SettingsScope<CaptainConfig>, api: Pick<IApiClient, 'llm'>);
    /** Build the slot face.
     * @returns Browser-facing hooks and settings actions.
     */
    inject(): CaptainCardFace;
    private snapshot;
    private publish;
    private edit;
    private clearUnsupportedEffort;
    /** Refresh the host-scoped model catalog used by route selects. */
    loadModels(): Promise<void>;
    private save;
    private reset;
}
//# sourceMappingURL=captain-card-controller.d.ts.map
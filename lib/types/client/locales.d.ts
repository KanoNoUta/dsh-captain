/** Captain browser dictionaries. */
export declare const NS = "captain";
/** English Captain settings strings. */
export declare const en: {
    readonly title: "Captain";
    readonly description: "GPT plans, DeepSeek implements, and optional GPT review verifies the change.";
    readonly policy: "Thinking policy";
    readonly planner: "GPT planner";
    readonly worker: "DeepSeek worker";
    readonly reviewer: "GPT reviewer";
    readonly reviewerEnabled: "Enable review";
    readonly reviewerFallback: "Review is disabled; Captain skips diff review and repair.";
    readonly vision: "Vision companion";
    readonly provider: "Provider route";
    readonly model: "Model id";
    readonly effort: "Reasoning effort";
    readonly effortAuto: "Auto (provider default)";
    readonly effortLow: "Low";
    readonly effortMedium: "Medium";
    readonly effortHigh: "High";
    readonly effortXHigh: "XHigh";
    readonly orchestration: "Orchestration";
    readonly mode: "Scheduling mode";
    readonly modeAuto: "Auto";
    readonly modeFixed: "Fixed";
    readonly policyBalanced: "Balanced";
    readonly policyHighQuality: "High quality";
    readonly policyUltra: "Ultra";
    readonly minAgents: "Minimum agents";
    readonly maxAgents: "Maximum agents";
    readonly maxParallel: "Maximum parallel";
    readonly totalTokenBudget: "Total token budget";
    readonly reviewerTokenBudget: "Reviewer token budget";
    readonly maxRepairRounds: "Review repair rounds";
    readonly adaptiveConcurrency: "Adaptive concurrency";
    readonly save: "Save Captain settings";
    readonly reset: "Reset";
    readonly saving: "Saving…";
    readonly saved: "Saved";
    readonly catalogFailed: "Model directory failed to load";
    readonly unavailable: "Captain settings are unavailable in this deployment.";
    readonly relayHint: "Use OpenAI-compatible relay routes. OAuth is not used.";
};
/** Simplified Chinese Captain settings strings. */
export declare const zh: {
    readonly title: "船长";
    readonly description: "GPT 负责规划，DeepSeek 负责落地修改，并可选用 GPT 独立审核。";
    readonly policy: "思考策略";
    readonly planner: "GPT 规划器";
    readonly worker: "DeepSeek 执行器";
    readonly reviewer: "GPT 审核器";
    readonly reviewerEnabled: "启用审核";
    readonly reviewerFallback: "审核已关闭；Captain 将跳过 Diff 审核和返工。";
    readonly vision: "视觉伴侣";
    readonly provider: "中转提供方";
    readonly model: "模型 ID";
    readonly effort: "思考强度";
    readonly effortAuto: "自动（使用模型默认值）";
    readonly effortLow: "低";
    readonly effortMedium: "中";
    readonly effortHigh: "高";
    readonly effortXHigh: "极高（XHigh）";
    readonly orchestration: "多 Agent 调度";
    readonly mode: "调度模式";
    readonly modeAuto: "自动调度";
    readonly modeFixed: "固定调度";
    readonly policyBalanced: "均衡";
    readonly policyHighQuality: "高质量";
    readonly policyUltra: "Ultra";
    readonly minAgents: "最少 Agent 数";
    readonly maxAgents: "最多 Agent 数";
    readonly maxParallel: "最大并发数";
    readonly totalTokenBudget: "总 Token 预算";
    readonly reviewerTokenBudget: "审核 Token 预算";
    readonly maxRepairRounds: "审核返工轮数";
    readonly adaptiveConcurrency: "自适应并发";
    readonly save: "保存船长设置";
    readonly reset: "重置";
    readonly saving: "保存中…";
    readonly saved: "已保存";
    readonly catalogFailed: "模型目录加载失败";
    readonly unavailable: "当前部署没有开放船长设置。";
    readonly relayHint: "使用 OpenAI-compatible 中转路由，不接官方 OAuth。";
};
/** Keys shared by the English and Chinese Captain dictionaries. */
export type CaptainLocaleKey = keyof typeof en;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        captain: CaptainLocaleKey;
    }
}
//# sourceMappingURL=locales.d.ts.map
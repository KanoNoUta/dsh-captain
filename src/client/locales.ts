/** Captain browser dictionaries. */
export const NS = 'captain'

/** English Captain settings strings. */
export const en = {
  title: 'Captain',
  description: 'GPT plans, DeepSeek implements, and optional GPT review verifies the change.',
  policy: 'Thinking policy',
  planner: 'GPT planner',
  worker: 'DeepSeek worker',
  reviewer: 'GPT reviewer',
  reviewerEnabled: 'Enable review',
  reviewerFallback: 'Review is disabled; Captain skips diff review and repair.',
  vision: 'Vision companion',
  provider: 'Provider route',
  model: 'Model id',
  effort: 'Reasoning effort',
  effortAuto: 'Auto (provider default)',
  effortLow: 'Low',
  effortMedium: 'Medium',
  effortHigh: 'High',
  effortXHigh: 'XHigh',
  orchestration: 'Orchestration',
  mode: 'Scheduling mode',
  modeAuto: 'Auto',
  modeFixed: 'Fixed',
  policyBalanced: 'Balanced',
  policyHighQuality: 'High quality',
  policyUltra: 'Ultra',
  minAgents: 'Minimum agents',
  maxAgents: 'Maximum agents',
  maxParallel: 'Maximum parallel',
  totalTokenBudget: 'Total token budget',
  reviewerTokenBudget: 'Reviewer token budget',
  maxRepairRounds: 'Review repair rounds',
  adaptiveConcurrency: 'Adaptive concurrency',
  save: 'Save Captain settings',
  reset: 'Reset',
  saving: 'Saving…',
  saved: 'Saved',
  catalogFailed: 'Model directory failed to load',
  unavailable: 'Captain settings are unavailable in this deployment.',
  relayHint: 'Use OpenAI-compatible relay routes. OAuth is not used.',
} as const

/** Simplified Chinese Captain settings strings. */
export const zh = {
  title: '船长',
  description: 'GPT 负责规划，DeepSeek 负责落地修改，并可选用 GPT 独立审核。',
  policy: '思考策略',
  planner: 'GPT 规划器',
  worker: 'DeepSeek 执行器',
  reviewer: 'GPT 审核器',
  reviewerEnabled: '启用审核',
  reviewerFallback: '审核已关闭；Captain 将跳过 Diff 审核和返工。',
  vision: '视觉伴侣',
  provider: '中转提供方',
  model: '模型 ID',
  effort: '思考强度',
  effortAuto: '自动（使用模型默认值）',
  effortLow: '低',
  effortMedium: '中',
  effortHigh: '高',
  effortXHigh: '极高（XHigh）',
  orchestration: '多 Agent 调度',
  mode: '调度模式',
  modeAuto: '自动调度',
  modeFixed: '固定调度',
  policyBalanced: '均衡',
  policyHighQuality: '高质量',
  policyUltra: 'Ultra',
  minAgents: '最少 Agent 数',
  maxAgents: '最多 Agent 数',
  maxParallel: '最大并发数',
  totalTokenBudget: '总 Token 预算',
  reviewerTokenBudget: '审核 Token 预算',
  maxRepairRounds: '审核返工轮数',
  adaptiveConcurrency: '自适应并发',
  save: '保存船长设置',
  reset: '重置',
  saving: '保存中…',
  saved: '已保存',
  catalogFailed: '模型目录加载失败',
  unavailable: '当前部署没有开放船长设置。',
  relayHint: '使用 OpenAI-compatible 中转路由，不接官方 OAuth。',
} as const

/** Keys shared by the English and Chinese Captain dictionaries. */
export type CaptainLocaleKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    captain: CaptainLocaleKey
  }
}

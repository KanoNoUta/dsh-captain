# @kanonouta/dsh-captain

[English](README.md) | 中文

Captain（船长）是 DeepSeek Harness 的双面插件，暴露一条合成的 `captain` 模型路由。GPT 负责规划和独立审核，DeepSeek 子代理负责把增量修改落到仓库。

## 安装到 DeepSeek Harness

Captain 已携带 bundle manifest 和预构建的 Host/Client 入口，可直接安装到 Web profile：

```powershell
dsh plugin --profile web add github:KanoNoUta/dsh-captain
```

如果要在 DeepSeek Harness checkout 内做源码开发：

```powershell
cd F:\path\to\deepseek-harness
git submodule add https://github.com/KanoNoUta/dsh-captain.git packages/extensions/captain
git apply packages/extensions/captain/patches/deepseek-harness-integration.patch
pnpm install
pnpm exec tsc -b packages/extensions/captain/tsconfig.host.json --pretty false
pnpm --filter @kanonouta/dsh-captain run bundle
```

可选的源码集成补丁会加入 Host/Client TypeScript 编译入口，并在原生模型选择器中区分官方 DeepSeek 和 OpenCode DeepSeek 路由。普通 `dsh plugin add` 安装由 `cordis.patch.yml` 挂载，不需要该补丁。

## 组合方式

Host 通过现有 LLM adapter directory 注册 `captain`，因此原生模型选择器会和普通提供方一起显示类似 `GPT-5.6 Terra -> DeepSeek V4 Flash` 的路由。路由 ID 是 `captain:<planner-model>-><worker-model>`，模型条目声明支持文本、图片以及 `Balanced`、`High Quality`、`Ultra` 三档思考强度。

Captain 会在分发前解析每个内部 provider/model 路由。策略强度会降到该路由声明支持的最高兼容档；模型没有可选思考强度时，请求不会携带 effort 字段。

Captain 通过现有 OpenAI-compatible LLM adapter 调用配置的提供方路由，不实现 OAuth，也不新建一套凭据存储。先在普通 LLM 设置里配置中转提供方，再把提供方和模型 ID 填进 Captain 设置。

Planner 返回 JSON 依赖 DAG。文件所有权不重叠的 Worker 会在 Token 预算和自适应并发上限内并行执行。Worker 只返回未执行的 DSML 工具调用标记时会收到一次纠正请求；第二次仍返回这类文本就判定任务失败。Worker 执行失败会在审核和返工前停止。Reviewer 接收验收条件、Worker 报告和当前增量 Git Diff；响应格式错误时会收到一次严格 JSON 纠正请求。代码审核失败时只返工 finding 指定的任务；未绑定任务的 finding 会重新检查完整计划。审核通过后才推进下一轮使用的进程内 checkpoint。

原生 tool-result 续接会跳过 GPT 规划，不再把完整 Captain DAG 重复注入 DeepSeek Worker，只发送简短的续接指令，让 Worker 从最近的原生工具状态继续执行并避免反复复述计划。直接选择的非 Captain 模型路由保持不变。

Git 审核始终使用父 Agent Session 的 `cwd`。请求缺少该工作区元数据时，增量 Diff 会显示为不可用，不会读取 Harness Host 进程目录里的改动。运行中的编排器按工作区路径隔离 checkpoint。

简短的日常问候会直接走 GPT Planner 路由，不启动 Worker 或 Reviewer，因此闲聊不会触发仓库 Diff 审核。简短的图片识别或描述请求会直接返回视觉 notes；要求写代码、修复、部署、提交或发布的图片回合仍进入规划和执行流程。定向返工会连同前置依赖任务一起提交给调度器，确保返工 DAG 始终有可执行的根任务。

图片附件继续使用原生 `ImageAttachmentRef` block。Captain 只把原图发给设置卡中独立选择的 OpenAI-compatible 视觉路由，再把识别结果转成文字 notes 交给 GPT Planner 与 DeepSeek Worker。视觉调用不发送 `reasoningEffort`，由提供方使用默认强度。若所选模型明确声明仅支持文本，Captain 会在同一提供方内选择支持图片的模型，并依次优先 Terra、Luna；提供方没有声明图片模型时会在分发前报错，并提示补上 `input: [text, image]`。

## 设置

浏览器半会在 `设置 -> 插件 -> 船长` 注册设置卡。Provider 与模型下拉框读取 Host 实时的全局 `llm.models` 目录。即使中转站没有返回 reasoning 元数据，GPT 中转路由也会显示实际支持的 `low`、`medium`、`high`、`xhigh`；其他路由按模型声明的精确档位显示，并提供使用模型默认值的自动选项。视觉模型下拉框优先显示 Luna、Terra、vision、VL 与 omni 模型，视觉调用使用提供方默认强度，因此不显示思考强度控件。审核开关关闭时，Diff 审核自动改用当前 DeepSeek 执行器路由。Captain 策略和调度模式使用下拉框，数值限制使用带范围的数字控件。Planner、Worker、Reviewer、视觉路由、策略、审核开关和编排参数都会先进入草稿，再通过 Host 的 `captain` 设置命名空间保存。

组合项可以直接指定中转路由：

```yaml
- id: captain
  name: '@kanonouta/dsh-captain'
  config:
    planner:
      provider: gpt-relay
      model: gpt-5.6-sol
      reasoningEffort: max
    worker:
      provider: deepseek-official
      model: deepseek-v4-flash
      reasoningEffort: high
    reviewer:
      provider: gpt-relay
      model: gpt-5.6-terra
      reasoningEffort: ultra
    vision:
      provider: gpt-relay
      model: gpt-5.6-terra
      reasoningEffort: ''
    reviewerEnabled: true
```

对于内置目录里不存在的中转模型，需要在普通 `llm-pi-ai` 提供方配置里声明图片输入：

```yaml
llm-pi-ai:
  providers:
    gpt-relay:
      models:
        - id: gpt-5.6-luna
          input: [text, image]
        - id: gpt-5.6-sol
        - id: gpt-5.6-terra
          input: [text, image]
```

`maxAgents` 是上限，不是固定开几个 Agent。`mode: auto` 配合 `adaptiveConcurrency: true` 会在任务成功后增加并发，在中转站限流或超时后降低并发；`maxParallel: 0` 使用自适应上限。并行只有在中转站仍有容量时才会降低墙钟时间，所以每轮 Token 预算仍然显式受控。

## 包导出

根导出是 Host 插件和编排纯函数；`/client` 导出是浏览器插件与设置卡类型。运行 `pnpm --filter @kanonouta/dsh-captain run bundle` 会生成两侧产物。

## 模型体验

### Captain 任务回合

#### What the model sees

选中的 `captain` 路由会收到用户任务、GPT Planner 的 JSON DAG、DeepSeek Worker 报告和 GPT 独立审核结果；Worker 工具调用仍属于各自的子 Agent Session。

#### Token effect

Planner、Worker、返工和 Reviewer 调用分别受配置预算控制，最终 Captain 响应作为父 Session 的一条 assistant 消息组装。

#### KV Cache effect

每个嵌套角色调用都有自己的 provider/model 前缀，切换角色路由可能降低该角色的 provider 缓存复用，但不会改写父 Session 历史。

### Captain 图片回合

#### What the model sees

用户的 `ImageAttachmentRef` block 通过现有 LLM content 词汇转发到解析后的图片模型。视觉响应会变成 Planner 与 Worker 可见的 `Vision companion notes`；浏览器路径和 base64 不会进入 prompt 文本，Sol Planner 也不会收到原图。

#### Token effect

图片和文本用量由视觉 provider 统计，Planner、Worker、Reviewer 预算与其相互独立。

#### KV Cache effect

增加或替换图片会改变对应 provider 请求后缀，可能使该 provider 的缓存后缀失效。

## 已知限制与待办

- 当前 checkpoint 在进程内保存 Git `HEAD` 与 Diff 元数据，只有审核通过才推进，也不会写入持久化 Session 事件。
- 未跟踪文件会列给 Reviewer，但二进制内容仍由 Git 常规 Diff 提供。
- 没有父 Agent 的 Worker 会回退为直接 LLM 调用，因此无法通过工具修改工作区。

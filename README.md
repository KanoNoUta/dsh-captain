# @deepseek-ai/dsh-captain

English | [中文](README.zh.md)

Captain is a dual-face DeepSeek Harness plugin that exposes one synthetic `captain` model route. GPT is the planner and independent reviewer, while DeepSeek workers make the incremental repository changes.

## Install into DeepSeek Harness

Captain ships its bundle manifest and built Host/Client entry points, so a Web profile can install it directly from GitHub:

```powershell
dsh plugin --profile web add github:KanoNoUta/dsh-captain
```

For source development inside a DeepSeek Harness checkout:

```powershell
cd F:\path\to\deepseek-harness
git submodule add https://github.com/KanoNoUta/dsh-captain.git packages/extensions/captain
git apply packages/extensions/captain/patches/deepseek-harness-integration.patch
pnpm install
pnpm exec tsc -b packages/extensions/captain/tsconfig.host.json --pretty false
pnpm --filter @deepseek-ai/dsh-captain run bundle
```

The optional source integration patch adds both TypeScript compiler faces and keeps official DeepSeek and OpenCode DeepSeek routes distinguishable in the native model selector. Normal `dsh plugin add` installation uses `cordis.patch.yml` and does not require that patch.

## Composition

The Host registers `captain` through the normal LLM adapter directory, so the existing model selector renders a route such as `GPT-5.6 Terra -> DeepSeek V4 Flash` beside ordinary providers. The route id is `captain:<planner-model>-><worker-model>` and the model entry advertises text and image input plus `Balanced`, `High Quality`, and `Ultra` reasoning efforts.

Captain resolves each nested provider/model route before dispatch. A policy effort is downgraded to the strongest effort that route advertises, while routes with no selectable reasoning effort receive no effort field.

Captain calls the configured provider routes through the existing OpenAI-compatible LLM adapters. It does not implement OAuth or a second credential store; configure relay providers in the normal LLM settings and reference their provider and model ids from the Captain settings namespace.

The planner returns a JSON dependency DAG. Workers with disjoint file ownership run concurrently under the configured token budget and adaptive parallel limit. A reviewer receives the acceptance criteria, worker reports, and the current incremental Git diff. A failed review selects only tasks named by findings for repair; an unscoped finding rechecks the full plan. A passing review advances the in-memory checkpoint used by the next run.

Short conversational greetings take a direct GPT planner response without starting workers or reviewers, so a social turn cannot trigger a repository diff review. A short image-identification or description request returns the vision notes directly; image turns that ask for code, fixes, deployment, commits, or releases continue through planning and implementation. Targeted repair rounds include prerequisite tasks so the scheduler always receives a runnable dependency subgraph.

Image attachments remain native `ImageAttachmentRef` blocks. Captain sends them only to the independently selected OpenAI-compatible vision route, converts that response into text notes, and gives the notes to the GPT planner and DeepSeek workers. Vision calls omit `reasoningEffort` so the provider applies its own default. If the selected model explicitly advertises text-only input, Captain selects an image-capable model from the same provider, preferring Terra and then Luna; a provider with no declared image model fails before dispatch with the missing `input: [text, image]` correction.

## Settings

The browser half contributes a card to `Settings -> Plugins -> Captain`. Provider and model selects read the live host-wide `llm.models` catalog. GPT relay routes expose their supported `low`, `medium`, `high`, and `xhigh` controls even when a relay omits reasoning metadata; other routes use their exact advertised efforts plus an automatic provider-default choice. The Vision selector prefers dedicated Luna, Terra, vision, VL, and omni model names and has no reasoning-effort control because vision calls use the provider default. Captain policy and scheduling mode are selects; numeric limits use bounded number controls. The reviewer toggle switches between the dedicated GPT reviewer route and the current DeepSeek worker route. The card stages planner, worker, reviewer, vision, policy, reviewer toggle, and orchestration settings and writes them through the Host settings namespace `captain`.

The composition entry is intentionally relay-oriented:

```yaml
- id: captain
  name: '@deepseek-ai/dsh-captain'
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

The normal `llm-pi-ai` provider profile must declare image input for gateway models that are absent from its built-in catalog:

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

`maxAgents` is a ceiling, not a fixed fan-out. `mode: auto` and `adaptiveConcurrency: true` grow parallelism after successful work and reduce it after provider rate limits or timeouts; `maxParallel: 0` uses the adaptive ceiling. Token budgets remain explicit because parallel requests improve wall-clock latency only while the relay has spare capacity.

## Package faces

The root export is the Host plugin and pure orchestration helpers. The `/client` export is the browser plugin and settings-card types. `pnpm --filter @deepseek-ai/dsh-captain run bundle` produces both faces.

## Model Experience

### Captain task turn

#### What the model sees

The selected `captain` route receives the user's task, the GPT planner's JSON DAG, DeepSeek worker reports, and the independent GPT review result; worker tool calls remain on their child Agent sessions.

#### Token effect

Planner, worker, repair, and reviewer calls consume separate configured budgets, while the final Captain response is one assembled assistant message in the parent session.

#### KV Cache effect

Each nested role call has its own provider/model prefix; changing a role route can reduce provider-side cache reuse for that role without rewriting the parent session history.

### Captain image turn

#### What the model sees

User `ImageAttachmentRef` blocks are forwarded to the resolved image-capable vision route through the existing LLM content vocabulary. Its text response becomes `Vision companion notes` for the planner and workers; no browser path or base64 value is inserted into prompt text, and the Sol planner never receives the original image.

#### Token effect

Image and text usage is charged by the selected vision provider, and the planner/worker/reviewer budgets remain independent of that request.

#### KV Cache effect

Adding or replacing an image changes the affected provider request suffix and can invalidate that provider's cached suffix.

## Known Limitations and Deferred Work

- The current checkpoint stores a Git `HEAD` and diff metadata in process memory; it is deliberately advanced only after a passing review and is not a durable session event.
- Untracked files are listed for the reviewer, while Git's normal binary diff remains the patch source.
- A worker without an attached parent agent uses a direct LLM call and therefore cannot modify the workspace through tools.

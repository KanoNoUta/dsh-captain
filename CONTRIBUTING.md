# Contributing

Install this repository at `packages/extensions/captain` inside a DeepSeek Harness checkout, apply `patches/deepseek-harness-integration.patch`, and use the Harness workspace toolchain.

Before opening a pull request, run:

```powershell
pnpm exec vitest run packages/extensions/captain/tests packages/client/ui-model-selection/tests/model-select.client.spec.tsx
pnpm exec tsc -p packages/extensions/captain/tsconfig.host.json --pretty false
pnpm --filter @deepseek-ai/dsh-captain run bundle
```

Do not commit relay credentials, API keys, `.env` files, generated `lib/`, or `node_modules/`.

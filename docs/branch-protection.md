# Branch protection contract

Цель: `main` нельзя мержить, если не прошёл тот же quality gate, который локально
закреплён в `pnpm check`.

## Required status check

В GitHub ruleset или branch protection для `main` нужно требовать workflow:

- Workflow: `Quality Gates`
- Job: `check`
- Ожидаемый status check: `Quality Gates / check`

Этот job находится в `.github/workflows/quality.yml` и запускается на:

- `pull_request` в `main`
- `push` в `main`

В этом же workflow есть отдельные jobs `smart-history-smoke`, `data-export-smoke`
и `accessibility-smoke`. Они запускают локальные browser smoke для `быстро`,
вкладки `данные` и keyboard/focus flow, но помечены `continue-on-error: true`,
потому что наличие Chrome/Chromium зависит от runner image. Эти jobs полезны как
ранний сигнал UI-регрессии, но их не нужно добавлять в required status checks.

## Что обязан запускать CI

`Quality Gates / check` обязан выполнять:

```bash
pnpm check
pnpm build
pnpm bundle:check
```

`pnpm check` обязан включать:

```bash
pnpm typecheck
pnpm lint
pnpm barcode:check
pnpm day-voice:check
pnpm philosophy:check
pnpm nutrition:check
pnpm ai:search-whitelist:check
pnpm ai-credit:check
pnpm ai-privacy:check
pnpm storage-status:check
pnpm app-readiness:check
pnpm quality-map:check
pnpm widgets:check
pnpm data-export:check
pnpm accessibility:check
pnpm quality-gate:check
```

`pnpm quality-gate:check` проверяет, что package scripts, pre-commit hook и GitHub
workflow не разъехались. Если кто-то уберёт обязательный guard из локального или
удалённого gate, `pnpm check` должен упасть.

`pnpm bundle:check` запускается после `pnpm build` и проверяет production `dist/`:
budget стартового JS, общий первый modulepreload и то, что тяжёлые экраны остаются
lazy, а не возвращаются в первый экран.

Тот же guard проверяет, что optional jobs `smart-history-smoke`, `data-export-smoke`
и `accessibility-smoke` не исчезли из workflow и остаются необязательными.

## Настройка GitHub

Когда репозиторий подключён к GitHub rulesets:

1. Создать ruleset для branch target `main`.
2. Включить requirement `Require status checks to pass`.
3. Выбрать status check `Quality Gates / check`.
4. Включить запрет merge при failing/pending required checks.
5. Для force push и deletion оставить запрет.

Локальный репозиторий не может сам включить серверный ruleset GitHub, поэтому этот
файл является контрактом настройки. Проверяемая часть контракта живёт в
`scripts/check-quality-gate-contract.mjs`.

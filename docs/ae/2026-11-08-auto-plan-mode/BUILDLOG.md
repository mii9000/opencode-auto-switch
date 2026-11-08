---
id: 2026-11-08-auto-plan-mode
status: Building
updated: 2026-11-08
plan: docs/ae/2026-11-08-auto-plan-mode/PLAN.md
---

# Build Log — Question-triggered Plan mode switching

Plan: docs/ae/2026-11-08-auto-plan-mode/PLAN.md
Base commit: 6ef0059

## Ledger

Session 2026-11-08T00:57:39Z: started (base 6ef0059)
Pre-flight: no conflicts — T1→T3 `isQuestionPrompt(text: string): boolean` matches; T2 `AutoPlanRpc` (reportSessions input `{sessionIDs: string[]}`, event `switched {sessionID, from, to, reason}`) matches T4 register/emit and T5 call/subscribe; T3 `decide/DecideInput/Action` matches T4; parallel file sets disjoint (T2{rpc.*}∥T3{state.*}; T4{index.*, test/fakes.ts}∥T5{witness.*, tui.*, vitest.config.ts}). Note: repo had no usable git history — initialized and committed base 6ef0059 (PRD+PLAN only) before Task 1.

Task 1: started (base 6ef0059)
Task 1: complete (commits d3c8a01..5dada70, tests: `npm test && npm run typecheck` → pass, review: clean)

Task 2: started (base 5dada70)
Task 2: ruling: plan specified raw JSON Schema for the contract, but raw JSON Schema infers `unknown` so the contract could not type-check shared shapes (reviewer Critical) — switched to effect codecs wrapped in `toStandardSchemaV1` with identical id, method/event names, and payload shapes; `effect` becomes a direct dependency. Cost if wrong: none for consumers; type-safe contract is strictly stronger than the plan's mechanism.
Task 2: fix round 1/5 (2 critical addressed — typed portable contract + handler-output inference; permanent compile-time guard added at test/rpc-handler-typecheck.ts; commit af88928)
Task 2: fix round 2/5 (1 critical addressed — additionalProperties:false enforced in-contract via parseOptions.onExcessProperty; commit 6654e79)
Task 2: complete (commits 5dada70..6654e79, tests: `npm test && npm run typecheck` → pass, review: clean)

Task 3: started (base 6654e79)
Task 3: minor (deferred): AC-5 test does not cover the subsequent fresh question from the `review` agent (a regression hardcoding rememberedAgent "build" would pass current switch tests)
Task 3: complete (commits 6654e79..7bb9646, tests: `npm test && npm run typecheck` → pass, review: clean)

Task 4: started (base 7bb9646)
Task 4: minor (deferred): no test for a rejected metadata update (the catch covers it; the plan-documented degradation — switch succeeds, state write fails, session left in plan without owed restore — is untested)
Task 4: complete (commits 7bb9646..fce3649, tests: `npm test && npm run typecheck` → pass, review: clean)

Task 5: started (base fce3649)
Task 5: minor (deferred): tests do not cover a witness change while an earlier push is still in flight (a regression suppressing that later push would go undetected)
Task 5: complete (commits fce3649..128e261, tests: `npm test && npm run typecheck` → pass, review: clean)

Task 6: started (base 128e261)
Task 6: test-engineer skipped — pure docs/config/integration-validation task, no new logic (per plan: README, package metadata, npm pack, smoke)
Task 6: minor (deferred): package.json `repository` field left unset — the GitHub repo URL does not exist yet; set it when the repo is published
Task 6: complete (commits 128e261..00a4fe6, tests: `npm test && npm run typecheck && npm pack` → pass (63 tests, tsc exit 0, tarball with src/ README LICENSE), review: pending final review)

Journey AC-1: verified — unit (state.test, index.test AC-1) + LIVE probe against real opencode v2.2.6 serve: witnessed session prompt "…why do cats purr?" → session.agent flipped to plan, metadata `opencode-auto-plan` = {agent:"build"} (probe.mjs, 10/10 checks)
Journey AC-2: verified — unit + LIVE probe: next non-? prompt → agent restored to build, state key removed (probe.mjs)
Journey AC-3: verified — unit only (state machine parentID guard + wiring test "witnessed child session → get called, zero actions"); live subagent spawn not exercised (requires model-driven task tool run); the parentID guard is on the hot path for every witnessed prompt
Journey AC-4: verified — unit + LIVE probe: session created in plan, ? prompt → stays plan, no state debt (probe.mjs)
Journey AC-5: verified — unit + LIVE probe: auto-switched to plan, manual switchAgent back to build, fresh ? prompt → stays build (no re-switch), state debt cleared (probe.mjs)
Journey AC-6: verified — unit + LIVE: real `opencode run "why does the sky look blue?"` completed in `build` (run output header), and probe session B (unwitnessed via RPC) with ? prompt → agent never plan, no state debt
Journey AC-7: verified — unit (index.test emits switched only on plugin-initiated switches; tui.test asserts ui.toast.show exact copy on switched, no toast without event); the real-TUI visual toast is the README manual smoke (steps 1–3), not automatable headlessly

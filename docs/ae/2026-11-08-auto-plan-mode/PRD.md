---
id: 2026-11-08-auto-plan-mode
status: Approved
updated: 2026-11-08
---

# Question-triggered Plan mode switching

## Problem statement

OpenCode users who want to think before acting must remember to switch to Plan mode manually before asking a planning question; if they forget, the question runs in the current agent (e.g. build) where the model may start editing code. After planning, they must remember to switch back manually. Both manual steps are easy to forget, so questions sometimes trigger unwanted execution and work sometimes starts in the wrong mode.

## Users and journeys

Users: OpenCode users anywhere who install the plugin; the maintainer publishes it as an open-source GitHub repository.

- J1: As a user in some non-plan mode, I send a prompt ending with `?` in the main session; that prompt executes with the session in Plan mode.
- J2: As a user who just asked a `?` prompt, I send a follow-up prompt that does NOT end with `?`; it executes with the session restored to the mode it had before the `?` prompt.
- J3: As a user whose main session spawns child/subagent sessions, none of my subagents' prompts are affected by this plugin.
- J4: As a user running one-shot `opencode run` commands or SDK-driven sessions, my prompts are never affected, even when they end with `?`.

## Goals

- G1: In the interactive TUI main session, a prompt ending with `?` runs in Plan mode.
- G2: The next TUI main-session prompt not ending with `?` restores the previous mode before running.
- G3: Child/subagent sessions are never affected.
- G4: With the plugin not installed, nothing changes.
- G5: `opencode run` (CLI) and SDK-created sessions are never affected.
- G6: Every plugin-initiated agent switch is surfaced with a small toast in the TUI, so the switch is never silent.

## Non-goals

- Detecting questions that are not at the end of the prompt — the trigger is only the final character of the prompt text.
- Analyzing or modifying the prompt content or the model's answer.
- Managing modes of child/subagent sessions, or affecting `opencode run` / SDK-created sessions.
- Any heuristic question detection beyond the trailing `?` (e.g. NLP, question words).

## Constraints

| Constraint | Value |
|---|---|
| Form factor | OpenCode plugin (JS/TS module) |
| Distribution | Open-source repository on GitHub, installable by others via the standard OpenCode plugin config (npm package / GitHub reference) |
| Trigger rule | Prompt text ends with `?` (trailing whitespace trimmed before checking) |
| Scope | Interactive TUI main session only — NOT `opencode run`, NOT SDK/server-API sessions, NOT child/subagent sessions |
| Target mode | OpenCode's built-in `plan` agent |
| License | MIT |

## Scope

- A plugin that observes each user prompt in the main session before it executes.
- When the prompt ends with `?`: switch the session's active agent to `plan` before the prompt runs, remembering the previous agent.
- When a subsequent prompt does not end with `?`: restore the remembered agent before it runs.
- A small toast on every plugin-initiated switch (into and out of Plan mode), via the existing `tui.toast.show` event.
- Main-session-only guard based on session identity.

## Acceptance criteria

- [ ] AC-1: Given a main session in agent X (X ≠ plan), when a prompt ending with `?` is submitted, the prompt executes with the session's active agent = plan.
- [ ] AC-2: Given AC-1 happened and the user did not manually change the agent in between, when the next prompt does not end with `?`, that prompt executes with active agent = X.
- [ ] AC-3: Prompts issued in child/subagent sessions never cause any agent switch.
- [ ] AC-4: Given the main session was already in plan mode, a `?` prompt causes no state change and the following non-`?` prompt does not force any mode change.
- [ ] AC-5: Given the plugin auto-switched to plan on a `?` prompt, when the user manually switches to a different agent before the next prompt, the plugin makes no further change on the following non-`?` prompt.
- [ ] AC-6: When a prompt ending with `?` is submitted via `opencode run` (CLI) or the SDK/server API, no agent switch happens on any session.
- [ ] AC-7: When the plugin switches the agent (either into or out of Plan mode), a toast appears in the TUI; when no switch happens, no toast appears.

## Decisions

- Plan mode = the built-in `plan` agent; "switching mode" means switching the session's active agent. (Matches current OpenCode behavior where modes are agents.)
- The plugin only restores the previous agent when it was the one that auto-switched; if the user manually changes the agent between the `?` prompt and the next prompt, the plugin gives up and never overrides that manual choice. (Chosen over blind restore so manual control always wins.)
- Scope is the interactive TUI main session only; `opencode run`, SDK/server-API sessions, and subagents are all excluded. (User decision — the convenience is wanted exactly and only where they type interactively.)
- Show a small toast on every plugin-initiated switch (into and out of Plan mode) using the existing `tui.toast.show` plugin event. (User accepted the proposal conditional on low complexity; the event already exists, so complexity is minimal.)
- Distribute as an open-source GitHub repository installable via standard OpenCode plugin config, so any OpenCode user can adopt it. (User decision — explicit intent to publish for public use.)
- Trailing whitespace/newlines after the `?` are trimmed before checking, so `"why does this break? "` still counts as a question. (User accepted the proposal.)
- License is MIT. (User accepted the proposal.)

## Open questions

- Deferred to /plan (PRD approved with this item known): how a plugin reliably identifies TUI-originated prompts (the docs show a prompt-admission hook and payload metadata but no confirmed "origin" field). The acceptance criteria are origin-based behaviors, so they stay valid regardless of mechanism.

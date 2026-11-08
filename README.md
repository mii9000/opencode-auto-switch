# opencode-auto-switch

An [OpenCode](https://opencode.ai) plugin: **a prompt ending with `?` runs in Plan mode; the next prompt that doesn't restores the previous agent.** TUI sessions only.

No more forgetting to switch to Plan mode before asking a planning question — and no more forgetting to switch back afterwards.

## Install

Add the plugin to `opencode.json(c)` (project) or `~/.config/opencode/opencode.jsonc` (global). OpenCode installs it from GitHub automatically (verified with v2.2.6):

```jsonc
{
  "plugins": ["github:mii9000/opencode-auto-switch"]
}
```

Prefer a pinned checkout instead? Clone and point at the path:

```jsonc
{
  "plugins": ["/absolute/path/to/opencode-auto-switch"]
}
```

Requires OpenCode **v2.2.x** (`@opencode/plugin` ^2.2.6). One entry loads both parts: the server part (does the switching) and the TUI part (witnesses your sessions and shows toasts). Not on npm yet — install from GitHub as above, or `npm install` a checkout if you want to consume it as a package.

## Behavior

| You type (TUI main session) | What happens |
|---|---|
| prompt ending with `?` (trailing whitespace ok) | session switches to the `plan` agent before the prompt runs; toast: `Plan mode — prompt ended with "?"` |
| next prompt **not** ending with `?` | session switches back to the agent it had before; toast: `Restored <agent>` |
| prompt ending with `?` while already in plan | nothing (no state, no toast) |
| you manually changed the agent in between | the plugin stands down — it never overrides a manual choice |
| prompt in `opencode run`, the SDK, or a subagent | never affected **unless that session has been open in a TUI** (see below) |

Provenance boundary (important): the plugin acts on sessions that a TUI has witnessed — sessions the TUI currently displays, plus sessions it displayed earlier while the server ran (the plugin API exposes no per-prompt origin, so "typed in the TUI" is approximated by "belongs to a TUI"). A programmatic prompt (`opencode run --session <id>`, SDK) sent to such a session is therefore treated as interactive. Sessions **never** opened in a TUI are never touched — plain `opencode run` and SDK-driven work is unaffected.

Never-silent rule: every plugin-initiated switch shows a toast. Every switch is best-effort — if anything fails, your prompt still runs untouched.

## How it works

The TUI part of the plugin reports which sessions it witnesses to the server part over an RPC contract. The server part intercepts each admitted prompt (before it runs) and only ever acts on witnessed sessions — so `opencode run`, SDK sessions, and subagents are excluded by construction. The "restore" debt is stored on the session itself (`opencode-auto-plan` metadata), so it survives server restarts.

## Development

```sh
npm install
npm test        # vitest
npm run typecheck
npm pack        # publishability check
```

A live integration probe (`probe.mjs`) drives a real `opencode serve` end to end — switch, restore, stand-down, unwitnessed sessions — and exits non-zero on any failure. Start a server in a project with the plugin linked, then run it with the server password from its output: `OC_PASSWORD=<password> node --experimental-strip-types probe.mjs`.

Manual smoke checklist (maintainer, ~2 minutes, against a real TUI with the plugin linked):

1. In `build`, send `how does auth work?` → toast `Plan mode — prompt ended with "?"`, agent indicator shows `plan`.
2. Send `summarize` → toast `Restored build`, indicator back to `build`.
3. Switch to plan manually, send `why?` → no toast, no change.
4. From another terminal: `opencode run "why does this fail?"` → no toast, TUI session unchanged.

## License

MIT — see [LICENSE](./LICENSE).

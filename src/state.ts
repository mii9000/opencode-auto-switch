import { isQuestionPrompt } from "./prompt-check"

export interface DecideInput {
  /** Raw prompt text (untrimmed). */
  text: string
  /** Does a TUI witness this session? Unwitnessed sessions are never touched. */
  witnessed: boolean
  /** Set on child/subagent sessions; any parentID blocks every action. */
  parentID?: string
  /** The session's current agent (caller passes `info.agent ?? "build"`). */
  agent: string
  /** Remembered agent from the session's metadata state; undefined when no state exists. */
  remembered?: string
}

export type Action =
  | { type: "switch-to-plan"; rememberedAgent: string }
  | { type: "restore"; agent: string }
  | { type: "clear-state" }

/**
 * Pure PRD state machine: what the server should do for one prompt.
 * Rules are ordered — the give-up rule (state exists but the agent was moved
 * off plan) wins over any switch or restore on the same prompt.
 */
export function decide(input: DecideInput): Action[] {
  if (!input.witnessed || input.parentID !== undefined) return []
  if (input.remembered !== undefined && input.agent !== "plan") return [{ type: "clear-state" }]
  if (isQuestionPrompt(input.text)) {
    return input.agent === "plan" ? [] : [{ type: "switch-to-plan", rememberedAgent: input.agent }]
  }
  if (input.remembered !== undefined) return [{ type: "restore", agent: input.remembered }]
  return []
}

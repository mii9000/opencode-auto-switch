import { describe, expect, it } from "vitest"
import { decide, type Action, type DecideInput } from "./state"

/** Build a witnessed, parentless, stateless "build"-session input by default. */
function input(overrides: Partial<DecideInput> = {}): DecideInput {
  return {
    text: "now implement the auth module",
    witnessed: true,
    agent: "build",
    ...overrides,
  }
}

const SWITCH: Action = { type: "switch-to-plan", rememberedAgent: "build" }
const RESTORE: Action = { type: "restore", agent: "build" }
const CLEAR: Action = { type: "clear-state" }

describe("decide", () => {
  describe("AC-1: witnessed build session asking a question switches to plan", () => {
    it("returns exactly one switch-to-plan carrying the current agent", () => {
      const actions = decide(input({ text: "how does auth work?" }))
      expect(actions).toEqual([SWITCH])
    })

    it("treats trailing whitespace after the question mark as a question", () => {
      const actions = decide(input({ text: "why? " }))
      expect(actions).toEqual([SWITCH])
    })
  })

  describe("AC-2: plan session with remembered agent restores on a non-question", () => {
    it("returns exactly one restore to the remembered agent", () => {
      const actions = decide(
        input({ agent: "plan", remembered: "build", text: "go ahead" }),
      )
      expect(actions).toEqual([RESTORE])
    })
  })

  describe("AC-3: unwitnessed and child sessions are never acted on", () => {
    it("returns no actions for an unwitnessed session even on a question", () => {
      const actions = decide(
        input({ witnessed: false, text: "how does auth work?" }),
      )
      expect(actions).toEqual([])
    })

    it("returns no actions for a witnessed child session even on a question", () => {
      const actions = decide(
        input({ parentID: "ses_parent", text: "how does auth work?" }),
      )
      expect(actions).toEqual([])
    })
  })

  describe("AC-4: witnessed plan session with no state stays quiet", () => {
    it("returns no actions on a question", () => {
      const actions = decide(input({ agent: "plan", text: "how does auth work?" }))
      expect(actions).toEqual([])
    })

    it("returns no actions on a non-question", () => {
      const actions = decide(input({ agent: "plan", text: "go ahead" }))
      expect(actions).toEqual([])
    })

    it("returns no actions on a question even when stale state exists", () => {
      const actions = decide(
        input({ agent: "plan", remembered: "build", text: "how does auth work?" }),
      )
      expect(actions).toEqual([])
    })
  })

  describe("AC-5: user moved the agent manually — plugin clears state only", () => {
    it("returns exactly one clear-state on a question, no switch and no restore", () => {
      const actions = decide(
        input({ agent: "review", remembered: "build", text: "should we merge this?" }),
      )
      expect(actions).toEqual([CLEAR])
    })

    it("returns exactly one clear-state on a non-question, no restore", () => {
      const actions = decide(
        input({ agent: "review", remembered: "build", text: "merge it" }),
      )
      expect(actions).toEqual([CLEAR])
    })

    it("returns exactly one clear-state when the user moved to build", () => {
      const actions = decide(
        input({ agent: "build", remembered: "plan", text: "should we merge this?" }),
      )
      expect(actions).toEqual([{ type: "clear-state" }])
    })
  })

  describe("AC-6 invariants across the decision matrix", () => {
    const matrix: DecideInput[] = []
    for (const witnessed of [true, false]) {
      for (const parentID of [undefined, "ses_parent"]) {
        for (const agent of ["build", "plan", "review"]) {
          for (const remembered of [undefined, "build"]) {
            for (const text of ["do the thing", "how do I do the thing?"]) {
              matrix.push({ text, witnessed, parentID, agent, remembered })
            }
          }
        }
      }
    }

    it("returns at most one action for every input", () => {
      for (const entry of matrix) {
        const actions = decide(entry)
        expect(actions.length, JSON.stringify(entry)).toBeLessThanOrEqual(1)
      }
    })

    it("never returns switch-to-plan together with restore or clear-state", () => {
      for (const entry of matrix) {
        const actions = decide(entry)
        const hasSwitch = actions.some((a) => a.type === "switch-to-plan")
        const hasSwitchAway = actions.some(
          (a) => a.type === "restore" || a.type === "clear-state",
        )
        expect(hasSwitch && hasSwitchAway, JSON.stringify(entry)).toBe(false)
      }
    })

    it("pins restore for witnessed plan + state + non-question", () => {
      const actions = decide(
        input({ agent: "plan", remembered: "build", text: "do the thing" }),
      )
      expect(actions).toEqual([RESTORE])
    })

    it("pins no actions for witnessed non-question with no state", () => {
      const actions = decide(input({ text: "do the thing" }))
      expect(actions).toEqual([])
    })
  })
})

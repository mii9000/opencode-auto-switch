import { describe, expect, it, vi } from "vitest"
import { createWitness } from "./witness"

/**
 * Witness tests (docs/ae/2026-11-08-auto-plan-mode/PLAN.md, Task 5, AC-1 and
 * AC-7): dedupe semantics of the session set, the onChange unsubscribe, and
 * removal (the toast filter follows the sessions the TUI still displays).
 */

describe("witness", () => {
  it("AC-1: dedupes — the same id added twice returns true then false, keeps one snapshot entry, and fires the change callback exactly once", () => {
    const witness = createWitness()
    const changed = vi.fn()
    witness.onChange(changed)

    const first = witness.add("ses_1")
    const second = witness.add("ses_1")

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(witness.snapshot()).toEqual(["ses_1"])
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it("AC-7: unsubscribing from onChange stops change callbacks for later adds", () => {
    const witness = createWitness()
    const changed = vi.fn()
    const unsubscribe = witness.onChange(changed)

    expect(witness.add("ses_a")).toBe(true)
    unsubscribe()
    expect(witness.add("ses_b")).toBe(true)

    expect(changed).toHaveBeenCalledTimes(1)
    const snapshot = witness.snapshot()
    expect(snapshot).toHaveLength(2)
    expect(snapshot).toContain("ses_a")
    expect(snapshot).toContain("ses_b")
  })

  it("remove forgets a session without firing change callbacks (the server set never shrinks)", () => {
    const witness = createWitness()
    const changed = vi.fn()
    witness.onChange(changed)

    witness.add("ses_1")
    expect(witness.has("ses_1")).toBe(true)
    witness.remove("ses_1")

    expect(witness.has("ses_1")).toBe(false)
    expect(witness.snapshot()).toEqual([])
    expect(changed).toHaveBeenCalledTimes(1)
  })
})

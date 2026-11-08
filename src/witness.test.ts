import { describe, expect, it, vi } from "vitest"

/**
 * Witness tests (docs/ae/2026-11-08-auto-plan-mode/PLAN.md, Task 5, AC-1 and
 * AC-7): dedupe semantics of the session set and the onChange unsubscribe.
 */

/** The contract src/witness.ts must export. */
interface Witness {
  add(sessionID: string): boolean
  snapshot(): string[]
  onChange(cb: () => void): () => void
}

// src/witness.ts does not exist yet — the runtime import failure below IS this
// file's red state. The specifier is deliberately widened to `string` so
// `npm run typecheck` stays green (no TS2307) until the implementation lands.
const witnessModuleSpecifier: string = "./witness"

async function createWitness(): Promise<Witness> {
  const module = (await import(witnessModuleSpecifier)) as {
    createWitness: () => Witness
  }
  return module.createWitness()
}

describe("witness", () => {
  it("AC-1: dedupes — the same id added twice returns true then false, keeps one snapshot entry, and fires the change callback exactly once", async () => {
    const witness = await createWitness()
    const changed = vi.fn()
    witness.onChange(changed)

    const first = witness.add("ses_1")
    const second = witness.add("ses_1")

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(witness.snapshot()).toEqual(["ses_1"])
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it("AC-7: unsubscribing from onChange stops change callbacks for later adds", async () => {
    const witness = await createWitness()
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
})

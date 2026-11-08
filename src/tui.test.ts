import { describe, expect, it, vi } from "vitest"
import * as tuiModule from "../src/tui"
import { AutoPlanRpc } from "../src/rpc"
import {
  createFakeTuiCtx,
  firstSlot,
  pushes,
  renderFooter,
  rpcBinding,
  settle,
  switchedEvent,
  type FakeTuiCtx,
} from "../test/tui-fakes"

/**
 * TUI wiring tests (docs/ae/2026-11-08-auto-plan-mode/PLAN.md, Task 5, AC-2
 * through AC-6): run the plugin's setup against the fake TUI context, then
 * drive slot renders, tab snapshots, reconnects and switched events, and
 * assert on the recorded reportSessions pushes and toast calls.
 */

/** The default export src/tui.ts must expose. */
interface TuiPluginDefinition {
  id: string
  setup: (
    context: unknown,
  ) =>
    | Promise<(() => Promise<void> | void) | void>
    | (() => Promise<void> | void)
    | void
}

/** The default export of src/tui.ts (undefined while it is a placeholder). */
function plugin(): TuiPluginDefinition | undefined {
  return (tuiModule as unknown as { default?: TuiPluginDefinition }).default
}

/** Run setup against the fake ctx, after asserting the plugin is wired. */
async function setup(
  fake: FakeTuiCtx,
): Promise<(() => Promise<void> | void) | undefined> {
  const definition = plugin()
  expect(
    definition,
    "src/tui.ts must default-export Plugin.define({ id: 'auto-plan-tui', setup })",
  ).toBeDefined()
  expect(definition!.id, "TUI plugin id must be 'auto-plan-tui'").toBe("auto-plan-tui")
  expect(
    typeof definition!.setup,
    "TUI plugin must export a setup(context) function",
  ).toBe("function")
  const cleanup = await definition!.setup(fake)
  return (cleanup ?? undefined) as (() => Promise<void> | void) | undefined
}

describe("witnessing and pushes", () => {
  it("AC-2: a slot render with a sessionID records it into exactly one push; a render with an undefined sessionID adds nothing", async () => {
    const fake = createFakeTuiCtx()
    await setup(fake)

    expect(
      fake.ui.slot,
      "plugin must claim a slot via context.ui.slot(...)",
    ).toHaveBeenCalledTimes(1)
    expect(firstSlot(fake).claim.append).toBe("prompt.footer")
    expect(
      rpcBinding(fake).definition,
      "pushes must go through context.client.rpc(AutoPlanRpc)",
    ).toBe(AutoPlanRpc)

    renderFooter(fake, "ses_1")
    await vi.waitFor(() => {
      const matching = pushes(fake).filter((p) => p.sessionIDs.includes("ses_1"))
      expect(matching).toHaveLength(1)
      expect(matching[0]).toEqual({ sessionIDs: ["ses_1"] })
    })

    const totalBefore = pushes(fake).length
    renderFooter(fake, undefined)
    await settle()
    expect(
      pushes(fake),
      "a render without a sessionID must not cause a new push",
    ).toHaveLength(totalBefore)
  })

  it("AC-3: the initial tabs.list snapshot is pushed at setup, and invoking the server.connected handler pushes again", async () => {
    const fake = createFakeTuiCtx()
    fake.ui.tabs.list.mockReturnValue([{ sessionID: "tab_1" }])
    await setup(fake)

    await vi.waitFor(() => expect(pushes(fake)).toHaveLength(1))
    expect(pushes(fake)[0]).toEqual({ sessionIDs: ["tab_1"] })

    expect(
      fake.data.on,
      "plugin must subscribe via context.data.on('server.connected', ...)",
    ).toHaveBeenCalledWith("server.connected", expect.any(Function))

    fake.data.dispatch("server.connected", { type: "server.connected" })
    await vi.waitFor(() => expect(pushes(fake)).toHaveLength(2))
    expect(pushes(fake)[1]).toEqual({ sessionIDs: ["tab_1"] })
  })

  it("AC-5: five witness adds in one tick coalesce into exactly one push containing all five ids", async () => {
    const fake = createFakeTuiCtx()
    await setup(fake)

    for (const id of ["ses_1", "ses_2", "ses_3", "ses_4", "ses_5"]) {
      renderFooter(fake, id)
    }

    await vi.waitFor(() => {
      const burst = pushes(fake).filter((p) => p.sessionIDs.includes("ses_1"))
      expect(burst).toHaveLength(1)
      expect([...burst[0].sessionIDs].sort()).toEqual([
        "ses_1",
        "ses_2",
        "ses_3",
        "ses_4",
        "ses_5",
      ])
    })
  })
})

describe("switched toasts", () => {
  it("AC-4: a switched event with reason 'question' toasts the plan-mode message exactly once", async () => {
    const fake = createFakeTuiCtx()
    await setup(fake)
    renderFooter(fake, "ses_1")

    await vi.waitFor(() =>
      expect(rpcBinding(fake).subscriberCount("switched")).toBeGreaterThan(0),
    )
    rpcBinding(fake).dispatch(
      "switched",
      switchedEvent({ sessionID: "ses_1", from: "build", to: "plan", reason: "question" }),
    )

    expect(fake.ui.toast.show).toHaveBeenCalledTimes(1)
    expect(fake.ui.toast.show).toHaveBeenCalledWith({
      title: "auto-plan",
      message: 'Plan mode — prompt ended with "?"',
      variant: "info",
    })
  })

  it("AC-4: a switched event with reason 'restore' toasts 'Restored <to>' exactly once", async () => {
    const fake = createFakeTuiCtx()
    await setup(fake)
    renderFooter(fake, "ses_1")

    await vi.waitFor(() =>
      expect(rpcBinding(fake).subscriberCount("switched")).toBeGreaterThan(0),
    )
    rpcBinding(fake).dispatch(
      "switched",
      switchedEvent({ sessionID: "ses_1", from: "plan", to: "build", reason: "restore" }),
    )

    expect(fake.ui.toast.show).toHaveBeenCalledTimes(1)
    expect(fake.ui.toast.show).toHaveBeenCalledWith({
      title: "auto-plan",
      message: "Restored build",
      variant: "info",
    })
  })

  it("AC-7: a switched event for a session this TUI does not witness does not toast", async () => {
    const fake = createFakeTuiCtx()
    await setup(fake)
    renderFooter(fake, "ses_1")

    await vi.waitFor(() =>
      expect(rpcBinding(fake).subscriberCount("switched")).toBeGreaterThan(0),
    )
    rpcBinding(fake).dispatch(
      "switched",
      switchedEvent({ sessionID: "ses_other", from: "build", to: "plan", reason: "question" }),
    )
    expect(fake.ui.toast.show).not.toHaveBeenCalled()

    // The filter is per-session, not a blanket mute.
    rpcBinding(fake).dispatch(
      "switched",
      switchedEvent({ sessionID: "ses_1", from: "build", to: "plan", reason: "question" }),
    )
    expect(fake.ui.toast.show).toHaveBeenCalledTimes(1)
  })

  it("AC-7: a closed tab's session stops earning toasts", async () => {
    const fake = createFakeTuiCtx()
    fake.ui.tabs.enabled.mockReturnValue(true)
    fake.ui.tabs.list.mockReturnValue([{ sessionID: "tab_1" }])
    await setup(fake)

    await vi.waitFor(() =>
      expect(rpcBinding(fake).subscriberCount("switched")).toBeGreaterThan(0),
    )
    rpcBinding(fake).dispatch(
      "switched",
      switchedEvent({ sessionID: "tab_1", from: "build", to: "plan", reason: "question" }),
    )
    expect(fake.ui.toast.show).toHaveBeenCalledTimes(1)

    // The tab closes and the TUI navigates away: the session no longer earns
    // toasts from this TUI.
    fake.ui.tabs.list.mockReturnValue([])
    renderFooter(fake, undefined)
    rpcBinding(fake).dispatch(
      "switched",
      switchedEvent({ sessionID: "tab_1", from: "plan", to: "build", reason: "restore" }),
    )
    expect(fake.ui.toast.show).toHaveBeenCalledTimes(1)
  })

  it("AC-4: with no switched event delivered, no toast call occurs", async () => {
    const fake = createFakeTuiCtx()
    await setup(fake)
    await settle()

    expect(fake.ui.toast.show).not.toHaveBeenCalled()
  })
})

describe("cleanup", () => {
  it("AC-6: cleanup unclaims the slot, unsubscribes both listeners, and flushes a pending push exactly once", async () => {
    const fake = createFakeTuiCtx()
    fake.ui.tabs.list.mockReturnValue([{ sessionID: "tab_1" }])
    const cleanup = await setup(fake)
    await vi.waitFor(() => expect(pushes(fake)).toHaveLength(1))

    // Schedule a coalesced push, then run cleanup in the SAME tick — so only
    // the cleanup flush can deliver it.
    renderFooter(fake, "ses_9")
    expect(cleanup, "setup must return a cleanup function").toBeTypeOf("function")
    await cleanup!()

    // The pending push was flushed exactly once, with the full snapshot.
    await vi.waitFor(() => {
      const flushed = pushes(fake).filter((p) => p.sessionIDs.includes("ses_9"))
      expect(flushed).toHaveLength(1)
      expect(flushed[0].sessionIDs).toEqual(["tab_1", "ses_9"])
    })
    await settle()
    expect(
      pushes(fake).filter((p) => p.sessionIDs.includes("ses_9")),
      "the flushed push must not repeat",
    ).toHaveLength(1)

    // The slot is unclaimed.
    expect(firstSlot(fake).unclaim).toHaveBeenCalledTimes(1)

    // The switched listener is unsubscribed: dispatching is a no-op for toasts.
    expect(rpcBinding(fake).subscriberCount("switched")).toBe(0)
    rpcBinding(fake).dispatch(
      "switched",
      switchedEvent({ sessionID: "ses_1", from: "build", to: "plan", reason: "question" }),
    )
    expect(fake.ui.toast.show).not.toHaveBeenCalled()

    // The server.connected listener is unsubscribed: no push afterwards.
    expect(fake.data.subscriberCount("server.connected")).toBe(0)
    fake.data.dispatch("server.connected", { type: "server.connected" })
    await settle()
    expect(pushes(fake), "no push may happen after cleanup").toHaveLength(2)
  })
})

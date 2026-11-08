import { afterEach, describe, expect, it, vi } from "vitest"
import plugin from "../src/index"
import {
  createFakeCtx,
  newPromptEvent,
  seedSession,
  type FakeCtx,
  type FakePromptEvent,
  type FakePromptHandler,
} from "../test/fakes"

// Wiring tests for the server plugin (docs/ae/2026-11-08-auto-plan-mode/PLAN.md,
// Task 4): run the plugin's setup against typed fakes, then drive the captured
// "prompt" hook and assert on the recorded session/rpc calls.

/** Run the plugin's setup against the fake ctx (the host types ctx loosely). */
async function setup(fake: FakeCtx) {
  return await plugin.setup(fake as unknown as Parameters<typeof plugin.setup>[0])
}

/** Witness sessions through the plugin's registered reportSessions handler. */
async function witness(fake: FakeCtx, sessionIDs: string[]) {
  expect(
    fake.rpc.handlers.reportSessions,
    "plugin did not register RPC handlers via ctx.rpc.register(AutoPlanRpc, ...)",
  ).toBeDefined()
  await fake.rpc.handlers.reportSessions!({ sessionIDs })
}

/** The prompt handler captured by ctx.session.hook("prompt", ...). */
function promptHandler(fake: FakeCtx): FakePromptHandler {
  expect(
    fake.session.hooks.prompt,
    "plugin did not register a session hook via ctx.session.hook('prompt', ...)",
  ).toBeDefined()
  return fake.session.hooks.prompt!
}

/** Drive the captured prompt hook with one event and return that event. */
async function drivePrompt(
  fake: FakeCtx,
  input: { sessionID: string; text: string; messageID?: string },
): Promise<FakePromptEvent> {
  const event = newPromptEvent(input)
  await promptHandler(fake)(event)
  return event
}

/** Every ("switched", payload) emit recorded by the fake rpc registration. */
function emitted(fake: FakeCtx): Array<[string, Record<string, unknown>]> {
  return fake.rpc.registration.events.emit.mock.calls as Array<
    [string, Record<string, unknown>]
  >
}

describe("auto-plan server plugin", () => {
  describe("AC-1: witnessed build session asking a question switches to plan", () => {
    it("switches to plan, remembers the agent in metadata, and emits once", async () => {
      const fake = createFakeCtx()
      seedSession(fake, "ses_1", { agent: "build" })
      await setup(fake)
      await witness(fake, ["ses_1"])

      await drivePrompt(fake, { sessionID: "ses_1", text: "why?" })

      expect(fake.session.switchAgent).toHaveBeenCalledTimes(1)
      expect(fake.session.switchAgent).toHaveBeenCalledWith({ sessionID: "ses_1", agent: "plan" })
      const record = fake.session.sessions.get("ses_1")
      expect(record?.metadata?.["opencode-auto-plan"]).toEqual({ agent: "build" })
      expect(fake.rpc.registration.events.emit).toHaveBeenCalledTimes(1)
      expect(fake.rpc.registration.events.emit).toHaveBeenCalledWith(
        "switched",
        { sessionID: "ses_1", from: "build", to: "plan", reason: "question" },
      )
    })
  })

  describe("AC-2: the next non-question prompt restores the remembered agent", () => {
    it("switches back, strips only the state key, and emits one restore", async () => {
      const fake = createFakeCtx()
      seedSession(fake, "ses_1", { agent: "build", metadata: { title: "x" } })
      await setup(fake)
      await witness(fake, ["ses_1"])

      await drivePrompt(fake, { sessionID: "ses_1", text: "why?" })
      await drivePrompt(fake, { sessionID: "ses_1", text: "summarize", messageID: "msg_2" })

      expect(fake.session.switchAgent).toHaveBeenNthCalledWith(2, {
        sessionID: "ses_1",
        agent: "build",
      })
      const record = fake.session.sessions.get("ses_1")
      expect(record?.metadata).toEqual({ title: "x" })
      const restores = emitted(fake).filter(([, payload]) => payload.reason === "restore")
      expect(restores).toEqual([
        ["switched", { sessionID: "ses_1", from: "plan", to: "build", reason: "restore" }],
      ])
    })
  })

  describe("AC-3: sessions that must never be acted on", () => {
    it("fetches but never acts on a witnessed child session", async () => {
      const fake = createFakeCtx()
      seedSession(fake, "ses_child", { parentID: "ses_parent" })
      await setup(fake)
      await witness(fake, ["ses_child"])

      await drivePrompt(fake, { sessionID: "ses_child", text: "why?" })

      expect(fake.session.get).toHaveBeenCalledWith({ sessionID: "ses_child" })
      expect(fake.session.switchAgent).not.toHaveBeenCalled()
      expect(fake.session.update).not.toHaveBeenCalled()
      expect(fake.rpc.registration.events.emit).not.toHaveBeenCalled()
    })

    it("never touches an unwitnessed session — not even a fetch (AC-3, AC-7)", async () => {
      const fake = createFakeCtx()
      seedSession(fake, "ses_1", { agent: "build" })
      await setup(fake)
      await witness(fake, ["ses_1"])

      await drivePrompt(fake, { sessionID: "ses_2", text: "why?" })

      expect(fake.session.get).not.toHaveBeenCalledWith({ sessionID: "ses_2" })
      expect(fake.session.switchAgent).not.toHaveBeenCalled()
      expect(fake.session.update).not.toHaveBeenCalled()
      expect(fake.rpc.registration.events.emit).not.toHaveBeenCalled()
    })
  })

  describe("AC-4: witnessed plan session with no state stays quiet", () => {
    it("takes zero side effects on a question", async () => {
      const fake = createFakeCtx()
      seedSession(fake, "ses_1", { agent: "plan" })
      await setup(fake)
      await witness(fake, ["ses_1"])

      await drivePrompt(fake, { sessionID: "ses_1", text: "why?" })

      expect(fake.session.switchAgent).not.toHaveBeenCalled()
      expect(fake.session.update).not.toHaveBeenCalled()
      expect(fake.rpc.registration.events.emit).not.toHaveBeenCalled()
    })
  })

  describe("AC-5: user moved the agent manually — plugin clears state only", () => {
    async function clearedAfter(text: string): Promise<FakeCtx> {
      const fake = createFakeCtx()
      seedSession(fake, "ses_1", {
        agent: "review",
        metadata: { "opencode-auto-plan": { agent: "build" } },
      })
      await setup(fake)
      await witness(fake, ["ses_1"])
      await drivePrompt(fake, { sessionID: "ses_1", text })
      return fake
    }

    it("clears state on a question without switching or emitting", async () => {
      const fake = await clearedAfter("why?")

      expect(fake.session.update).toHaveBeenCalledTimes(1)
      expect(fake.session.update).toHaveBeenCalledWith({ sessionID: "ses_1", metadata: {} })
      expect(fake.session.switchAgent).not.toHaveBeenCalled()
      expect(fake.rpc.registration.events.emit).not.toHaveBeenCalled()
    })

    it("clears state on a non-question without switching or emitting", async () => {
      const fake = await clearedAfter("ok")

      expect(fake.session.update).toHaveBeenCalledTimes(1)
      expect(fake.session.update).toHaveBeenCalledWith({ sessionID: "ses_1", metadata: {} })
      expect(fake.session.switchAgent).not.toHaveBeenCalled()
      expect(fake.rpc.registration.events.emit).not.toHaveBeenCalled()
    })
  })

  describe("AC-6: the hook never rejects and never edits the prompt draft", () => {
    /** Capture console.warn so failures are observable and quiet. */
    function spyWarn() {
      return vi.spyOn(console, "warn").mockImplementation(() => {})
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    async function witnessedBuildSession(): Promise<FakeCtx> {
      const fake = createFakeCtx()
      seedSession(fake, "ses_1", { agent: "build" })
      await setup(fake)
      await witness(fake, ["ses_1"])
      return fake
    }

    it("resolves when ctx.session.get rejects, warns, and leaves the draft untouched", async () => {
      const warnSpy = spyWarn()
      const fake = await witnessedBuildSession()
      fake.session.get.mockRejectedValueOnce(new Error("storage unavailable"))

      const event = newPromptEvent({ sessionID: "ses_1", text: "why?" })
      await expect(promptHandler(fake)(event)).resolves.toBeUndefined()

      expect(fake.session.switchAgent).not.toHaveBeenCalled()
      expect(event.prompt.text).toBe("why?")
      expect(warnSpy).toHaveBeenCalled()
    })

    it("resolves when switchAgent rejects, warns, and stops before further side effects", async () => {
      const warnSpy = spyWarn()
      const fake = await witnessedBuildSession()
      fake.session.switchAgent.mockRejectedValueOnce(new Error("switch failed"))

      const event = newPromptEvent({ sessionID: "ses_1", text: "why?" })
      await expect(promptHandler(fake)(event)).resolves.toBeUndefined()

      expect(fake.session.update).not.toHaveBeenCalled()
      expect(fake.rpc.registration.events.emit).not.toHaveBeenCalled()
      expect(event.prompt.text).toBe("why?")
      expect(warnSpy).toHaveBeenCalled()
    })

    it("resolves when the switched emit rejects, and warns", async () => {
      const warnSpy = spyWarn()
      const fake = await witnessedBuildSession()
      fake.rpc.registration.events.emit.mockRejectedValueOnce(new Error("rpc down"))

      const event = newPromptEvent({ sessionID: "ses_1", text: "why?" })
      await expect(promptHandler(fake)(event)).resolves.toBeUndefined()

      expect(event.prompt.text).toBe("why?")
      expect(warnSpy).toHaveBeenCalled()
    })
  })

  it("returns a cleanup that disposes the RPC registration", async () => {
    const fake = createFakeCtx()

    const cleanup = await setup(fake)

    expect(cleanup).toBeTypeOf("function")
    await cleanup?.()
    expect(fake.rpc.registration.dispose).toHaveBeenCalledTimes(1)
  })
})

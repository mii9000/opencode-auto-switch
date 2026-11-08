import { vi, type Mock } from "vitest"

/**
 * Typed in-memory fakes for the slice of the plugin `Context` that the
 * auto-plan server plugin touches: `ctx.session` (get / switchAgent / update /
 * hook) and `ctx.rpc` (register). The fake is deliberately NOT shaped like the
 * real `Context` — the test casts it through `unknown` at the setup boundary —
 * so only the members the plugin actually uses are modelled here.
 */

/** Mutable session record backing the fake `get`; tests seed these directly. */
export interface FakeSessionRecord {
  agent?: string
  parentID?: string
  metadata?: Record<string, unknown>
}

/** Prompt-event shape the plugin's session "prompt" hook is driven with. */
export interface FakePromptEvent {
  sessionID: string
  messageID: string
  prompt: { text: string }
  metadata?: Record<string, unknown>
  delivery: "steer" | "queue"
}

export type FakePromptHandler = (event: FakePromptEvent) => Promise<void> | void

export interface FakeHookRegistration {
  dispose: Mock<() => Promise<void>>
}

export interface FakeRpcHandlers {
  reportSessions?: (
    input: { sessionIDs: readonly string[] },
    context?: unknown,
  ) => Promise<unknown>
}

export interface FakeRpcRegistration {
  events: { emit: Mock<(event: string, payload: unknown) => Promise<void>> }
  dispose: Mock<() => Promise<void>>
}

export interface FakeSession {
  /** Backing store for `get` — mutate via `seedSession`. */
  sessions: Map<string, FakeSessionRecord>
  /** Hook handlers captured by `hook(name, handler)`, keyed by hook name. */
  hooks: { prompt?: FakePromptHandler }
  get: Mock<(input: { sessionID: string }) => Promise<FakeSessionRecord>>
  switchAgent: Mock<(input: { sessionID: string; agent: string }) => Promise<void>>
  update: Mock<(input: { sessionID: string; metadata?: Record<string, unknown> }) => Promise<void>>
  hook: Mock<(name: string, handler: FakePromptHandler) => Promise<FakeHookRegistration>>
}

export interface FakeRpc {
  register: Mock<
    (definition: unknown, handlers: FakeRpcHandlers) => Promise<FakeRpcRegistration>
  >
  /** Handlers captured by `register`; populated once setup has run. */
  handlers: FakeRpcHandlers
  /** Registration object `register` resolved with. */
  registration: FakeRpcRegistration
}

export interface FakeCtx {
  session: FakeSession
  rpc: FakeRpc
}

/** Build a fresh fake plugin context with empty session state and spies. */
export function createFakeCtx(): FakeCtx {
  const sessions = new Map<string, FakeSessionRecord>()
  const hooks: { prompt?: FakePromptHandler } = {}

  const registration: FakeRpcRegistration = {
    events: {
      emit: vi.fn(async (_event: string, _payload: unknown) => {}),
    },
    dispose: vi.fn(async () => {}),
  }

  const handlers: FakeRpcHandlers = {}

  const session: FakeSession = {
    sessions,
    hooks,
    get: vi.fn(async (input: { sessionID: string }) => {
      const record = sessions.get(input.sessionID)
      if (!record) throw new Error(`fake session store: no record for ${input.sessionID}`)
      return record
    }),
    // Records the call AND mutates the record, so later `get`s reflect it —
    // the same observable behavior the real session store has.
    switchAgent: vi.fn(async (input: { sessionID: string; agent: string }) => {
      const record = sessions.get(input.sessionID)
      if (!record) throw new Error(`fake session store: no record for ${input.sessionID}`)
      record.agent = input.agent
    }),
    update: vi.fn(async (input: { sessionID: string; metadata?: Record<string, unknown> }) => {
      const record = sessions.get(input.sessionID)
      if (!record) throw new Error(`fake session store: no record for ${input.sessionID}`)
      record.metadata = input.metadata
    }),
    hook: vi.fn(async (name: string, handler: FakePromptHandler) => {
      if (name === "prompt") hooks.prompt = handler
      return { dispose: vi.fn(async () => {}) }
    }),
  }

  const rpc: FakeRpc = {
    handlers,
    registration,
    register: vi.fn(async (_definition: unknown, registered: FakeRpcHandlers) => {
      Object.assign(handlers, registered)
      return registration
    }),
  }

  return { session, rpc }
}

/** Seed (or replace) the session record a sessionID resolves to. */
export function seedSession(
  fake: FakeCtx,
  sessionID: string,
  record: FakeSessionRecord,
): FakeSessionRecord {
  fake.session.sessions.set(sessionID, record)
  return record
}

/** Build one prompt event like the object the host hands the "prompt" hook. */
export function newPromptEvent(input: {
  sessionID: string
  text: string
  messageID?: string
  metadata?: Record<string, unknown>
}): FakePromptEvent {
  return {
    sessionID: input.sessionID,
    messageID: input.messageID ?? "msg_1",
    prompt: { text: input.text },
    metadata: input.metadata,
    delivery: "steer",
  }
}

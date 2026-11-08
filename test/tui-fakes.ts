import { vi, type Mock } from "vitest"

/**
 * Typed in-memory fakes for the slice of the TUI plugin `Context` that the
 * auto-plan TUI plugin touches (docs/ae/2026-11-08-auto-plan-mode/PLAN.md,
 * Task 5): `context.client` (rpc client + rpc event subscription),
 * `context.ui` (slot claim, tabs.list, toast.show) and `context.data`
 * (`server.connected` subscription). Deliberately NOT shaped like the real
 * `Context` — tests cast it through `unknown` at the setup boundary — so only
 * the members the plugin actually uses are modelled here.
 *
 * Event delivery goes through the `dispatch` helpers, which only invoke
 * handlers that are STILL subscribed — host semantics. That is what the
 * cleanup test (AC-6) leans on: after unsubscribing, a dispatch is a no-op.
 */

/** Render input the host hands a `prompt.footer` slot contribution. */
export interface FakeSlotRenderInput {
  sessionID?: string
  mode: "normal" | "shell"
  showDetails: boolean
}

/** The slot-claim object `context.ui.slot(...)` is called with. */
export interface FakeSlotClaim {
  append: string
  render: (input: FakeSlotRenderInput) => unknown
}

/** A claimed slot together with the unclaim spy `slot(...)` returned. */
export interface FakeSlotRecord {
  claim: FakeSlotClaim
  unclaim: Mock<() => void>
}

/** Toast payload recorded by the fake `ui.toast.show`. */
export interface FakeToastOptions {
  title: string
  message: string
  variant: string
}

/** Data of the `switched` rpc event (src/rpc.ts AutoPlanRpc contract). */
export interface FakeSwitchedData {
  sessionID: string
  from: string
  to: string
  reason: "question" | "restore"
}

/** One `client.rpc(definition)` binding — cached per definition by the fake. */
export interface FakeRpcBinding {
  /** The definition passed to client.rpc (expected: AutoPlanRpc). */
  definition: unknown
  reportSessions: Mock<(input: { sessionIDs: string[] }) => Promise<void>>
  events: {
    on: Mock<(name: string, handler: (event: unknown) => void) => () => void>
  }
  /** Deliver an event to the handlers still subscribed (host semantics). */
  dispatch(name: string, event: unknown): void
  /** Number of handlers currently subscribed to the named event. */
  subscriberCount(name: string): number
}

/** The `context.data` slice: typed+handler recording with host semantics. */
export interface FakeData {
  on: Mock<(type: string, handler: (event: unknown) => void) => () => void>
  /** Deliver an event to the handlers still subscribed (host semantics). */
  dispatch(type: string, event: unknown): void
  /** Number of handlers currently subscribed to the named event type. */
  subscriberCount(type: string): number
}

export interface FakeTuiCtx {
  client: {
    /** Bindings handed out so far, in creation order (cached per definition). */
    bindings: FakeRpcBinding[]
    rpc: Mock<(definition: unknown) => FakeRpcBinding>
  }
  ui: {
    /** Every slot claim made so far, in claim order. */
    slots: FakeSlotRecord[]
    slot: Mock<(claim: FakeSlotClaim) => Mock<() => void>>
    tabs: { list: Mock<() => Array<{ sessionID: string }>> }
    toast: { show: Mock<(options: FakeToastOptions) => void> }
  }
  data: FakeData
}

/** Build one rpc binding: records reportSessions payloads + subscriptions. */
export function createFakeRpcBinding(definition: unknown): FakeRpcBinding {
  const subscribers = new Map<string, Set<(event: unknown) => void>>()

  const on = (name: string, handler: (event: unknown) => void): (() => void) => {
    let set = subscribers.get(name)
    if (!set) {
      set = new Set()
      subscribers.set(name, set)
    }
    set.add(handler)
    return vi.fn(() => {
      set.delete(handler)
    })
  }

  return {
    definition,
    reportSessions: vi.fn(async (_input: { sessionIDs: string[] }) => {}),
    events: { on: vi.fn(on) },
    dispatch(name: string, event: unknown): void {
      const set = subscribers.get(name)
      if (!set) return
      for (const handler of [...set]) handler(event)
    },
    subscriberCount(name: string): number {
      return subscribers.get(name)?.size ?? 0
    },
  }
}

/** Build the fake `context.data` slice. */
export function createFakeData(): FakeData {
  const subscribers = new Map<string, Set<(event: unknown) => void>>()

  const on = (type: string, handler: (event: unknown) => void): (() => void) => {
    let set = subscribers.get(type)
    if (!set) {
      set = new Set()
      subscribers.set(type, set)
    }
    set.add(handler)
    return vi.fn(() => {
      set.delete(handler)
    })
  }

  return {
    on: vi.fn(on),
    dispatch(type: string, event: unknown): void {
      const set = subscribers.get(type)
      if (!set) return
      for (const handler of [...set]) handler(event)
    },
    subscriberCount(type: string): number {
      return subscribers.get(type)?.size ?? 0
    },
  }
}

/** Build a fresh fake TUI context with empty state and spies. */
export function createFakeTuiCtx(): FakeTuiCtx {
  const bindings: FakeRpcBinding[] = []
  const bindingsByDefinition = new Map<unknown, FakeRpcBinding>()
  const slots: FakeSlotRecord[] = []

  return {
    client: {
      bindings,
      // Cached per definition so repeated rpc(definition) calls share one
      // recorded binding — pushes and subscriptions stay visible across tests.
      rpc: vi.fn((definition: unknown) => {
        let binding = bindingsByDefinition.get(definition)
        if (!binding) {
          binding = createFakeRpcBinding(definition)
          bindingsByDefinition.set(definition, binding)
          bindings.push(binding)
        }
        return binding
      }),
    },
    ui: {
      slots,
      slot: vi.fn((claim: FakeSlotClaim) => {
        const unclaim = vi.fn((): void => {})
        slots.push({ claim, unclaim })
        return unclaim
      }),
      tabs: {
        list: vi.fn((): Array<{ sessionID: string }> => []),
      },
      toast: {
        show: vi.fn((_options: FakeToastOptions) => {}),
      },
    },
    data: createFakeData(),
  }
}

/** The first slot claim the plugin made — throws if it never claimed one. */
export function firstSlot(fake: FakeTuiCtx): FakeSlotRecord {
  const record = fake.ui.slots[0]
  if (!record) {
    throw new Error(
      "plugin did not claim a slot via ctx.ui.slot({ append: 'prompt.footer', render })",
    )
  }
  return record
}

/** The rpc binding the plugin pushes through — throws before any rpc() call. */
export function rpcBinding(fake: FakeTuiCtx): FakeRpcBinding {
  const binding = fake.client.bindings[0]
  if (!binding) {
    throw new Error("plugin never created an rpc client via ctx.client.rpc(...)")
  }
  return binding
}

/** Every reportSessions payload recorded so far, in push order. */
export function pushes(fake: FakeTuiCtx): Array<{ sessionIDs: string[] }> {
  return rpcBinding(fake).reportSessions.mock.calls.map((call) => call[0])
}

/** Invoke the prompt.footer slot render the plugin contributed. */
export function renderFooter(fake: FakeTuiCtx, sessionID: string | undefined): void {
  firstSlot(fake).claim.render({ sessionID, mode: "normal", showDetails: false })
}

/** One `switched` rpc event, shaped like the host delivers it. */
export function switchedEvent(data: FakeSwitchedData): {
  type: string
  data: FakeSwitchedData
  location: Record<string, never>
} {
  return { type: "rpc.auto-plan.switched", data, location: {} }
}

/** Let every pending microtask and timer settle (for "no more push" checks). */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

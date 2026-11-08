import { Plugin } from "@opencode/plugin"
import { AutoPlanRpc } from "./rpc"
import { decide, type Action } from "./state"

const STATE_KEY = "opencode-auto-plan"
const PLAN_AGENT = "plan"
const DEFAULT_AGENT = "build"

interface SessionState {
  agent: string
}

/** The plugin's metadata state for one session; absence means no owed restore. */
function stateOf(metadata: Record<string, unknown> | undefined): SessionState | undefined {
  return metadata?.[STATE_KEY] as SessionState | undefined
}

export default Plugin.define({
  id: "auto-plan",
  async setup(ctx) {
    type SessionMetadata = NonNullable<Awaited<ReturnType<typeof ctx.session.get>>["metadata"]>

    function withoutState(metadata: SessionMetadata | undefined): SessionMetadata | undefined {
      if (metadata === undefined) return undefined
      return Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== STATE_KEY))
    }

    // Sessions witnessed by a TUI part (pushed over RPC). Unwitnessed
    // sessions — opencode run, SDK, subagents — are never touched.
    const witnessed = new Set<string>()

    const registration = await ctx.rpc.register(AutoPlanRpc, {
      reportSessions: async (input) => {
        for (const sessionID of input.sessionIDs) witnessed.add(sessionID)
      },
    })

    async function executeAction(sessionID: string, info: Awaited<ReturnType<typeof ctx.session.get>>, action: Action): Promise<void> {
      switch (action.type) {
        case "switch-to-plan": {
          await ctx.session.switchAgent({ sessionID, agent: PLAN_AGENT })
          await ctx.session.update({
            sessionID,
            metadata: { ...info.metadata, [STATE_KEY]: { agent: action.rememberedAgent } },
          })
          await registration.events.emit("switched", {
            sessionID,
            from: action.rememberedAgent,
            to: PLAN_AGENT,
            reason: "question",
          })
          return
        }
        case "restore": {
          await ctx.session.switchAgent({ sessionID, agent: action.agent })
          await ctx.session.update({ sessionID, metadata: withoutState(info.metadata) })
          await registration.events.emit("switched", {
            sessionID,
            from: PLAN_AGENT,
            to: action.agent,
            reason: "restore",
          })
          return
        }
        case "clear-state": {
          await ctx.session.update({ sessionID, metadata: withoutState(info.metadata) })
        }
      }
    }

    await ctx.session.hook("prompt", async (event) => {
      try {
        const { sessionID } = event
        if (!witnessed.has(sessionID)) return

        let info
        try {
          info = await ctx.session.get({ sessionID })
        } catch (error) {
          console.warn("[auto-plan] session fetch failed; prompt left untouched", error)
          return
        }

        const actions = decide({
          text: event.prompt.text,
          witnessed: true,
          parentID: info.parentID,
          agent: info.agent ?? DEFAULT_AGENT,
          remembered: stateOf(info.metadata)?.agent,
        })

        for (const action of actions) {
          try {
            await executeAction(sessionID, info, action)
          } catch (error) {
            console.warn(`[auto-plan] ${action.type} failed; prompt left untouched`, error)
            break
          }
        }
      } catch (error) {
        // A throwing prompt hook blocks prompt admission — degrade instead.
        console.warn("[auto-plan] prompt handling failed; prompt left untouched", error)
      }
    })

    return () => registration.dispose()
  },
})

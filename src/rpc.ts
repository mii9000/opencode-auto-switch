import { Rpc } from "@opencode/plugin/rpc"

/**
 * The plugin's RPC contract: the TUI part reports which sessions it
 * witnesses, and the server part emits `switched` whenever it changes a
 * session's agent.
 */
export const AutoPlanRpc = Rpc.define({
  id: "auto-plan",
  methods: {
    reportSessions: {
      input: {
        type: "object",
        properties: { sessionIDs: { type: "array", items: { type: "string" } } },
        required: ["sessionIDs"],
        additionalProperties: false,
      },
      // shortcut: the 2.2.6 `Method` type requires `output`, but the same-version
      // docs allow omitting it for void methods and `Rpc.define` is a pass-through.
      output: undefined as never,
    },
  },
  events: {
    switched: {
      schema: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          reason: { type: "string", enum: ["question", "restore"] },
        },
        required: ["sessionID", "from", "to", "reason"],
        additionalProperties: false,
      },
    },
  },
})

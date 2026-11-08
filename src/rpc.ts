import { Schema as S } from "effect"
import { Rpc } from "@opencode/plugin/rpc"

// Strict object parsing: the plan pins `additionalProperties: false` on every
// schema; this is the only lever that survives the host's portable
// standard-schema validation path.
const strict = {
  parseOptions: { onExcessProperty: "error" },
} as const

/**
 * The plugin's RPC contract: the TUI part reports which sessions it
 * witnesses, and the server part emits `switched` whenever it changes a
 * session's agent. Effect codecs wrapped in `toStandardSchemaV1` give both
 * parts shared inferred types through the host's portable standard-schema
 * path.
 */
export const AutoPlanRpc = Rpc.define({
  id: "auto-plan",
  methods: {
    reportSessions: {
      input: S.toStandardSchemaV1(S.Struct({ sessionIDs: S.Array(S.String) }), strict),
      output: S.toStandardSchemaV1(S.Void, strict),
    },
  },
  events: {
    switched: {
      schema: S.toStandardSchemaV1(
        S.Struct({
          sessionID: S.String,
          from: S.String,
          to: S.String,
          reason: S.Literals(["question", "restore"]),
        }),
        strict,
      ),
    },
  },
})

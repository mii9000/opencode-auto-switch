import { Schema as S } from "effect"
import { Rpc } from "@opencode/plugin/rpc"

/**
 * The plugin's RPC contract: the TUI part reports which sessions it
 * witnesses, and the server part emits `switched` whenever it changes a
 * session's agent.
 *
 * Ruling: effect codecs wrapped with `toStandardSchemaV1` (not raw JSON
 * Schema) so both parts share inferred types through the host's portable
 * standard-schema path; excess payload keys are tolerated, matching effect's
 * documented decoder default and the host-controlled wire validation.
 */
export const AutoPlanRpc = Rpc.define({
  id: "auto-plan",
  methods: {
    reportSessions: {
      input: S.toStandardSchemaV1(S.Struct({ sessionIDs: S.Array(S.String) })),
      output: S.toStandardSchemaV1(S.Void),
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
      ),
    },
  },
})

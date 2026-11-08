import type { RpcHandlers } from "@opencode/plugin/promise/rpc"
import { AutoPlanRpc } from "../src/rpc"

// Compile-time guard (typecheck-only; vitest does not run this directory):
// fails `npm run typecheck` if the contract's inference ever degrades to
// `unknown` inputs or a non-void handler output — a regression the runtime
// schema tests cannot catch.
export const probe: RpcHandlers<typeof AutoPlanRpc> = {
  reportSessions: async (input) => {
    const ids: ReadonlyArray<string> = input.sessionIDs
    return ids.length === 0 ? undefined : undefined
  },
}

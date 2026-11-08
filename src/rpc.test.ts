import { describe, expect, it } from "vitest"
import { AutoPlanRpc } from "./rpc"

// Contract semantics are asserted through the standard-schema validate path —
// the same interface the RPC host uses for wire validation.
async function issuesOf(
  validate: (value: unknown) => ReturnType<NonNullable<import("@standard-schema/spec").StandardSchemaV1["~standard"]>["validate"]>,
  payload: unknown,
): Promise<boolean> {
  const result = await validate(payload)
  return !!(result && result.issues && result.issues.length > 0)
}

const inputValidate = AutoPlanRpc.methods.reportSessions.input["~standard"].validate
const outputValidate = AutoPlanRpc.methods.reportSessions.output["~standard"].validate
const switchedValidate = AutoPlanRpc.events.switched.schema["~standard"].validate

describe("AutoPlanRpc", () => {
  it("registers the contract under the id 'auto-plan'", () => {
    expect(AutoPlanRpc.id).toBe("auto-plan")
  })

  it("defines reportSessions with input and output schemas", () => {
    expect(AutoPlanRpc.methods.reportSessions.input["~standard"].validate).toBeTypeOf("function")
    expect(AutoPlanRpc.methods.reportSessions.output["~standard"].validate).toBeTypeOf("function")
  })

  it("defines the switched event", () => {
    expect(AutoPlanRpc.events.switched.schema["~standard"].validate).toBeTypeOf("function")
  })
})

describe("reportSessions input schema", () => {
  it("accepts a list of session ids", async () => {
    expect(await issuesOf(inputValidate, { sessionIDs: ["ses_1", "ses_2"] })).toBe(false)
  })

  it("accepts an empty session id list", async () => {
    expect(await issuesOf(inputValidate, { sessionIDs: [] })).toBe(false)
  })

  it("rejects a session id list containing a non-string", async () => {
    expect(await issuesOf(inputValidate, { sessionIDs: [1] })).toBe(true)
  })

  it("rejects a payload without sessionIDs", async () => {
    expect(await issuesOf(inputValidate, {})).toBe(true)
  })

  it("rejects payload keys beyond sessionIDs", async () => {
    expect(await issuesOf(inputValidate, { sessionIDs: [], extra: 1 })).toBe(true)
  })
})

describe("reportSessions output schema", () => {
  it("accepts a void return", async () => {
    expect(await issuesOf(outputValidate, undefined)).toBe(false)
  })
})

describe("switched event schema", () => {
  it("accepts a payload with all four required fields", async () => {
    expect(await issuesOf(switchedValidate, { sessionID: "ses_1", from: "build", to: "plan", reason: "question" })).toBe(false)
  })

  it("accepts the restore reason", async () => {
    expect(await issuesOf(switchedValidate, { sessionID: "ses_1", from: "plan", to: "build", reason: "restore" })).toBe(false)
  })

  it("rejects a payload missing reason", async () => {
    expect(await issuesOf(switchedValidate, { sessionID: "ses_1", from: "build", to: "plan" })).toBe(true)
  })

  it("rejects a reason outside the allowed values", async () => {
    expect(await issuesOf(switchedValidate, { sessionID: "ses_1", from: "build", to: "plan", reason: "other" })).toBe(true)
  })

  it("rejects a non-string field", async () => {
    expect(await issuesOf(switchedValidate, { sessionID: 1, from: "build", to: "plan", reason: "question" })).toBe(true)
  })

  it("rejects payload keys beyond the four defined fields", async () => {
    expect(await issuesOf(switchedValidate, { sessionID: "ses_1", from: "build", to: "plan", reason: "question", x: 1 })).toBe(true)
  })
})

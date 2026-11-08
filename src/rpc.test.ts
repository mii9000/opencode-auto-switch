import { describe, expect, it } from "vitest"
import { AutoPlanRpc } from "./rpc"

// --- Tiny JSON Schema validator (test helper only; no new dependencies) ---

type JsonSchema = {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean | JsonSchema
  items?: JsonSchema
  enum?: unknown[]
}

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string"
    case "number":
      return typeof value === "number"
    case "integer":
      return typeof value === "number" && Number.isInteger(value)
    case "boolean":
      return typeof value === "boolean"
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value)
    case "array":
      return Array.isArray(value)
    case "null":
      return value === null
    default:
      return false
  }
}

function jsonEquals(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

// Returns null when `value` conforms to `schema`, otherwise a failure reason.
function validate(schema: JsonSchema, value: unknown): string | null {
  if (schema.enum !== undefined) {
    const allowed = schema.enum.some((candidate) => jsonEquals(candidate, value))
    if (!allowed) {
      return `value ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`
    }
  }

  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type]
  if (types.length > 0 && !types.some((type) => typeMatches(type, value))) {
    return `value ${JSON.stringify(value)} is not of type ${types.join(" | ")}`
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    for (const [index, item] of value.entries()) {
      const reason = validate(schema.items, item)
      if (reason !== null) return `items[${index}]: ${reason}`
    }
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const properties = schema.properties ?? {}

    for (const name of schema.required ?? []) {
      if (!(name in record)) return `missing required property "${name}"`
    }

    for (const [name, property] of Object.entries(properties)) {
      if (name in record) {
        const reason = validate(property, record[name])
        if (reason !== null) return `${name}: ${reason}`
      }
    }

    if (schema.additionalProperties === false) {
      const extra = Object.keys(record).filter((name) => !(name in properties))
      if (extra.length > 0) return `unexpected properties: ${extra.join(", ")}`
    } else if (typeof schema.additionalProperties === "object" && schema.additionalProperties !== null) {
      for (const name of Object.keys(record)) {
        if (name in properties) continue
        const reason = validate(schema.additionalProperties, record[name])
        if (reason !== null) return `${name}: ${reason}`
      }
    }
  }

  return null
}

function conforms(schema: JsonSchema, value: unknown): boolean {
  return validate(schema, value) === null
}

// --- Local structural view of the (generic JSON) rpc definition ---

type MethodShape = {
  input?: unknown
  output?: unknown
}

type RpcDefinitionShape = {
  id: string
  methods: Record<string, MethodShape | undefined>
  events: Record<string, { schema?: unknown } | undefined>
}

function definition(): RpcDefinitionShape {
  const rpc = AutoPlanRpc as unknown as RpcDefinitionShape | undefined
  expect(rpc, "src/rpc.ts must export AutoPlanRpc").toBeTypeOf("object")
  return rpc as RpcDefinitionShape
}

function reportSessionsInput(): JsonSchema {
  const schema = definition().methods["reportSessions"]?.input
  expect(schema, "reportSessions must define an input schema").toBeTypeOf("object")
  return schema as JsonSchema
}

function switchedSchema(): JsonSchema {
  const schema = definition().events["switched"]?.schema
  expect(schema, "switched must define an event schema").toBeTypeOf("object")
  return schema as JsonSchema
}

// --- Tests ---

describe("AutoPlanRpc", () => {
  it("registers the contract under the id \"auto-plan\"", () => {
    expect(definition().id).toBe("auto-plan")
  })

  it("defines reportSessions with an input schema and no output schema", () => {
    const method = definition().methods["reportSessions"]
    expect(method, "reportSessions method must exist").toBeTypeOf("object")
    expect(method?.input, "reportSessions.input must be a schema").toBeTypeOf("object")
    expect(method?.output).toBeUndefined()
  })
})

describe("reportSessions input schema", () => {
  it("accepts a list of session ids", () => {
    expect(conforms(reportSessionsInput(), { sessionIDs: ["ses_1", "ses_2"] })).toBe(true)
  })

  it("accepts an empty session id list", () => {
    expect(conforms(reportSessionsInput(), { sessionIDs: [] })).toBe(true)
  })

  it("rejects a session id list containing a non-string", () => {
    expect(conforms(reportSessionsInput(), { sessionIDs: [1] })).toBe(false)
  })

  it("rejects a payload without sessionIDs", () => {
    expect(conforms(reportSessionsInput(), {})).toBe(false)
  })

  it("rejects payload keys beyond sessionIDs", () => {
    expect(conforms(reportSessionsInput(), { sessionIDs: ["a"], extra: 1 })).toBe(false)
  })
})

describe("switched event schema", () => {
  it("accepts a payload with all four required fields", () => {
    expect(
      conforms(switchedSchema(), {
        sessionID: "ses_1",
        from: "build",
        to: "plan",
        reason: "question",
      }),
    ).toBe(true)
  })

  it("rejects a payload missing reason", () => {
    expect(conforms(switchedSchema(), { sessionID: "ses_1", from: "build", to: "plan" })).toBe(false)
  })

  it("rejects a reason outside the allowed values", () => {
    expect(
      conforms(switchedSchema(), {
        sessionID: "ses_1",
        from: "build",
        to: "plan",
        reason: "other",
      }),
    ).toBe(false)
  })

  it("rejects payload keys beyond the four defined fields", () => {
    expect(
      conforms(switchedSchema(), {
        sessionID: "ses_1",
        from: "build",
        to: "plan",
        reason: "question",
        extra: true,
      }),
    ).toBe(false)
  })
})

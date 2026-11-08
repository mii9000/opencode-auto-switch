// Live integration probe against a real `opencode serve` instance.
// Run: node --experimental-strip-types probe.mjs (server must be on :4096)
import { OpenCode } from "@opencode/client"
import { AutoPlanRpc } from "./src/rpc.ts"

const client = OpenCode.make({
  baseUrl: "http://localhost:4096",
  headers: { Authorization: `Basic ${Buffer.from(`opencode:${process.env.OC_PASSWORD}`).toString("base64")}` },
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(pred, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await pred()
    if (last.ok) return last
    await sleep(500)
  }
  throw new Error(`timeout waiting for ${label}: ${JSON.stringify(last?.value ?? last)}`)
}

const results = []
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail })
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`)
}

// --- Session A: witnessed -------------------------------------------------
const a = await client.session.create({ title: "auto-plan-probe-witnessed" })
console.log("session A:", a.id, "agent:", a.agent)

const autoPlan = client.rpc(AutoPlanRpc)
await autoPlan.reportSessions({ sessionIDs: [a.id] })

await client.session.prompt({ sessionID: a.id, text: "Say PROBE1 and nothing else. Why do cats purr?" })

// The switch happens at prompt admission, before the model answers.
let infoA
await waitFor(
  async () => {
    infoA = await client.session.get({ sessionID: a.id })
    return { ok: infoA.agent === "plan", value: infoA.agent }
  },
  "switch to plan",
)
check("AC-1 live: ? prompt runs in plan", infoA.agent === "plan", `agent=${infoA.agent}`)
const remembered = infoA.metadata?.["opencode-auto-plan"]?.agent
check("AC-1 live: remembered agent stored", remembered === "build", `state=${JSON.stringify(infoA.metadata?.["opencode-auto-plan"])}`)

await sleep(8000) // let PROBE1 finish so the next prompt lands on an idle session
await client.session.prompt({ sessionID: a.id, text: "Say PROBE2 and nothing else." })

let infoA2
await waitFor(
  async () => {
    infoA2 = await client.session.get({ sessionID: a.id })
    return { ok: infoA2.agent !== "plan", value: infoA2.agent }
  },
  "restore off plan",
)
check("AC-2 live: next prompt restores previous agent", infoA2.agent === remembered, `agent=${infoA2.agent} remembered=${remembered}`)
check("AC-2 live: state debt removed", infoA2.metadata?.["opencode-auto-plan"] === undefined, `metadata keys=${JSON.stringify(Object.keys(infoA2.metadata ?? {}))}`)

// --- Session B: unwitnessed (the opencode run / SDK case) ------------------
const b = await client.session.create({ title: "auto-plan-probe-unwitnessed" })
await client.session.prompt({ sessionID: b.id, text: "Say PROBE3 and nothing else. Why is the sky blue?" })
let infoB
await waitFor(
  async () => {
    infoB = await client.session.get({ sessionID: b.id })
    return { ok: infoB.time?.busy !== undefined, value: infoB.agent }
  },
  "unwitnessed prompt admission",
)
check("AC-6 live: unwitnessed ? prompt never switches", infoB.agent !== "plan", `agent=${infoB.agent}`)
check("AC-6 live: unwitnessed session has no state debt", infoB.metadata?.["opencode-auto-plan"] === undefined)

// --- Session C: already in plan (PRD AC-4) --------------------------------
const c = await client.session.create({ title: "auto-plan-probe-already-plan", agent: "plan" })
await autoPlan.reportSessions({ sessionIDs: [c.id] })
await client.session.prompt({ sessionID: c.id, text: "Say PROBE4 and nothing else. Why do we test?" })
await sleep(8000)
const infoC = await client.session.get({ sessionID: c.id })
check("AC-4 live: plan session stays plan on ?", infoC.agent === "plan", `agent=${infoC.agent}`)
check("AC-4 live: no state debt created", infoC.metadata?.["opencode-auto-plan"] === undefined)

// --- Session D: manual change mid-question (PRD AC-5) ----------------------
const d = await client.session.create({ title: "auto-plan-probe-manual", agent: "build" })
await autoPlan.reportSessions({ sessionIDs: [d.id] })
await client.session.prompt({ sessionID: d.id, text: "Say PROBE5 and nothing else. Why do birds sing?" })
let infoD
await waitFor(
  async () => {
    infoD = await client.session.get({ sessionID: d.id })
    return { ok: infoD.agent === "plan", value: infoD.agent }
  },
  "switch to plan",
)
await client.session.switchAgent({ sessionID: d.id, agent: "build" }) // the user manually moves
await sleep(8000)
await client.session.prompt({ sessionID: d.id, text: "Say PROBE6 and nothing else. Why is this hard?" })
await sleep(8000)
const infoD2 = await client.session.get({ sessionID: d.id })
check("AC-5 live: after manual move, a fresh ? prompt does NOT re-switch", infoD2.agent === "build", `agent=${infoD2.agent}`)
check("AC-5 live: plugin cleared its state debt", infoD2.metadata?.["opencode-auto-plan"] === undefined)

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length > 0 ? 1 : 0)

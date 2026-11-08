import { Plugin } from "@opencode/plugin/tui"
import { AutoPlanRpc } from "./rpc"
import { createWitness } from "./witness"

const TOAST_TITLE = "auto-plan"

export default Plugin.define({
  id: "auto-plan-tui",
  async setup(context) {
    const witness = createWitness()
    const autoPlan = context.client.rpc(AutoPlanRpc)

    let scheduled = false
    let disposed = false
    function schedulePush(): void {
      if (scheduled || disposed) return
      scheduled = true
      void Promise.resolve()
        .then(() => {
          // Reset before the snapshot so adds during the push schedule the next one.
          scheduled = false
          if (disposed) return
          return autoPlan.reportSessions({ sessionIDs: witness.snapshot() })
        })
        .catch((error) => {
          if (!disposed) console.warn("[auto-plan] witness push failed", error)
        })
    }

    const offChanged = witness.onChange(schedulePush)
    const offConnected = context.data.on("server.connected", () => schedulePush())

    for (const tab of context.ui.tabs.list()) witness.add(tab.sessionID)
    schedulePush()

    let footerSessionID: string | undefined
    function reconcileDisplayed(): void {
      // A session this TUI stopped displaying (tab closed, navigated away)
      // no longer earns toasts. Open tabs and the footer's session stay.
      // A tabs-disabled TUI shows one session at a time; its witness stays
      // grow-only.
      if (!context.ui.tabs.enabled()) return
      const keep = new Set(context.ui.tabs.list().map((tab) => tab.sessionID))
      if (footerSessionID) keep.add(footerSessionID)
      for (const id of witness.snapshot()) {
        if (!keep.has(id)) witness.remove(id)
      }
    }

    const unclaim = context.ui.slot({
      append: "prompt.footer",
      render: (input) => {
        footerSessionID = input.sessionID
        if (input.sessionID) witness.add(input.sessionID)
        reconcileDisplayed()
        // The claim must render JSX but recording is all this slot does.
        return null as never
      },
    })

    const offSwitched = autoPlan.events.on("switched", (event) => {
      // Only the TUI that witnesses the switched session reports it — other
      // TUI instances must stay quiet about switches they do not display.
      if (!witness.has(event.data.sessionID)) return
      context.ui.toast.show({
        title: TOAST_TITLE,
        message:
          event.data.reason === "restore"
            ? `Restored ${event.data.to}`
            : 'Plan mode — prompt ended with "?"',
        variant: "info",
      })
    })

    return () => {
      disposed = true
      offSwitched()
      offConnected()
      offChanged()
      unclaim()
      if (scheduled) {
        scheduled = false
        void autoPlan
          .reportSessions({ sessionIDs: witness.snapshot() })
          .catch((error) => console.warn("[auto-plan] final witness push failed", error))
      }
    }
  },
})

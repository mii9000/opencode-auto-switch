// Vitest alias target for "@opencode/plugin/tui" (see vitest.config.ts). The
// real host module needs a running TUI; the plugin under test only needs
// Plugin.define to hand its definition back unchanged.
export const Plugin = { define: (p: unknown) => p }

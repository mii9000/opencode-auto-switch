import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      // TUI tests run the plugin against a tiny stub instead of the real
      // @opencode/plugin/tui host (which needs a running TUI): see
      // test/tui-stub.ts.
      "@opencode/plugin/tui": new URL("./test/tui-stub.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})

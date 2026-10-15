import { defineConfig } from "vitest/config";

// A separate config so tests don't load vite.config.ts, whose Cloudflare plugin starts workerd.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" }
});

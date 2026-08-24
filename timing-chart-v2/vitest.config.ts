import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const source = (path: string) => fileURLToPath(new URL(`./packages/${path}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@timing-chart-v2/schema": source("schema"),
      "@timing-chart-v2/core": source("core"),
      "@timing-chart-v2/commands": source("commands"),
      "@timing-chart-v2/history": source("history"),
      "@timing-chart-v2/geometry": source("geometry"),
      "@timing-chart-v2/wavedrom-adapter": source("wavedrom-adapter"),
      "@timing-chart-v2/projection": source("projection"),
      "@timing-chart-v2/renderer": source("renderer"),
      "@timing-chart-v2/export": source("export"),
      "@timing-chart-v2/testing": source("testing"),
      "@timing-chart-v2/ui": source("ui"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});

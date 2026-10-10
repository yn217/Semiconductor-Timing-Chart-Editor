import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const thirdPartyNoticesPath = fileURLToPath(new URL("../../../THIRD_PARTY_NOTICES.md", import.meta.url));

function exposeThirdPartyNotices(): Plugin {
  return {
    name: "expose-third-party-notices",
    configureServer(server) {
      server.middlewares.use("/THIRD_PARTY_NOTICES.md", async (_request, response, next) => {
        try {
          response.statusCode = 200;
          response.setHeader("Content-Type", "text/markdown; charset=utf-8");
          response.end(await readFile(thirdPartyNoticesPath));
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "THIRD_PARTY_NOTICES.md",
        source: await readFile(thirdPartyNoticesPath, "utf8"),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), exposeThirdPartyNotices()],
  server: { fs: { allow: ["../../.."] } },
});

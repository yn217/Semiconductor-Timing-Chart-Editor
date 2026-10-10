import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const thirdPartyNoticesPath = fileURLToPath(new URL("../../../THIRD_PARTY_NOTICES.md", import.meta.url));
const projectLicensePath = fileURLToPath(new URL("../../../LICENSE", import.meta.url));

function exposeLegalDocuments(): Plugin {
  return {
    name: "expose-legal-documents",
    configureServer(server) {
      for (const [route, path, contentType] of [
        ["/THIRD_PARTY_NOTICES.md", thirdPartyNoticesPath, "text/markdown; charset=utf-8"],
        ["/LICENSE", projectLicensePath, "text/plain; charset=utf-8"],
      ] as const) {
        server.middlewares.use(route, async (_request, response, next) => {
          try {
            response.statusCode = 200;
            response.setHeader("Content-Type", contentType);
            response.end(await readFile(path));
          } catch (error) {
            next(error);
          }
        });
      }
    },
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "THIRD_PARTY_NOTICES.md",
        source: await readFile(thirdPartyNoticesPath, "utf8"),
      });
      this.emitFile({
        type: "asset",
        fileName: "LICENSE",
        source: await readFile(projectLicensePath, "utf8"),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), exposeLegalDocuments()],
  server: { fs: { allow: ["../../.."] } },
});

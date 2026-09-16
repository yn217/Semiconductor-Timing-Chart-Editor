import { spawn } from "node:child_process";
import net from "node:net";

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not determine an isolated Playwright port."));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

const port = await reservePort();
const runId = `${Date.now().toString(36)}-${process.pid}`;
console.log(`[playwright-server] run=${runId} port=${port} ownership=playwright-webServer`);

const child = spawn(process.execPath, ["./node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, PW_TEST_PORT: String(port), PW_TEST_RUN_ID: runId },
  windowsHide: true,
});

const forwardSignal = (signal) => child.kill(signal);
process.once("SIGINT", () => forwardSignal("SIGINT"));
process.once("SIGTERM", () => forwardSignal("SIGTERM"));
child.once("exit", (code, signal) => {
  console.log(`[playwright-server] run=${runId} port=${port} cleanup=webServer-owned`);
  process.exitCode = signal ? 1 : (code ?? 1);
});

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Run deliberately once per release candidate, never as the normal edit loop.
const cwd = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Invoke this procedure through npm run release:verify.");
const steps = [
  ["run", "check"],
  ["audit", "--audit-level=high"],
  ["run", "release:smoke"],
  ["run", "release:smoke"],
];
for (const [index, args] of steps.entries()) {
  const artifact = index === 3;
  console.log(`[release] ${artifact ? "built artifact" : "local gate"}: npm ${args.join(" ")}`);
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd, stdio: "inherit", windowsHide: true,
    env: { ...process.env, RELEASE_BUILT_ARTIFACT: artifact ? "1" : "0" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

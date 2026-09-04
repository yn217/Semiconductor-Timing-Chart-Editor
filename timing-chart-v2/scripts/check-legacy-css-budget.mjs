import { stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const file = path.join(root, "apps", "editor", "src", "styles", "legacy.css");
const reviewedBudgetBytes = 109689;
const actualBytes = (await stat(file)).size;

if (actualBytes > reviewedBudgetBytes) {
  console.error(`legacy.css exceeds the reviewed retirement budget: ${actualBytes} > ${reviewedBudgetBytes} bytes`);
  process.exitCode = 1;
} else {
  console.log(`Legacy CSS retirement budget passed (${actualBytes}/${reviewedBudgetBytes} bytes).`);
}

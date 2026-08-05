import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const sourceDir = path.join(repoRoot, "frontend", "dist");
const targetDir = path.join(repoRoot, "dist");

async function main() {
  await rm(targetDir, { recursive: true, force: true });
  await cp(sourceDir, targetDir, { recursive: true });
}

main().catch((error) => {
  console.error("Failed to copy frontend/dist to root dist.");
  console.error(error);
  process.exitCode = 1;
});
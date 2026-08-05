import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(frontendRoot, "..");
const sourceDemoDir = path.join(repoRoot, "demo_cases");
const sourceArtifactsDir = path.join(repoRoot, "artifacts");
const targetRoot = path.join(frontendRoot, "public", "generated");
const targetDemoDir = path.join(targetRoot, "demo-cases");

async function main() {
  await mkdir(targetDemoDir, { recursive: true });

  await copyFile(path.join(sourceDemoDir, "manifest.json"), path.join(targetRoot, "manifest.json"));
  await copyFile(
    path.join(sourceArtifactsDir, "audit_summary.json"),
    path.join(targetRoot, "audit_summary.json"),
  );
  await copyFile(
    path.join(sourceArtifactsDir, "shift_study.json"),
    path.join(targetRoot, "shift_study.json"),
  );

  const entries = await readdir(sourceDemoDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".png"))
      .map((entry) =>
        copyFile(path.join(sourceDemoDir, entry.name), path.join(targetDemoDir, entry.name)),
      ),
  );
}

main().catch((error) => {
  console.error("Failed to sync static assets for the frontend build.");
  console.error(error);
  process.exitCode = 1;
});
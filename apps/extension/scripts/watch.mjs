import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { buildExtension, packageRoot } from "./build-lib.mjs";

const POLL_INTERVAL_MS = 500;
const watchedPaths = [path.join(packageRoot, "manifest.json"), path.join(packageRoot, "src")];
const runOnce = process.argv.includes("--once");

async function collectSignatures(targetPath) {
  const targetStat = await stat(targetPath);
  if (!targetStat.isDirectory()) {
    return [`${targetPath}:${targetStat.mtimeMs}:${targetStat.size}`];
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  const signatures = await Promise.all(
    entries.map((entry) => collectSignatures(path.join(targetPath, entry.name))),
  );
  return signatures.flat();
}

async function sourceSignature() {
  const signatures = await Promise.all(watchedPaths.map(collectSignatures));
  return signatures.flat().sort().join("\n");
}

await buildExtension();
console.log("Built WorkTrace extension into dist/.");

if (!runOnce) {
  console.log("Watching manifest.json and src/ for changes.");
  console.log("For background or manifest changes, click Reload in chrome://extensions.");
  console.log("For content-script changes, also refresh the workflow tab.");

  let previousSignature = await sourceSignature();
  let checking = false;

  setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const nextSignature = await sourceSignature();
      if (nextSignature !== previousSignature) {
        await buildExtension();
        previousSignature = nextSignature;
        console.log(`[${new Date().toLocaleTimeString()}] Rebuilt extension.`);
      }
    } catch (error) {
      console.error("Extension rebuild failed:", error);
    } finally {
      checking = false;
    }
  }, POLL_INTERVAL_MS);
}

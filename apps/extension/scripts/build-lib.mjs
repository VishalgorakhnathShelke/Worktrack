import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distPath = path.join(packageRoot, "dist");

export async function buildExtension() {
  await rm(distPath, { recursive: true, force: true });
  await mkdir(distPath, { recursive: true });
  await cp(path.join(packageRoot, "manifest.json"), path.join(distPath, "manifest.json"));
  await cp(path.join(packageRoot, "src"), distPath, { recursive: true });
}

export { packageRoot };

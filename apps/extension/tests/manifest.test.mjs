import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(
  await readFile(new URL("../manifest.json", import.meta.url), "utf8"),
);

test("manifest exposes the operable recorder surfaces", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.ok(manifest.permissions.includes("offscreen"));
  assert.ok(manifest.content_scripts.some((entry) => entry.js.includes("content.mjs")));
});

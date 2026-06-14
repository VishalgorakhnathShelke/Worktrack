import { readFile, readdir } from "node:fs/promises";

const directory = new URL("../schemas/", import.meta.url);
const files = (await readdir(directory)).filter((name) => name.endsWith(".json"));

for (const file of files) {
  const schema = JSON.parse(await readFile(new URL(file, directory), "utf8"));
  if (!schema.$id || !schema.$schema || schema.type !== "object") {
    throw new Error(`${file} must define $id, $schema, and object type`);
  }
  if (!schema.properties?.schema_version || !schema.properties?.tenant_id) {
    throw new Error(`${file} must expose schema_version and tenant_id`);
  }
}

console.log(`Validated ${files.length} WorkTrace contracts.`);

// Syntax-check every JS file in the project (no dependencies needed).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const roots = ["server", "public/js", "test", "scripts"];
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".js")) files.push(full);
  }
}
for (const root of roots) if (fs.existsSync(root)) walk(root);

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed++;
    process.stderr.write(result.stderr);
  }
}
console.log(`${files.length - failed}/${files.length} files OK`);
process.exit(failed ? 1 : 0);

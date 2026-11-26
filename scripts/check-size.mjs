// Fails when the build in dist/ exceeds the challenge's 1,048,576 bytes (uncompressed).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LIMIT = 1_048_576;
const TARGET = 400_000;
const total = (dir) => readdirSync(dir).reduce((sum, name) => {
  const path = join(dir, name);
  return sum + (statSync(path).isDirectory() ? total(path) : statSync(path).size);
}, 0);
const bytes = total("dist");
console.log(`dist: ${bytes} bytes of ${LIMIT} (${((100 * bytes) / LIMIT).toFixed(1)} %)`);
if (bytes > LIMIT) throw new Error(`dist is ${bytes - LIMIT} bytes over the limit`);
if (bytes > TARGET) console.warn(`warning: over our own ${TARGET}-byte target`);

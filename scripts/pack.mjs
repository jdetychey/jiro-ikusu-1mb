// Packs dist/ for the contest's upload form (1mbgame.com takes a .zip with index.html at its root,
// or a single .html), in three forms, because the host's content policy is unknown:
//   pack/index.html            everything inlined: nothing is fetched, so even a sandbox with an
//                              opaque origin cannot refuse a file
//   pack/jiro-ikusu-1mb.zip    that file, zipped
//   pack/jiro-ikusu-1mb-files.zip   dist/ as built, for a host that forbids inline scripts
// The zips are deterministic: the same dist/ gives the same bytes.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { crc32, deflateRawSync } from "node:zlib";
import { extname, join, relative } from "node:path";

const LIMIT = 1_048_576;
const DIST = "dist";
const OUT = "pack";
const MIME = { ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };

const dataUri = (path) => `data:${MIME[extname(path)] ?? "application/octet-stream"};base64,${readFileSync(join(DIST, path)).toString("base64")}`;
const clean = (reference) => reference.replace(/^\.?\//, "");

function inline() {
  let html = readFileSync(join(DIST, "index.html"), "utf8");
  html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => {
    const css = readFileSync(join(DIST, clean(href)), "utf8").replace(/url\(([^)]+)\)/g, (match, url) => {
      const file = url.replace(/["']/g, "");
      if (file.startsWith("data:")) return match;
      return `url(${dataUri(clean(file.replace(/^(\.\.\/)+/, "")))})`;
    });
    return `<style>${css}</style>`;
  });
  html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
    const js = readFileSync(join(DIST, clean(src)), "utf8").replaceAll("</script", "<\\/script");
    return `<script type="module">${js}</script>`;
  });
  const isFile = (value) => !/^(data:|https?:|\/\/|#)/.test(value) && existsSync(join(DIST, clean(value)));
  html = html.replace(/(href|src|srcset)="([^"]+)"/g, (match, attribute, file) => (isFile(file) ? `${attribute}="${dataUri(clean(file))}"` : match));
  const left = html.match(/(?:href|src|srcset)="(?!data:|https?:|#)[^"]*"/g);
  if (left !== null) throw new Error(`references left after inlining: ${left.join(", ")}`);
  return html;
}

function files(dir) {
  return readdirSync(dir).sort().flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));
}

/** A zip of `entries` ([name, bytes]), deflated, with a fixed timestamp. */
function zip(entries) {
  const DOS_TIME = 0;
  const DOS_DATE = (46 << 9) | (1 << 5) | 1;
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const packed = deflateRawSync(data, { level: 9 });
    const nameBytes = Buffer.from(name);
    const fields = [crc32(data), packed.length, data.length, nameBytes.length];
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(fields[0], 14);
    local.writeUInt32LE(fields[1], 18);
    local.writeUInt32LE(fields[2], 22);
    local.writeUInt16LE(fields[3], 26);
    locals.push(local, nameBytes, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(fields[0], 16);
    central.writeUInt32LE(fields[1], 20);
    central.writeUInt32LE(fields[2], 24);
    central.writeUInt16LE(fields[3], 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

mkdirSync(OUT, { recursive: true });
const single = Buffer.from(inline());
writeFileSync(join(OUT, "index.html"), single);
writeFileSync(join(OUT, "jiro-ikusu-1mb.zip"), zip([["index.html", single]]));
const tree = files(DIST).map((path) => [relative(DIST, path), readFileSync(path)]);
if (!tree.some(([name]) => name === "index.html")) throw new Error("dist has no index.html at its root");
writeFileSync(join(OUT, "jiro-ikusu-1mb-files.zip"), zip(tree));

for (const name of readdirSync(OUT)) {
  const size = statSync(join(OUT, name)).size;
  console.log(`${name}: ${size} bytes`);
}
const uncompressed = Math.max(single.length, tree.reduce((sum, [, data]) => sum + data.length, 0));
console.log(`largest upload uncompressed: ${uncompressed} of ${LIMIT}`);
if (uncompressed > LIMIT) throw new Error("an upload is over the limit");

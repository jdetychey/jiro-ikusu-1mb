// Reads the playtest reports that scripts/balance.sh wrote and prints the clear rate of the bots
// by depth, as the markdown of reports/balance.md.
import { readdirSync, readFileSync } from "node:fs";

const [root, policiesArg, seeds, runs] = process.argv.slice(2);
const policies = policiesArg.split(",");
const rates = new Map();
for (const policy of policies) {
  for (const dir of readdirSync(`${root}/${policy}`)) {
    const file = readdirSync(`${root}/${policy}/${dir}`).find((name) => name.endsWith(".json"));
    const report = JSON.parse(readFileSync(`${root}/${policy}/${dir}/${file}`, "utf8"));
    for (const level of report.levels) {
      const depth = Number(level.name.slice(1));
      rates.set(depth, [...(rates.get(depth) ?? []), level.policies[policy].clearRatePerMille / 10]);
    }
  }
}
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const depths = [...rates.keys()].sort((a, b) => a - b);
console.log(`# Balance report\n\nClear rate of the bots ${policies.join(" and ")} (the reference mix of the main repository's\n\`levels/targets.json\`) on the generated levels of ${seeds} daily seeds, ${runs} runs per level and policy.\nRegenerate with \`scripts/balance.sh\`.\n`);
console.log("| Depth | Clear rate | Depth | Clear rate | Depth | Clear rate | Depth | Clear rate |\n|---|---|---|---|---|---|---|---|");
for (let row = 0; row < 16; row += 1) {
  const cells = [0, 16, 32, 48].map((start) => {
    const depth = start + row;
    return depths.includes(depth) ? `${depth + 1} | ${mean(rates.get(depth)).toFixed(1)} %` : " | ";
  });
  console.log(`| ${cells.join(" | ")} |`);
}

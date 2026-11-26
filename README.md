# Jiro-ikusu 1MB

Draw the line. Claim the field. [Jiro-ikusu](https://github.com/detychey/jiro-ikusu) in under 1 MB
(1,048,576 bytes), for [1mbgame.com](https://www.1mbgame.com/): pure offline HTML, JS and CSS, no
network calls, no chain.

- **Training:** the 16 curated levels.
- **Daily Run:** endless generated levels, the same for everyone on a UTC day, harder with each
  level, until a level is not cleared. A Run ends with a code that anyone can verify offline.

Balance is measured with the main repository's playtest bots (`scripts/balance.sh`,
[`reports/balance.md`](reports/balance.md)). The game rules are the deterministic Rust core of the main repository, compiled to a 26 KB wasm
module embedded in the page ([`CORE_SOURCE.md`](CORE_SOURCE.md)). [`PLAN.md`](PLAN.md) has the plan.

```bash
npm install --legacy-peer-deps
npm test
npm run build   # dist/, and fails above 1,048,576 bytes
```

Needs Rust (see `rust-toolchain.toml`) and Node 22. MIT licensed; the pixel font has its own
licence in `public/`.

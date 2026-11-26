# Plan

## The challenge ([1mbgame.com](https://www.1mbgame.com/))

- 1,048,576 bytes uncompressed, pure offline HTML, JS and CSS. Upload a build `.zip` or a single
  `.html`; the form detects the true size, requires `index.html` and blocks executables.
- The host serves games from an isolated origin with `connect-src 'none'`: nothing is fetched at
  runtime, so the engine and the levels are embedded in the JS.
- Round 1 is Dec 2026, entries from Dec 1; up to 3 games per creator, unlimited updates.
- Not published: judging criteria, licence, AI-asset policy. Ask the organisers.

## Shape

The existing deterministic game, without the onchain and Challenge layer.

| Keep | Drop |
|---|---|
| `core/` as 26 KB wasm, the 16 levels, the renderer, input, tick loop and touch controls | `ethers`, `chain/`, season, settle, challenge, vectors, replay, editor, service worker, contracts, referee |

Two modes: **Training** (16 curated levels) and the **daily Run**.

## Daily Run

- Seed: the UTC date. Level `n` is `generateLevel(core, seed, n)`; the run nonce is
  keccak(`seed/n`), so everyone faces the same levels and the same boss.
- Generator (`src/generator.ts`): the knobs of `levels/README.md` ramped by depth (boss size and
  speed, minions, lives, target, up to 10 wall bars), redrawn until the core's own validity rules
  accept the level.
- A level is cleared when the target was reached without losing all lives. The Run goes on
  until one is not cleared. Level score = claim × weight, weight rising with depth.
- Run code: version, seed, journals. `verifyCode` regenerates the levels and has the core replay
  each journal, so a code is checked offline with no trust in the client.

## Milestones

1. **Done:** repo, wasm core, build, size gate (about 100 KB of 1 MB), generator, Run, codes,
   smoke test under a strict CSP.
2. **Wasm in the host's sandbox:** upload a test page on Dec 1. If it blocks wasm
   (no `wasm-unsafe-eval`), port `core/` to TypeScript, checked against the main repo's vectors.
3. **Done, balance:** `scripts/balance.sh` runs the main repository's playtest bots (the reference
   mix, bold and committer) on generated levels and writes `reports/balance.md`. The ramp is smooth:
   98 % at level 1, 54 % at 17, 17 % at 33, about 8 % from 45, and it keeps rising through time,
   walls and target. Bots are weaker than people, so this is a floor on what humans clear.
4. **Product:** title screen, visual replay of a Run code, sound (synthesized WebAudio),
   phone layout check, brand assets.
5. **QA and submit:** Playwright on Chromium and WebKit, parity vectors, then submit with this
   repo as the link.

## Risks

- Wasm blocked by the host's CSP (milestone 2).
- Generated levels can be much easier or harder than their depth suggests (milestone 3).
- The core is a copy: it must stay byte-identical to the main repo's (`CORE_SOURCE.md`).

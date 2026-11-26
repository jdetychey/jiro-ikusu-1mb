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

1. **Done:** repo, wasm core, build, size gate, generator, Run, codes.
2. **Done, balance:** `scripts/balance.sh` plays the main repository's reference bots (bold and
   committer) on generated levels and writes `reports/balance.md`. The clear rate falls smoothly
   from 98 % at level 1 to about 8-15 % by level 45, with a rest level every fifth level (easier)
   and a boss level every tenth (a size-8 boss). Bots are weaker than people.
3. **Done, shell:** pause when the page is hidden or loses focus (and P or Escape), a tick cap per
   frame, one animation-frame chain, keys prevented only while playing and only the bound ones,
   audio unlocked on the first gesture, the daily seed read when a Run starts, a readable error
   page if the engine cannot start.
4. **Done, first minute:** title screen, level intro cards, a first-run tutorial on training
   level 1, score and depth in the HUD, juice (sparks, a floating gain, shake, flash), a blinking
   player while invulnerable, a boss with a core and minions with a center, so shapes tell them
   apart without colour.
5. **Done, phones:** the cell size is the largest whole number of pixels that fits (6 px on a
   390 px phone, a 360 px field), no banner, a sticky touch bar clear of the home bar, no scroll or
   pull-to-refresh while playing, a landscape layout.
6. **Done, sharing:** Copy code, Copy link (`#r=<code>` verifies on open), a Wordle-style result
   line, streak and best depth, a leaderboard from pasted codes, watch at 1×, 2× or 4×.
   `verifyCode` rejects a bad seed, a future day and bad base64.
7. **Done, packaging and CI:** `npm run pack` writes `pack/index.html` (everything inlined: no
   file is fetched, so even an opaque-origin sandbox cannot refuse one) and two deterministic zips;
   `.github/workflows/ci.yml` typechecks, tests, builds with the size gate and plays the build in
   Chromium and WebKit (`npm run e2e`), under a strict policy, a policy that allows only itself and a
   sandboxed frame.
8. **Done, TypeScript core fallback:** `src/tscore/` is a pure-TypeScript port of the Rust core
   (no BigInt; keccak on 32-bit halves), about 21 KB minified and about 2.7× slower than wasm per
   tick, which is far inside the 15 Hz budget. `bootEngine` falls back to it when WebAssembly is
   missing or refused, and `?engine=ts` forces it. `test/parity.test.ts` holds it to the wasm build
   tick by tick (state hash, snapshot, grid, journal, replay traces, and the error codes of 1,500
   mutated levels and 150 mutated journals), and the e2e tests verify a wasm Run code on the port.
9. **Open:** a Dec 1 test upload to learn the host's real policy (try `pack/index.html`, then
   `jiro-ikusu-1mb.zip`, then `jiro-ikusu-1mb-files.zip`), ghost replays, music, an attract mode.

## Risks

- The host's policy is unknown: inline scripts and `crossorigin` module scripts in an opaque origin
  may be refused (`pack` makes three forms for that), and wasm may be refused (the port covers it).
- Generated levels can be much easier or harder than their depth suggests: the bots measure it.
- The core is a copy: it must stay byte-identical to the main repo's (`CORE_SOURCE.md`).

# Core source

`core/`, `shell/` and `wasm/` are copied unchanged from
[detychey/jiro-ikusu](https://github.com/detychey/jiro-ikusu) at commit
`136f1a1` (`core/src`, `shell/src`, `web/wasm/src`), and `levels/*.bin` are its 16 curated levels.
Only the `Cargo.toml` files differ: `core/` drops its dev-dependencies, because its tests and the
test vectors live in the main repository and run there. A rules change is made there first, then
copied here with the same bytes, so a journal verifies identically in both.

`src/tscore/` is a TypeScript port of `core/`, kept bit-exact by `test/parity.test.ts`; a change to
`core/` is copied there too, and the parity test fails until it matches.

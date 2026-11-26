// The built game in a real browser, under the content policies a host might send.
import { resolve } from "node:path";
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { port, serve } from "../scripts/serve.mjs";

const DIST = resolve("dist");
const PACK = resolve("pack");
const INLINE = "default-src 'none'; connect-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data:; font-src data:";
const STRICT = "default-src 'self'; connect-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:";
const NO_WASM = "default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:";
const SANDBOXED_HOST = '<!doctype html><iframe id="game" src="/index.html" sandbox="allow-scripts" width="900" height="900"></iframe>';

const TYPES: Record<string, BrowserType> = { chromium, firefox, webkit };
const NAMES = (process.env.E2E_BROWSERS ?? "chromium").split(",");

describe.each(NAMES)("the game in %s", (name) => {
  let browser: Browser;
  const servers: { close(): void }[] = [];
  beforeAll(async () => {
    browser = await (TYPES[name] ?? chromium).launch();
  });
  afterAll(async () => {
    await browser.close();
    servers.forEach((server) => server.close());
  });

  async function open(csp: string | undefined, path = "/index.html", extra: Record<string, string> = {}, root = DIST): Promise<{ page: Page; errors: string[] }> {
    const server = await serve(root, csp, extra);
    servers.push(server);
    const page = await (await browser.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    await page.goto(`http://127.0.0.1:${port(server)}${path}`);
    return { page, errors };
  }

  const canvasHash = (page: Page) => page.evaluate(() => {
    const canvas = document.getElementById("field") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0;
    for (let i = 0; i < data.length; i += 4) hash = (hash * 31 + data[i]! + 7 * data[i + 1]! + 13 * data[i + 2]!) >>> 0;
    return hash;
  });

  it("starts under a strict policy with no network and no errors", async () => {
    const { page, errors } = await open(STRICT);
    await page.waitForFunction(() => document.getElementById("engine")!.textContent !== "–");
    expect(await page.textContent("#engine")).toBe("wasm");
    expect(errors).toEqual([]);
  });

  it("plays a Run: the field changes while keys are held", async () => {
    const { page, errors } = await open(STRICT);
    await page.click("#run");
    await page.waitForFunction(() => document.body.classList.contains("playing"));
    const before = await canvasHash(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(700);
    await page.keyboard.up("ArrowUp");
    expect(await canvasHash(page)).not.toBe(before);
    expect(errors).toEqual([]);
  });

  it("pauses when the page loses focus, and the clock stands still", async () => {
    const { page } = await open(STRICT);
    await page.click("#run");
    await page.waitForFunction(() => document.body.classList.contains("playing"));
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForSelector("#pause:not([hidden])");
    const time = await page.textContent("#hud-time");
    await page.waitForTimeout(1_200);
    expect(await page.textContent("#hud-time")).toBe(time);
  });

  it("goes on after a pause when a key is pressed", async () => {
    const { page } = await open(STRICT);
    await page.click("#run");
    await page.waitForFunction(() => document.body.classList.contains("playing"));
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForSelector("#pause:not([hidden])");
    await page.keyboard.press("Space");
    await page.waitForSelector("#pause", { state: "hidden" });
  });

  it("starts the single file inside a sandboxed frame, where storage is refused", async () => {
    const { page, errors } = await open(`${INLINE}; frame-src 'self'`, "/host.html", { "/host.html": SANDBOXED_HOST }, PACK);
    const frame = page.frameLocator("#game");
    await frame.locator("#engine").waitFor();
    await page.waitForFunction(() => true);
    await expect.poll(() => frame.locator("#engine").textContent()).toBe("wasm");
    expect(await frame.locator("#storage-note").isVisible()).toBe(true);
    expect(errors.filter((error) => !/sandbox|origin|storage/i.test(error))).toEqual([]);
  });

  it("starts the single file under a policy that allows nothing but itself", async () => {
    const { page, errors } = await open(INLINE, "/index.html", {}, PACK);
    await page.waitForFunction(() => document.getElementById("engine")!.textContent !== "–");
    expect(await page.textContent("#engine")).toBe("wasm");
    expect(errors).toEqual([]);
  });

  it("falls back to the TypeScript engine when the policy forbids WebAssembly", async () => {
    const { page } = await open(NO_WASM);
    await page.waitForFunction(() => document.getElementById("engine")!.textContent !== "–");
    expect(await page.textContent("#engine")).toBe("ts");
  });

  it("plays a Run on the TypeScript engine", async () => {
    const { page, errors } = await open(NO_WASM);
    await page.waitForFunction(() => document.getElementById("engine")!.textContent === "ts");
    await page.click("#run");
    await page.waitForFunction(() => document.body.classList.contains("playing"));
    const before = await canvasHash(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(700);
    await page.keyboard.up("ArrowUp");
    expect(await canvasHash(page)).not.toBe(before);
    expect(errors.filter((error) => !/WebAssembly|wasm|Content Security Policy/i.test(error))).toEqual([]);
  });

  it("verifies on the TypeScript engine a Run code that the wasm engine wrote", async () => {
    const wasm = await open(STRICT);
    await wasm.page.click("#run");
    await wasm.page.waitForFunction(() => document.body.classList.contains("playing"));
    await wasm.page.keyboard.down("ArrowUp");
    await wasm.page.waitForTimeout(500);
    await wasm.page.keyboard.up("ArrowUp");
    await wasm.page.keyboard.press("KeyX");
    await wasm.page.waitForSelector("#code:not([hidden])");
    const code = await wasm.page.inputValue("#code");
    const port = await open(STRICT, `/index.html?engine=ts#r=${code}`);
    await port.page.waitForFunction(() => document.getElementById("verify-result")!.textContent !== "");
    expect([await port.page.textContent("#engine"), await port.page.textContent("#verify-result")]).toEqual(["ts", expect.stringMatching(/^Valid: /)]);
  });

  it("ends a Run, then verifies its code", async () => {
    const { page } = await open(STRICT);
    await page.click("#run");
    await page.waitForFunction(() => document.body.classList.contains("playing"));
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(400);
    await page.keyboard.up("ArrowUp");
    await page.keyboard.press("KeyX");
    await page.waitForSelector("#code:not([hidden])");
    const code = await page.inputValue("#code");
    await page.locator("summary", { hasText: "Verify" }).click();
    await page.fill("#verify-code", code);
    await page.click("#verify");
    expect(await page.textContent("#verify-result")).toMatch(/^Valid: /);
  });

  it("opens a shared link and verifies the code in it", async () => {
    const first = await open(STRICT);
    await first.page.click("#run");
    await first.page.waitForFunction(() => document.body.classList.contains("playing"));
    await first.page.keyboard.press("KeyX");
    await first.page.waitForSelector("#code:not([hidden])");
    const code = await first.page.inputValue("#code");
    const second = await open(STRICT, `/index.html#r=${code}`);
    await second.page.waitForFunction(() => document.getElementById("verify-result")!.textContent !== "");
    expect(await second.page.textContent("#verify-result")).toMatch(/^Valid: /);
  });
});

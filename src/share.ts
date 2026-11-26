// What a player sends to others: the Run's result line, and a link that opens its code.

export interface RunResult {
  seed: string;
  levelsCleared: number;
  score: number;
}

/** A line to paste anywhere, with a bar of one block per level cleared (at most 20 shown). */
export function shareText(result: RunResult): string {
  const shown = Math.min(result.levelsCleared, 20);
  const bar = "🟦".repeat(shown) + (result.levelsCleared > shown ? "+" : "") + "🟥";
  return `Jiro-ikusu ${result.seed} | depth ${result.levelsCleared} | ${result.score.toLocaleString("en-US")}\n${bar}`;
}

const FRAGMENT = "r=";

/** The link to `page` that opens `code`. */
export function shareLink(page: string, code: string): string {
  return `${page.split("#")[0]}#${FRAGMENT}${code}`;
}

/** The code a page's fragment carries, if any. */
export function codeInFragment(fragment: string): string | undefined {
  const text = fragment.replace(/^#/, "");
  return text.startsWith(FRAGMENT) ? text.slice(FRAGMENT.length) : undefined;
}

/** The Run code in pasted text: the one a share link carries, or else the text itself. A result
 *  line with its link, or a link alone, both work. */
export function codeOfText(text: string): string {
  const linked = text.match(/#r=([A-Za-z0-9_-]+)/);
  return linked?.[1] ?? text.trim();
}

const CODE_LIKE = /^[A-Za-z0-9_-]{16,}$/;

/** The Run codes in pasted text, one per token, whether bare or in a share link; words and the
 *  rest of a result line are left out. */
export function codesOfText(text: string): string[] {
  return text
    .split(/\s+/)
    .map(codeOfText)
    .filter((token) => CODE_LIKE.test(token));
}

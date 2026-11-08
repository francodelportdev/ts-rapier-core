import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import typescript from "highlight.js/lib/languages/typescript";

// Only the languages the site shows, to keep the page light. Colors are in style.css.
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);

/** Colored HTML for a piece of code. The code is escaped, so it's safe as innerHTML. */
export function highlight(code: string, language = "typescript"): string {
  return hljs.highlight(code, { language, ignoreIllegals: true }).value;
}

/** Guesses the language of a snippet in the page text: JSON, shell commands or TypeScript. */
function languageOf(code: string): string {
  const text = code.trimStart();
  if (text.startsWith("{") || text.startsWith("[")) return "json";
  if (/^(bun|cd|npm|git) /.test(text)) return "bash";
  return "typescript";
}

/** Colors every code block inside an element, once. */
export function highlightBlocks(root: HTMLElement): void {
  for (const block of root.querySelectorAll<HTMLElement>("pre code:not([data-highlighted])")) {
    const code = block.textContent ?? "";
    block.innerHTML = highlight(code, languageOf(code));
    block.dataset.highlighted = "";
  }
}

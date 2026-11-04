// Renders the demo's own source on the page. Not part of the demo:
// main.ts stays copyable on its own.
import source from "./main.ts?raw";

const code = document.querySelector<HTMLElement>("#source");
const button = document.querySelector<HTMLButtonElement>("#copy");

if (code !== null) code.textContent = source;

button?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(source);
    button.textContent = "Copied!";
  } catch {
    button.textContent = "Copy failed";
  }
  setTimeout(() => (button.textContent = "Copy"), 1500);
});

// The page scrolls now, so stop the game keys from scrolling it.
const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"]);
window.addEventListener("keydown", (e) => {
  if (GAME_KEYS.has(e.code) && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
});

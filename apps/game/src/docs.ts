// Renders the docs page: source viewers, copy buttons and the active sidebar link.
// Not part of the demos: each demo file stays copyable on its own.
import main from "./main.ts?raw";
import player from "./demos/player.ts?raw";
import doubleJump from "./demos/double-jump.ts?raw";
import dash from "./demos/dash.ts?raw";
import events from "./demos/events.ts?raw";
import remove from "./demos/remove.ts?raw";
import camera from "./demos/camera.ts?raw";

const SOURCES: Record<string, string> = { main, player, "double-jump": doubleJump, dash, events, remove, camera };

// --- Source viewers ---------------------------------------------------------
for (const el of document.querySelectorAll<HTMLElement>("[data-source]")) {
  el.textContent = SOURCES[el.dataset.source ?? ""] ?? "";
}

// --- Copy buttons -----------------------------------------------------------
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
  const source = SOURCES[button.dataset.copy ?? ""] ?? "";
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(source);
      button.textContent = "Copied!";
    } catch {
      button.textContent = "Copy failed";
    }
    setTimeout(() => (button.textContent = "Copy"), 1500);
  });
}

// --- Highlight the sidebar link of the section in view ----------------------
const links = new Map<string, HTMLAnchorElement>();
for (const a of document.querySelectorAll<HTMLAnchorElement>(".sidebar li a")) {
  links.set(a.hash.slice(1), a);
}

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const a of links.values()) a.classList.remove("active");
      links.get(entry.target.id)?.classList.add("active");
    }
  },
  { rootMargin: "-40% 0px -55% 0px" }, // a thin band around the middle of the screen
);
for (const id of links.keys()) {
  const section = document.getElementById(id);
  if (section !== null) observer.observe(section);
}

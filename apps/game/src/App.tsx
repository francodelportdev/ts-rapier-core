import { useEffect, useRef, useState } from "react";
import { version } from "../../../packages/core/package.json";
import { controls as gameControls } from "./controls";
import { ControlsEditor } from "./ControlsEditor";
import { highlight, highlightBlocks } from "./highlight";
import { PROSE } from "./prose";
import { SECTIONS, type Section } from "./sections";
import type { Control, Demo, Toggle } from "./ui";

const sectionFromHash = (): Section => SECTIONS.find((s) => s.id === location.hash.slice(1)) ?? SECTIONS[0]!;

function useSection(): Section {
  const [section, setSection] = useState(sectionFromHash);
  useEffect(() => {
    const onChange = () => {
      setSection(sectionFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return section;
}

const REPO = "https://github.com/francodelportdev/ts-rapier-core";

const BUTTON = "shrink-0 cursor-pointer rounded-md border border-line px-3.5 py-1.5 text-[0.9rem] text-fg hover:border-accent";

function Sidebar({ current }: { current: Section }) {
  const groups = [...new Set(SECTIONS.map((s) => s.group))];
  // On phones the list is behind a button, and closes when a page is chosen.
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [current]);
  return (
    <nav
      className="sticky top-0 z-10 border-b border-surface bg-page px-4 py-3 md:block md:h-screen md:overflow-y-auto md:border-r md:border-b-0 md:px-4 md:py-8"
      aria-label="Sections"
    >
      <div className="flex items-center justify-between gap-4 md:mb-6 md:block">
        <div>
          <a className="font-bold whitespace-nowrap text-fg" href="#overview">rapier-engine</a>{" "}
          <span className="font-mono text-xs text-muted">v{version}</span>
          <a className="mt-1 hidden text-[0.85rem] text-muted hover:text-fg md:block" href={REPO}>Source on GitHub ↗</a>
        </div>
        <button
          type="button"
          className={`${BUTTON} md:hidden`}
          aria-expanded={open}
          aria-controls="section-list"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Close ✕" : `${current.title} ☰`}
        </button>
      </div>
      <ul id="section-list" className={`${open ? "block" : "hidden"} mt-3 max-h-[75vh] overflow-y-auto md:mt-0 md:block md:max-h-none md:overflow-visible`}>
        {groups.flatMap((group) => [
          group && <li className="mt-5 mb-1 px-2.5 text-xs font-semibold tracking-wider text-muted uppercase" key={group}>{group}</li>,
          ...SECTIONS.filter((s) => s.group === group).map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={s === current ? "page" : undefined}
                className="block rounded-md px-2.5 py-1.5 text-[0.95rem] whitespace-nowrap text-muted hover:bg-surface hover:text-fg aria-[current=page]:bg-surface aria-[current=page]:text-accent"
              >
                {s.title}
              </a>
            </li>
          )),
        ])}
      </ul>
    </nav>
  );
}

function Slider({ control, onRelease }: { control: Control; onRelease: () => void }) {
  const [value, setValue] = useState(control.value);
  return (
    <label className="block">
      <span className="flex justify-between gap-2 text-[0.85rem]">
        <code className="font-mono text-[0.9em] text-accent">{control.label}</code>
        <output className="whitespace-nowrap text-muted">{value} {control.unit}</output>
      </span>
      <input
        className="w-full accent-accent"
        type="range" min={control.min} max={control.max} step={control.step} value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          setValue(next);
          control.set(next);
        }}
        onPointerUp={onRelease}
      />
    </label>
  );
}

function Switch({ toggle, onRelease }: { toggle: Toggle; onRelease: () => void }) {
  const [value, setValue] = useState(toggle.value);
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[0.9rem]">
      <input
        className="accent-accent"
        type="checkbox" checked={value}
        onChange={(e) => {
          setValue(e.target.checked);
          toggle.set(e.target.checked);
          onRelease();
        }}
      />
      {toggle.label}
    </label>
  );
}

/** The "debug view" switch, remembered across pages. */
let debugView = false;

/** Runs a demo on its own canvas, and destroys it when the page changes or on reset. */
function DemoView({ section, onReset }: { section: Section; onReset: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [demo, setDemo] = useState<Demo | null>(null);
  const [status, setStatus] = useState<{ text: string; state?: string } | null>(null);
  const [log, setLog] = useState<{ id: number; text: string }[]>([]);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let running: Demo | null = null;
    let stopFollowing = () => {};
    let nextId = 0;
    const ui = {
      status: (text: string, state?: string) =>
        setStatus((old) => (old?.text === text && old.state === state ? old : { text, state })),
      log: (text: string) => setLog((old) => [{ id: nextId++, text }, ...old].slice(0, 8)),
    };
    void section.load().then(async ({ default: start }) => {
      if (cancelled) return;
      const started = await start(canvas, ui);
      if (cancelled) return started.game.destroy();
      running = started;
      if (debugView) started.game.debug.enabled = true;
      started.game.touch.enabled = true; // every demo can be played on a touch screen
      started.game.gamepad.enabled = true; // and with a gamepad
      gameControls.applyTo(started.game);
      stopFollowing = gameControls.on("change", () => gameControls.applyTo(started.game));
      if (started.player?.getTuning().dash) started.game.touch.addButton({ press: "dash", label: "»", x: -116, y: -42 });
      setDemo(started);
      canvas.focus({ preventScroll: true });
    }).catch((error: unknown) => {
      if (!cancelled) setFailed(String(error));
    });
    return () => {
      cancelled = true;
      stopFollowing();
      running?.game.destroy();
    };
  }, [section]);

  const focusCanvas = () => canvasRef.current?.focus({ preventScroll: true });

  // Full screen: the canvas and its labels grow, keeping 16:9. Esc or the button below leaves.
  const frameRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null && document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frameRef.current?.requestFullscreen().then(focusCanvas, () => {}); // refused: stay as is
  };
  const controls = [...(demo?.player ? section.controls({ ...demo, player: demo.player }) : []), ...(demo?.sliders ?? [])];
  const debugToggle = demo && {
    label: "debug view",
    value: demo.game.debug.enabled,
    set: (on: boolean) => {
      debugView = on;
      demo.game.debug.enabled = on;
    },
  };
  const toggles = [...(demo?.toggles ?? []), ...(debugToggle ? [debugToggle] : [])];

  return (
    <>
      <div ref={frameRef} className="group relative mt-6 [&:fullscreen]:flex [&:fullscreen]:items-center [&:fullscreen]:justify-center [&:fullscreen]:bg-page">
        <canvas
          ref={canvasRef} width={800} height={450}
          className="peer block h-auto w-full rounded-lg bg-surface outline-2 outline-offset-2 outline-transparent focus:outline-accent group-[:fullscreen]:w-[min(100vw,calc(100vh*16/9))] group-[:fullscreen]:rounded-none group-[:fullscreen]:outline-none"
        />
        {fullscreen && (
          <button type="button" className={`${BUTTON} absolute bottom-3 left-1/2 -translate-x-1/2 bg-page/85`} onClick={toggleFullscreen}>
            Exit full screen (Esc)
          </button>
        )}
        {!demo && !failed && (
          <p role="status" className="pointer-events-none absolute inset-0 grid place-items-center text-[0.95rem] text-muted">Loading…</p>
        )}
        {failed && <p role="alert" className="absolute inset-x-3 top-3 rounded-lg bg-page p-3 text-[0.9rem] text-fg">This demo couldn't start: {failed}</p>}
        <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-page/85 px-2.5 py-1 text-[0.8rem] text-muted peer-focus:hidden">Click to play</span>
        {(status || log.length > 0) && (
          <div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-2">
            {status && (
              <span
                data-state={status.state}
                className="rounded-full bg-line px-2.5 py-0.5 font-mono text-[0.85rem] font-semibold text-fg data-[state=dash]:bg-[#d53f8c] data-[state=fall]:bg-[#d69e2e] data-[state=fall]:text-page data-[state=jump]:bg-[#38a169] data-[state=run]:bg-[#3182ce] data-[state=wallSlide]:bg-[#805ad5]"
              >
                {status.text}
              </span>
            )}
            <ol className="hidden font-mono text-[0.8rem] text-muted md:block">
              {log.map((l) => <li key={l.id} className="first:text-fg">{l.text}</li>)}
            </ol>
          </div>
        )}
      </div>
      {controls.length + toggles.length > 0 && (
        <div className="mt-4 rounded-lg bg-surface px-4 pt-3 pb-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold">Tune it live</h2>
            <div className="flex gap-2">
              {document.fullscreenEnabled && (
                <button type="button" className={`${BUTTON} bg-page`} onClick={toggleFullscreen}>Full screen</button>
              )}
              <button type="button" className={`${BUTTON} bg-page`} onClick={onReset}>Reset</button>
            </div>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-2">
            {controls.map((c) => <Slider key={c.label} control={c} onRelease={focusCanvas} />)}
            {toggles.map((t) => <Switch key={t.label} toggle={t} onRelease={focusCanvas} />)}
          </div>
        </div>
      )}
    </>
  );
}

function Source({ section }: { section: Section }) {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    void section.source().then((m) => setCode(m.default));
  }, [section]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("Copied!");
    } catch {
      setCopied("Copy failed");
    }
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <>
      <div className="mt-10 mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Source: <code className="font-mono text-[0.9em] text-accent">{section.file}</code></h2>
        <button type="button" className={`${BUTTON} bg-surface`} onClick={() => void copy()}>{copied ?? "Copy"}</button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-surface p-4"><code className="font-mono text-[0.85rem] leading-normal" dangerouslySetInnerHTML={{ __html: highlight(code) }} /></pre>
    </>
  );
}

/** Links to the previous and next pages, to read the docs in order. */
function PageNav({ section }: { section: Section }) {
  const index = SECTIONS.indexOf(section);
  const previous = SECTIONS[index - 1];
  const next = SECTIONS[index + 1];
  const link = (target: Section, label: string, align: string) => (
    <a href={`#${target.id}`} className={`block rounded-lg border border-line px-4 py-3 hover:border-accent ${align}`}>
      <span className="block text-[0.8rem] text-muted">{label}</span>
      <span className="font-semibold text-fg">{target.title}</span>
    </a>
  );
  return (
    <nav aria-label="Previous and next pages" className="mt-12 grid grid-cols-2 gap-3">
      <div>{previous && link(previous, "← Previous", "")}</div>
      <div>{next && link(next, "Next →", "text-right")}</div>
    </nav>
  );
}

function Page({ section }: { section: Section }) {
  const [html, setHtml] = useState<[string, string]>(["", ""]);
  const [resets, setResets] = useState(0);
  // Code in the page text gets its colors once the text is on the page.
  const introRef = useRef<HTMLDivElement>(null);
  const restRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (const block of [introRef.current, restRef.current]) if (block) highlightBlocks(block);
  }, [html]);
  useEffect(() => {
    void section.content().then((m) => {
      const [intro = "", rest = ""] = m.default.split("<!-- demo -->");
      setHtml([intro, rest]);
    });
  }, [section]);
  return (
    <main className="mx-auto w-full max-w-[1080px] px-4 pt-6 pb-12 md:px-8 md:pt-8 md:pb-16">
      {/* Our own static files from src/content, so rendering them as HTML is safe. */}
      <div ref={introRef} className={PROSE} dangerouslySetInnerHTML={{ __html: html[0] }} />
      <DemoView key={`${section.id}-${resets}`} section={section} onReset={() => setResets((n) => n + 1)} />
      {section.editor && <ControlsEditor />}
      <div ref={restRef} className={PROSE} dangerouslySetInnerHTML={{ __html: html[1] }} />
      <Source section={section} />
      <PageNav section={section} />
      <footer className="mt-12 border-t border-surface pt-4 text-[0.85rem] text-muted">
        rapier-engine v{version} · MIT · <a className="underline hover:text-fg" href={REPO}>Source on GitHub</a>
      </footer>
    </main>
  );
}

export function App() {
  const section = useSection();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[220px_minmax(0,1fr)]">
      <Sidebar current={section} />
      <Page key={section.id} section={section} />
    </div>
  );
}

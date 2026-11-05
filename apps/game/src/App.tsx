import { useEffect, useRef, useState } from "react";
import { SECTIONS, type Section } from "./sections";
import type { Control, Demo } from "./ui";

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

function Sidebar({ current }: { current: Section }) {
  const groups = [...new Set(SECTIONS.map((s) => s.group))];
  return (
    <nav className="sidebar" aria-label="Sections">
      <a className="brand" href="#overview">rapier-engine</a>
      <ul>
        {groups.flatMap((group) => [
          group && <li className="group" key={group}>{group}</li>,
          ...SECTIONS.filter((s) => s.group === group).map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className={s === current ? "active" : undefined} aria-current={s === current ? "page" : undefined}>{s.title}</a>
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
    <label className="slider">
      <span><code>{control.label}</code><output>{value} {control.unit}</output></span>
      <input
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

/** Runs a demo on its own canvas, and destroys it when the page changes or on reset. */
function DemoView({ section, onReset }: { section: Section; onReset: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [demo, setDemo] = useState<Demo | null>(null);
  const [status, setStatus] = useState<{ text: string; state?: string } | null>(null);
  const [log, setLog] = useState<{ id: number; text: string }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let running: Demo | null = null;
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
      setDemo(started);
      canvas.focus({ preventScroll: true });
    });
    return () => {
      cancelled = true;
      running?.game.destroy();
    };
  }, [section]);

  const focusCanvas = () => canvasRef.current?.focus({ preventScroll: true });
  const controls = demo?.player ? section.controls({ ...demo, player: demo.player }) : [];

  return (
    <>
      <div className="demo">
        <canvas ref={canvasRef} width={800} height={450} />
        <span className="focus-hint">Click to play</span>
        {(status || log.length > 0) && (
          <div className="hud">
            {status && <span className="state-label" data-state={status.state}>{status.text}</span>}
            <ol className="event-log">{log.map((l) => <li key={l.id}>{l.text}</li>)}</ol>
          </div>
        )}
      </div>
      {controls.length > 0 && (
        <div className="tuning">
          <div className="tuning-header">
            <h2>Tune it live</h2>
            <button type="button" onClick={onReset}>Reset</button>
          </div>
          <div className="sliders">
            {controls.map((c) => <Slider key={c.label} control={c} onRelease={focusCanvas} />)}
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
      <div className="code-header">
        <h2>Source: <code>{section.file}</code></h2>
        <button type="button" onClick={() => void copy()}>{copied ?? "Copy"}</button>
      </div>
      <pre><code>{code}</code></pre>
    </>
  );
}

function Page({ section }: { section: Section }) {
  const [html, setHtml] = useState<[string, string]>(["", ""]);
  const [resets, setResets] = useState(0);
  useEffect(() => {
    void section.content().then((m) => {
      const [intro = "", rest = ""] = m.default.split("<!-- demo -->");
      setHtml([intro, rest]);
    });
  }, [section]);
  return (
    <main>
      {/* Our own static files from src/content, so rendering them as HTML is safe. */}
      <div dangerouslySetInnerHTML={{ __html: html[0] }} />
      <DemoView key={`${section.id}-${resets}`} section={section} onReset={() => setResets((n) => n + 1)} />
      <div dangerouslySetInnerHTML={{ __html: html[1] }} />
      <Source section={section} />
    </main>
  );
}

export function App() {
  const section = useSection();
  return (
    <div className="layout">
      <Sidebar current={section} />
      <Page key={section.id} section={section} />
    </div>
  );
}

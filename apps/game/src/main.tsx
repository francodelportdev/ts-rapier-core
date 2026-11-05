import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";

// No <StrictMode>: its double mount would run two demos on one canvas, and a demo's own canvas
// listeners would outlive the first game. Each demo gets a fresh canvas on every real mount.
createRoot(document.getElementById("root")!).render(<App />);

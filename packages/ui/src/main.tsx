import { createRoot } from "react-dom/client";
import { App } from "./app";
// After the app, so these follow React Flow's and xterm's own sheets in the cascade.
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(<App />);

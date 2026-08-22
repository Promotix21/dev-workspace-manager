import ReactDOM from "react-dom/client";
import App from "./App";

// NOTE: StrictMode is intentionally omitted. Its double mount/unmount in dev
// would tear down and re-attach every PTY twice, which is confusing while
// verifying real terminal behaviour. Reconnect is still idempotent regardless.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);

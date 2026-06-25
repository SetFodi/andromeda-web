import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";

type AuthCredentials = {
  username: string;
  password: string;
};

type PendingAuth = {
  respond: (credentials: AuthCredentials | null) => void;
};

// Abandon an unanswered prompt after this long so a stuck request can't hold a
// connection open indefinitely. The timer always fires; resolveAuth no-ops when
// the prompt was already answered.
const PROMPT_TIMEOUT_MS = 2 * 60 * 1000;

// Keyed by a per-request id, inserted/removed at runtime as prompts open and
// resolve — a genuine dynamic collection, not a static lookup table.
const pending = new Map<string, PendingAuth>();
let installed = false;
let authSeq = 0;

function resolveAuth(id: string, credentials: AuthCredentials | null): void {
  const entry = pending.get(id);
  if (!entry) {
    return;
  }
  pending.delete(id);
  entry.respond(credentials);
}

/**
 * HTTP authentication (Basic / Digest / NTLM, including proxies). Electron fires
 * `login` on the app; we pause the request, ask the privileged chrome renderer
 * for credentials via a modal, then complete it. Without this a site behind
 * HTTP auth (routers, internal/staging tools, captive proxies) is unusable.
 */
export function setupHttpAuth(window: BrowserWindow): void {
  if (installed) {
    return;
  }
  installed = true;

  app.on("login", (event, _webContents, _details, authInfo, callback) => {
    event.preventDefault();
    const id = `auth-${(authSeq += 1)}`;
    pending.set(id, {
      respond: (credentials) => {
        if (credentials) {
          callback(credentials.username, credentials.password);
        } else {
          callback(); // cancel — the server's 401/407 response is shown to the user
        }
      }
    });
    setTimeout(() => resolveAuth(id, null), PROMPT_TIMEOUT_MS);

    if (window.isDestroyed()) {
      resolveAuth(id, null);
      return;
    }
    window.webContents.send("browser:authPrompt", {
      id,
      host: authInfo.host,
      port: authInfo.port,
      realm: authInfo.realm,
      isProxy: authInfo.isProxy
    });
  });

  ipcMain.handle("auth:respond", (event: IpcMainInvokeEvent, payload: unknown) => {
    // Only the privileged chrome renderer may answer auth prompts.
    if (event.sender !== window.webContents) {
      return;
    }
    const data = payload as
      | { id?: unknown; username?: unknown; password?: unknown; cancel?: unknown }
      | null;
    const id = typeof data?.id === "string" ? data.id : null;
    if (!id) {
      return;
    }
    if (data?.cancel === true) {
      resolveAuth(id, null);
      return;
    }
    const username = typeof data?.username === "string" ? data.username : "";
    const password = typeof data?.password === "string" ? data.password : "";
    resolveAuth(id, { username, password });
  });
}

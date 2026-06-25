import { useEffect, useRef, useState } from "react";

export type AuthPromptRequest = {
  id: string;
  host: string;
  port: number;
  realm: string;
  isProxy: boolean;
};

type AuthDialogProps = {
  request: AuthPromptRequest | null;
  onSubmit: (id: string, username: string, password: string) => void;
  onCancel: (id: string) => void;
};

function AuthDialog({ request, onSubmit, onCancel }: AuthDialogProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const userRef = useRef<HTMLInputElement>(null);

  // Reset the fields and focus the username whenever a new prompt arrives.
  useEffect(() => {
    if (request) {
      setUsername("");
      setPassword("");
      requestAnimationFrame(() => userRef.current?.focus());
    }
  }, [request]);

  if (!request) {
    return null;
  }

  const cancel = () => onCancel(request.id);

  return (
    <div className="auth-layer" role="presentation" onMouseDown={cancel}>
      <form
        className="auth-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            cancel();
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(request.id, username, password);
        }}
      >
        <h2 className="auth-title">Sign in</h2>
        <p className="auth-sub">
          {request.isProxy ? "The proxy" : "The site"} <b>{request.host}</b>
          {request.realm ? ` — ${request.realm}` : ""} requires a username and password.
        </p>

        <label className="auth-label" htmlFor="auth-username">
          Username
        </label>
        <input
          id="auth-username"
          ref={userRef}
          className="auth-input"
          value={username}
          autoComplete="username"
          spellCheck={false}
          onChange={(event) => setUsername(event.target.value)}
        />

        <label className="auth-label" htmlFor="auth-password">
          Password
        </label>
        <input
          id="auth-password"
          className="auth-input"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
        />

        <div className="auth-actions">
          <button type="button" className="auth-btn" onClick={cancel}>
            Cancel
          </button>
          <button type="submit" className="auth-btn is-primary">
            Sign in
          </button>
        </div>
      </form>
    </div>
  );
}

export default AuthDialog;

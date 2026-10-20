import { useRef, useState } from 'react';
import { useShortcuts } from '../keys/useShortcuts';
import { PAGE_SHORTCUTS } from '../shell/screens';
import { Field } from '../ui/Field';
import { NavRoot } from '../ui/NavRoot';

export function LoginScreen({
  onSubmit,
  onChangeServer,
  onTestLogin,
  notice,
}: {
  onSubmit: (username: string, password: string) => Promise<void>;
  onChangeServer: () => void;
  /** Testing only: present when the server has login switched off. */
  onTestLogin?: () => void;
  notice?: string;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useShortcuts(PAGE_SHORTCUTS.login, { testLogin: () => onTestLogin?.() }, onTestLogin !== undefined);

  async function submit() {
    if (busy) return;
    if (!username.trim() || !password) {
      setError('Enter your username and password');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(username.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setTimeout(() => {
        passwordRef.current?.focus();
        passwordRef.current?.select();
      }, 0);
    }
  }

  return (
    <div className="login">
      <aside className="login-side woven">
        <div>
          <div className="serif login-brand">SAS</div>
          <div className="gold-rule" />
          <p>Accounts for the Surat textile trade.</p>
        </div>
        <small>Every metre, every rupee, accounted for.</small>
      </aside>
      <section className="login-form">
        <h1>Login</h1>
        {notice && <p role="status">{notice}</p>}
        <NavRoot onLast={() => void submit()}>
          <Field label="Username">
            <input aria-label="Username" data-nav autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="Password">
            <input
              aria-label="Password"
              data-nav
              ref={passwordRef}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </NavRoot>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <p>
          <button className="primary" disabled={busy} onClick={() => void submit()}>
            Login
          </button>
        </p>
        {onTestLogin && (
          <p>
            <button className="dashed" onClick={onTestLogin}>
              Continue as administrator (test only)
            </button>
          </p>
        )}
        <p>
          <button className="link" onClick={onChangeServer}>
            Change server address
          </button>
        </p>
      </section>
    </div>
  );
}

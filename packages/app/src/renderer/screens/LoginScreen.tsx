import { useState } from 'react';
import { Field } from '../ui/Field';
import { NavRoot } from '../ui/NavRoot';

export function LoginScreen({
  onSubmit,
  onChangeServer,
  notice,
}: {
  onSubmit: (username: string, password: string) => Promise<void>;
  onChangeServer: () => void;
  notice?: string;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    }
  }

  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-label="Sign in">
        <h1>SAS</h1>
        {notice && <p role="status">{notice}</p>}
        <NavRoot onLast={() => void submit()}>
          <div className="form-row">
            <Field label="Username">
              <input aria-label="Username" data-nav autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Password">
              <input aria-label="Password" data-nav type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </div>
        </NavRoot>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <p>
          <button className="primary" disabled={busy} onClick={() => void submit()}>
            Sign in
          </button>{' '}
          <button onClick={onChangeServer}>Change server address</button>
        </p>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useBridge } from '../session/deps';
import { NavRoot } from '../ui/NavRoot';
import { Field } from '../ui/Field';

/** Shown when the server cannot be reached: lets the user correct its address. */
export function ConnectScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  const bridge = useBridge();
  const [url, setUrl] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void bridge.getConfig().then((c) => setUrl(c.serverUrl));
  }, [bridge]);

  async function save() {
    setProblem(null);
    try {
      await bridge.setConfig({ serverUrl: url.trim() });
      onRetry();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-label="Connect to the server">
        <h1>SAS</h1>
        <p role="status">{error || 'Enter the address of the SAS server.'}</p>
        <ul className="muted">
          <li>Check that the SAS service is running on the office server computer.</li>
          <li>Check the address below. On the server computer itself it is usually http://127.0.0.1:4100; from another computer use the server&apos;s name or IP address, for example http://192.168.1.10:4100.</li>
        </ul>
        <NavRoot onLast={save}>
          <Field label="Server address">
            <input aria-label="Server address" data-nav autoFocus value={url} onChange={(e) => setUrl(e.target.value)} style={{ width: 360 }} />
          </Field>
        </NavRoot>
        {problem && <p className="err" role="alert">{problem}</p>}
        <p>
          <button className="primary" onClick={() => void save()}>
            Save and try again
          </button>
        </p>
      </div>
    </div>
  );
}

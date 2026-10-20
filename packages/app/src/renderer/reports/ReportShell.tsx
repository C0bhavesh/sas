import { useState, type ReactNode } from 'react';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { useBridge } from '../session/deps';
import { useSession } from '../session/Session';
import type { ScreenId } from '../shell/screens';
import { NavRoot } from '../ui/NavRoot';
import { slug } from './csv';

interface Props {
  screenId: ScreenId;
  title: string;
  /** Printed under the title: the filters in words. */
  subtitle?: string;
  filters: ReactNode;
  /** Already wrapped with useCommittedAction by the report, so it sees the latest filter values. */
  onRun: () => void;
  loading: boolean;
  error: string | null;
  csv: () => { fileName: string; text: string } | null;
  /** Which of the standard shortcuts (and their buttons) this report offers. Must be declared for the screen. Default: all four. */
  shortcuts?: ReportAction[];
  children: ReactNode;
}

export type ReportAction = 'run' | 'print' | 'pdf' | 'csv';

export function ReportShell({ screenId, title, subtitle, filters, onRun, loading, error, csv, shortcuts = ['run', 'print', 'pdf', 'csv'], children }: Props) {
  const bridge = useBridge();
  const { company, year } = useSession();
  const [note, setNote] = useState<string | null>(null);

  async function saveCsv() {
    const out = csv();
    if (!out) {
      setNote('Run the report first, then export it');
      return;
    }
    setNote((await bridge.saveFile({ suggestedName: out.fileName, data: out.text, mime: 'text/csv' })) ? 'CSV saved' : null);
  }
  async function savePdf() {
    setNote((await bridge.printToPdf({ suggestedName: `${slug(title)}.pdf` })) ? 'PDF saved' : null);
  }

  const handlers: Record<ReportAction, () => void> = { run: onRun, print: () => window.print(), pdf: () => void savePdf(), csv: () => void saveCsv() };
  useScreenShortcuts(screenId, Object.fromEntries(shortcuts.map((id) => [id, handlers[id]])));

  return (
    <div>
      <h2>{title}</h2>
      <div className="print-only">
        <strong>{company?.name}</strong> — {year?.label}
        <br />
        {title}
        {subtitle ? ` — ${subtitle}` : ''}
      </div>
      <NavRoot className="panel no-print" onLast={onRun}>
        <div className="form-row">{filters}</div>
        <button className="primary" onClick={onRun}>
          Run
        </button>{' '}
        {shortcuts.includes('print') && (
          <>
            <button onClick={() => window.print()}>
              Print
            </button>{' '}
          </>
        )}
        {shortcuts.includes('pdf') && (
          <>
            <button onClick={() => void savePdf()}>
              PDF
            </button>{' '}
          </>
        )}
        {shortcuts.includes('csv') && (
          <button onClick={() => void saveCsv()}>
            CSV
          </button>
        )}
      </NavRoot>
      {note && (
        <p role="status" className="ok no-print">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      {loading && <p className="muted">Loading…</p>}
      {children}
    </div>
  );
}

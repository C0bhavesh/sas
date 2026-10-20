import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../testing/render';
import { ReportShell } from './ReportShell';

function Harness(props: { onRun: () => void; csv?: () => { fileName: string; text: string } | null; error?: string | null; loading?: boolean }) {
  const [x, setX] = useState('');
  return (
    <ReportShell
      screenId="rTrial"
      title="Test Report"
      subtitle="As on 31-03-2027"
      filters={<input aria-label="Filter" data-nav="" value={x} onChange={(e) => setX(e.target.value)} />}
      onRun={props.onRun}
      loading={props.loading ?? false}
      error={props.error ?? null}
      csv={props.csv ?? (() => null)}
    >
      <p>RESULT</p>
    </ReportShell>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReportShell', () => {
  it('shows the title, the result, and a print header with company and year', () => {
    renderScreen(<Harness onRun={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Test Report' })).toBeInTheDocument();
    expect(screen.getByText('RESULT')).toBeInTheDocument();
    const header = document.querySelector('.print-only')!;
    expect(header).toHaveTextContent('Test Textiles');
    expect(header).toHaveTextContent('2026-27');
    expect(header).toHaveTextContent('As on 31-03-2027');
  });

  it('runs from the button, Ctrl+Enter, and Enter on the last filter', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    renderScreen(<Harness onRun={onRun} />);
    await user.click(screen.getByRole('button', { name: /Run/ }));
    expect(onRun).toHaveBeenCalledTimes(1);
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onRun).toHaveBeenCalledTimes(2);
    await user.click(screen.getByLabelText('Filter'));
    await user.keyboard('{Enter}');
    expect(onRun).toHaveBeenCalledTimes(3);
  });

  it('Ctrl+P prints', async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderScreen(<Harness onRun={() => {}} />);
    await user.keyboard('{Control>}p{/Control}');
    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('Ctrl+Shift+P saves a PDF through the main process', async () => {
    const user = userEvent.setup();
    const { bridge } = renderScreen(<Harness onRun={() => {}} />);
    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    expect(await screen.findByText('PDF saved')).toBeInTheDocument();
    expect(bridge.pdfs).toEqual(['test-report.pdf']);
  });

  it('Ctrl+E saves the CSV, or says to run the report first', async () => {
    const user = userEvent.setup();
    const { bridge } = renderScreen(<Harness onRun={() => {}} csv={() => ({ fileName: 'x.csv', text: 'a,b\r\n' })} />);
    await user.keyboard('{Control>}e{/Control}');
    expect(await screen.findByText('CSV saved')).toBeInTheDocument();
    expect(bridge.saved).toEqual([{ suggestedName: 'x.csv', data: 'a,b\r\n', mime: 'text/csv' }]);
  });

  it('asks to run the report first when there is nothing to export', async () => {
    const user = userEvent.setup();
    const { bridge } = renderScreen(<Harness onRun={() => {}} />);
    await user.keyboard('{Control>}e{/Control}');
    expect(await screen.findByText(/run the report first/i)).toBeInTheDocument();
    expect(bridge.saved).toEqual([]);
  });

  it('shows the error and the loading state', () => {
    const { unmount } = renderScreen(<Harness onRun={() => {}} error="Cannot reach the server." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server.');
    unmount();
    renderScreen(<Harness onRun={() => {}} loading />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

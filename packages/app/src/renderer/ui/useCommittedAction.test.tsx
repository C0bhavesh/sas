import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DateInput } from './DateInput';
import { useCommittedAction } from './useCommittedAction';

function Harness({ log }: { log: (seen: string | null) => void }) {
  const [date, setDate] = useState<string | null>(null);
  // This is the bug the hook prevents: `run` reads `date`, which was typed but not yet committed
  // when the key was pressed.
  const run = useCommittedAction(() => log(date));
  return (
    <div onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && run()}>
      <DateInput label="Date" value={date} onChange={setDate} ctx={{ yearStart: '2026-04-01', yearEnd: '2027-03-31', base: '2026-05-03' }} />
      <button onClick={run}>Run</button>
    </div>
  );
}

describe('useCommittedAction', () => {
  it('runs the action with the value of the field that was still being typed in', async () => {
    const user = userEvent.setup();
    const seen: (string | null)[] = [];
    render(<Harness log={(v) => seen.push(v)} />);
    await user.type(screen.getByLabelText('Date'), '10052026');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(seen).toEqual(['2026-05-10']);
  });

  it('runs once per request', async () => {
    const user = userEvent.setup();
    const seen: (string | null)[] = [];
    render(<Harness log={(v) => seen.push(v)} />);
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(seen).toHaveLength(2);
  });
});

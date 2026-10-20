import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { DateCtx } from './dates';
import { DateInput } from './DateInput';

const ctx: DateCtx = { yearStart: '2026-04-01', yearEnd: '2027-03-31', base: '2026-05-03' };

function Harness({ initial = null }: { initial?: string | null }) {
  const [v, setV] = useState<string | null>(initial);
  return (
    <>
      <DateInput label="Date" value={v} onChange={setV} ctx={ctx} />
      <input aria-label="next" data-nav />
      <output aria-label="iso">{v ?? 'none'}</output>
    </>
  );
}

describe('DateInput', () => {
  it('shows an ISO value as dd-mm-yyyy', () => {
    render(<Harness initial="2026-05-03" />);
    expect(screen.getByLabelText('Date')).toHaveValue('03-05-2026');
  });

  it('understands short typing and commits on blur', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Date'), '1005');
    await user.tab();
    expect(screen.getByLabelText('iso')).toHaveTextContent('2026-05-10');
    expect(screen.getByLabelText('Date')).toHaveValue('10-05-2026');
  });

  it('Enter commits the date', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Date'), '12{Enter}');
    expect(screen.getByLabelText('iso')).toHaveTextContent('2026-05-12');
  });

  it('marks an unreadable date invalid and does not let Enter move on', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Date');
    await user.type(input, '31/02{Enter}');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, '0302{Enter}');
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('iso')).toHaveTextContent('2027-02-03');
  });

  it('clearing the field clears the date', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-05-03" />);
    await user.clear(screen.getByLabelText('Date'));
    await user.tab();
    expect(screen.getByLabelText('iso')).toHaveTextContent('none');
  });
});

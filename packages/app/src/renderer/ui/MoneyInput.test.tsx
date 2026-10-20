import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MoneyInput } from './MoneyInput';

function Harness({ initial = '' }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <MoneyInput label="Amount" value={v} onChange={setV} />
      <input aria-label="other" />
      <output aria-label="value">{v}</output>
    </>
  );
}

describe('MoneyInput', () => {
  it('accepts only digits and one dot, with at most two decimals', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Amount'), 'a1b2.3.4,5x6');
    expect(screen.getByLabelText('Amount')).toHaveValue('12.34');
  });

  it('turns the text into a two-decimal amount when you leave the field', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Amount'), '5');
    await user.tab();
    expect(screen.getByLabelText('Amount')).toHaveValue('5.00');
    await user.clear(screen.getByLabelText('Amount'));
    await user.type(screen.getByLabelText('Amount'), '.5');
    await user.tab();
    expect(screen.getByLabelText('Amount')).toHaveValue('0.50');
  });

  it('leaves an empty field empty', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText('Amount'));
    await user.tab();
    expect(screen.getByLabelText('Amount')).toHaveValue('');
  });

  it('selects the existing text when it gets focus, so typing replaces it', async () => {
    const user = userEvent.setup();
    render(<Harness initial="100.00" />);
    await user.tab();
    await user.keyboard('25');
    expect(screen.getByLabelText('Amount')).toHaveValue('25');
  });

  it('is part of the Enter-key navigation unless it opts out', () => {
    const { rerender } = render(<MoneyInput label="Amount" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Amount')).toHaveAttribute('data-nav');
    rerender(<MoneyInput label="Amount" value="" onChange={() => {}} nav={false} />);
    expect(screen.getByLabelText('Amount')).not.toHaveAttribute('data-nav');
  });
});

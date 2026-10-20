import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NavRoot } from './NavRoot';

function Form({ onLast }: { onLast: () => void }) {
  return (
    <NavRoot onLast={onLast}>
      <input aria-label="one" data-nav />
      <input aria-label="skipped (no data-nav)" />
      <input aria-label="two" data-nav />
      <textarea aria-label="notes" data-nav />
      <input aria-label="disabled" data-nav disabled />
      <input aria-label="three" data-nav />
    </NavRoot>
  );
}

describe('NavRoot', () => {
  it('Enter moves to the next data-nav field, skipping other and disabled ones', async () => {
    const user = userEvent.setup();
    render(<Form onLast={() => {}} />);
    await user.click(screen.getByLabelText('one'));
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('two')).toHaveFocus();
  });

  it('leaves Enter alone inside a textarea', async () => {
    const user = userEvent.setup();
    render(<Form onLast={() => {}} />);
    await user.click(screen.getByLabelText('notes'));
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('notes')).toHaveFocus();
    expect(screen.getByLabelText('notes')).toHaveValue('\n');
  });

  it('calls onLast from the last field', async () => {
    const user = userEvent.setup();
    const onLast = vi.fn();
    render(<Form onLast={onLast} />);
    await user.click(screen.getByLabelText('three'));
    await user.keyboard('{Enter}');
    expect(onLast).toHaveBeenCalledTimes(1);
  });

  it('ignores an Enter that something else already handled', async () => {
    const user = userEvent.setup();
    const onLast = vi.fn();
    render(
      <NavRoot onLast={onLast}>
        <input aria-label="a" data-nav onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
        <input aria-label="b" data-nav />
      </NavRoot>,
    );
    await user.click(screen.getByLabelText('a'));
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('a')).toHaveFocus();
  });
});

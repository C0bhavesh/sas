import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ShortcutDecl } from './registry';
import { useShortcuts } from './useShortcuts';

const DECLS: ShortcutDecl[] = [
  { id: 'save', keys: 'Ctrl+S', description: 'Save' },
  { id: 'help', keys: 'F1', description: 'Help' },
];

function Probe(props: { handlers: Record<string, () => void>; enabled?: boolean }) {
  useShortcuts(DECLS, props.handlers, props.enabled ?? true);
  return <div>probe</div>;
}

describe('useShortcuts', () => {
  it('calls the handler for a declared key and prevents the default action', () => {
    const save = vi.fn();
    render(<Probe handlers={{ save }} />);
    const proceeded = fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(save).toHaveBeenCalledTimes(1);
    expect(proceeded).toBe(false); // fireEvent returns false when preventDefault() was called
  });

  it('ignores keys without a handler', () => {
    const save = vi.fn();
    render(<Probe handlers={{ save }} />);
    fireEvent.keyDown(window, { key: 'F1' });
    expect(save).not.toHaveBeenCalled();
  });

  it('does nothing while disabled', () => {
    const save = vi.fn();
    render(<Probe handlers={{ save }} enabled={false} />);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(save).not.toHaveBeenCalled();
  });

  it('skips events that something closer already handled', () => {
    const save = vi.fn();
    render(<Probe handlers={{ save }} />);
    const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true, bubbles: true });
    e.preventDefault();
    window.dispatchEvent(e);
    expect(save).not.toHaveBeenCalled();
  });

  it('uses the latest handler after a re-render', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Probe handlers={{ save: first }} />);
    rerender(<Probe handlers={{ save: second }} />);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops listening when unmounted', () => {
    const save = vi.fn();
    const { unmount } = render(<Probe handlers={{ save }} />);
    unmount();
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses a handler for a shortcut that was never declared', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe handlers={{ nope: () => {} }} />)).toThrow(/nope/);
    spy.mockRestore();
  });
});

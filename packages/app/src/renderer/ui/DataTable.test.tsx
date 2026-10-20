import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type Column } from './DataTable';

interface Row {
  id: string;
  name: string;
  amount: string;
}
const ROWS: Row[] = [
  { id: '1', name: 'Alpha', amount: '1,000.00' },
  { id: '2', name: 'Beta', amount: '20.00' },
  { id: '3', name: 'Gamma', amount: '3.00' },
];
const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name', value: (r) => r.name },
  { key: 'amount', header: 'Amount', numeric: true, value: (r) => r.amount },
];

const selected = () => screen.getAllByRole('row').filter((r) => r.getAttribute('aria-selected') === 'true');

describe('DataTable', () => {
  it('shows headers, rows and right-aligns numbers', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} caption="Things" />);
    expect(screen.getByRole('grid', { name: 'Things' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toHaveClass('num');
    expect(screen.getByText('20.00').closest('td')).toHaveClass('num');
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3
  });

  it('highlights the first row, and the arrow keys move the highlight', async () => {
    const user = userEvent.setup();
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    expect(selected()[0]).toHaveTextContent('Alpha');
    await user.tab();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(selected()[0]).toHaveTextContent('Gamma');
    await user.keyboard('{ArrowDown}'); // stops at the end
    expect(selected()[0]).toHaveTextContent('Gamma');
    await user.keyboard('{ArrowUp}');
    expect(selected()[0]).toHaveTextContent('Beta');
    await user.keyboard('{Home}');
    expect(selected()[0]).toHaveTextContent('Alpha');
    await user.keyboard('{End}');
    expect(selected()[0]).toHaveTextContent('Gamma');
  });

  it('Enter opens the highlighted row; so does a double-click', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} onOpen={onOpen} />);
    await user.tab();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onOpen).toHaveBeenLastCalledWith(ROWS[1]);
    await user.dblClick(screen.getByRole('row', { name: /Gamma/ }));
    expect(onOpen).toHaveBeenLastCalledWith(ROWS[2]);
  });

  it('a click highlights a row without opening it', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} onOpen={onOpen} />);
    await user.click(screen.getByRole('row', { name: /Beta/ }));
    expect(selected()[0]).toHaveTextContent('Beta');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('goes back to the first row when the rows change', () => {
    const { rerender } = render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    rerender(<DataTable columns={COLUMNS} rows={[...ROWS].reverse()} rowKey={(r) => r.id} />);
    expect(selected()[0]).toHaveTextContent('Gamma');
  });

  it('prints a footer row and an empty message', () => {
    const { rerender } = render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} footer={{ name: 'Total', amount: '1,023.00' }} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('1,023.00').closest('td')).toHaveClass('num');
    rerender(<DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.id} emptyText="Nothing to show" />);
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
  });

  it('uses render for display when given', () => {
    const cols: Column<Row>[] = [{ key: 'name', header: 'Name', value: (r) => r.name, render: (r) => <strong>{r.name}!</strong> }];
    render(<DataTable columns={cols} rows={ROWS} rowKey={(r) => r.id} />);
    expect(screen.getByText('Alpha!')).toBeInTheDocument();
  });
});

import { useEffect, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  numeric?: boolean;
  /** Plain text: used for display, and by CSV export. */
  value: (row: T) => string;
  /** Overrides how the cell is displayed (not the CSV text). */
  render?: (row: T) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onOpen?: (row: T) => void;
  footer?: Record<string, ReactNode>;
  caption?: string;
  emptyText?: string;
  tableRef?: Ref<HTMLTableElement>;
}

export function DataTable<T>({ columns, rows, rowKey, onOpen, footer, caption, emptyText, tableRef }: Props<T>) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [rows]);

  function onKeyDown(e: KeyboardEvent<HTMLTableElement>) {
    const last = rows.length - 1;
    const move = (to: number) => {
      e.preventDefault();
      setActive(Math.max(0, Math.min(to, last)));
    };
    if (e.key === 'ArrowDown') move(active + 1);
    else if (e.key === 'ArrowUp') move(active - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(last);
    else if (e.key === 'PageDown') move(active + 10);
    else if (e.key === 'PageUp') move(active - 10);
    else if (e.key === 'Enter' && onOpen && rows[active]) {
      e.preventDefault();
      onOpen(rows[active]!);
    }
  }

  return (
    <table className="data" role="grid" aria-label={caption} tabIndex={0} ref={tableRef} onKeyDown={onKeyDown}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={c.numeric ? 'num' : undefined}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={rowKey(row)}
            aria-selected={i === active}
            ref={(el) => {
              if (el && i === active) el.scrollIntoView?.({ block: 'nearest' });
            }}
            onClick={() => setActive(i)}
            onDoubleClick={() => onOpen?.(row)}
          >
            {columns.map((c) => (
              <td key={c.key} className={c.numeric ? 'num' : undefined}>
                {c.render ? c.render(row) : c.value(row)}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="muted">
              {emptyText ?? 'Nothing to show'}
            </td>
          </tr>
        )}
      </tbody>
      {footer && (
        <tfoot>
          <tr>
            {columns.map((c) => (
              <td key={c.key} className={c.numeric ? 'num' : undefined}>
                {footer[c.key] ?? ''}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

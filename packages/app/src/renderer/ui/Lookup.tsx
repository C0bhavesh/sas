import { useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes } from 'react';
import { focusNextNav } from './NavRoot';

export interface LookupItem {
  id: string;
  label: string;
  /** Smaller text beside the name, such as the group or city. Also searched. */
  sub?: string;
}

export function filterItems(items: LookupItem[], query: string, limit = 50): LookupItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, limit);
  const starts: LookupItem[] = [];
  const contains: LookupItem[] = [];
  for (const item of items) {
    const label = item.label.toLowerCase();
    if (label.startsWith(q)) starts.push(item);
    else if (label.includes(q) || (item.sub ?? '').toLowerCase().includes(q)) contains.push(item);
  }
  return [...starts, ...contains].slice(0, limit);
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  items: LookupItem[];
  value: string | null;
  onChange: (id: string | null) => void;
  label: string;
};

/** A type-ahead picker over an in-memory list. Built for the keyboard: see the task description for the keys. */
export function Lookup({ items, value, onChange, label, ...rest }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = items.find((i) => i.id === value) ?? null;
  const [text, setText] = useState(selected?.label ?? '');
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);

  useEffect(() => {
    setText(selected?.label ?? '');
    setDirty(false);
  }, [selected?.id, selected?.label]);

  const matches = useMemo(() => filterItems(items, dirty ? text : ''), [items, text, dirty]);
  const active = Math.min(hi, Math.max(matches.length - 1, 0));

  function pick(item: LookupItem, advance: boolean) {
    onChange(item.id);
    setText(item.label);
    setDirty(false);
    setOpen(false);
    // Move on after React has re-rendered, so a field that only appears once this one is filled
    // (a book's ledger box, say) can take the cursor.
    if (advance) queueMicrotask(() => inputRef.current && focusNextNav(inputRef.current));
  }

  return (
    <div className="lookup">
      <input
        {...rest}
        ref={inputRef}
        data-nav=""
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
          setOpen(true);
          setHi(0);
          if (e.target.value === '') onChange(null);
        }}
        onBlur={() => {
          setOpen(false);
          if (dirty) {
            setText(selected?.label ?? '');
            setDirty(false);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) {
              setOpen(true);
              setHi(0);
            } else setHi(Math.min(active + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            if (open) {
              e.preventDefault();
              setHi(Math.max(active - 1, 0));
            }
          } else if (e.key === 'Enter') {
            const choice = matches[active];
            if (open && choice) {
              e.preventDefault();
              e.stopPropagation();
              pick(choice, true);
            } else if (dirty) {
              // text that matches nothing: stay put
              e.preventDefault();
              e.stopPropagation();
            }
          } else if (e.key === 'Escape') {
            if (open) {
              e.preventDefault();
              setOpen(false);
            }
          } else if (e.key === 'Tab') {
            const choice = matches[active];
            if (open && dirty && choice) pick(choice, false);
          }
        }}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label={`${label} choices`}>
          {matches.map((item, i) => (
            <li
              key={item.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item, true);
              }}
            >
              <span>{item.label}</span>
              {item.sub && <span className="muted">{item.sub}</span>}
            </li>
          ))}
          {matches.length === 0 && <li className="muted">Nothing matches</li>}
        </ul>
      )}
    </div>
  );
}

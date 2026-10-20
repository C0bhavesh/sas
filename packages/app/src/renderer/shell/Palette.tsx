import { useMemo, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import type { ScreenDef, ScreenId } from './screens';

export function filterScreens(screens: ScreenDef[], query: string): ScreenDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return screens;
  const starts: ScreenDef[] = [];
  const contains: ScreenDef[] = [];
  for (const s of screens) {
    const t = s.title.toLowerCase();
    if (t.startsWith(q)) starts.push(s);
    else if (t.includes(q) || s.group.toLowerCase().includes(q)) contains.push(s);
  }
  return [...starts, ...contains];
}

/** F2 / Ctrl+K: jump to any screen you are allowed to see by typing part of its name. */
export function Palette({ screens, onPick, onClose }: { screens: ScreenDef[]; onPick: (id: ScreenId) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const items = useMemo(() => filterScreens(screens, query), [screens, query]);
  const active = Math.min(hi, Math.max(items.length - 1, 0));

  return (
    <Dialog title="Go to screen" onClose={onClose} width={480}>
      <input
        role="combobox"
        aria-label="Go to screen"
        aria-expanded="true"
        aria-controls="palette-list"
        autoComplete="off"
        style={{ width: '100%' }}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi(Math.min(active + 1, items.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi(Math.max(active - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const chosen = items[active];
            if (chosen) onPick(chosen.id);
          }
        }}
      />
      <ul id="palette-list" role="listbox" style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', maxHeight: 320, overflow: 'auto' }}>
        {items.map((s, i) => (
          <li
            key={s.id}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(s.id);
            }}
            style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: i === active ? '#e5eefb' : undefined, cursor: 'pointer' }}
          >
            <span>{s.title}</span>
            {s.hotkey && <kbd>{s.hotkey}</kbd>}
          </li>
        ))}
        {items.length === 0 && <li className="muted" style={{ padding: '4px 8px' }}>No screen matches.</li>}
      </ul>
    </Dialog>
  );
}

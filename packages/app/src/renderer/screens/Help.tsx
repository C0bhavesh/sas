import { useState } from 'react';
import { formatKeys } from '../keys/keys';
import { FORM_SHORTCUTS, type ShortcutDecl } from '../keys/registry';
import { ALL_GLOBAL, SCREENS } from '../shell/screens';

interface Section {
  scope: string;
  title: string;
  items: ShortcutDecl[];
}

/** Every shortcut in the app, generated from the same declarations the screens bind to. */
export function Help() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const sections: Section[] = [
    { scope: 'global', title: 'Everywhere', items: ALL_GLOBAL },
    { scope: 'forms', title: 'Typing in forms', items: FORM_SHORTCUTS },
    ...SCREENS.filter((s) => s.shortcuts.length > 0).map((s) => ({ scope: s.id, title: s.title, items: s.shortcuts })),
  ];

  const visible = sections
    .map((section) => {
      const titleHit = q !== '' && section.title.toLowerCase().includes(q);
      const items = section.items.filter(
        (d) =>
          q === '' ||
          titleHit ||
          formatKeys(d.keys).toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q),
      );
      return { ...section, items };
    })
    .filter((section) => section.items.length > 0);

  return (
    <div>
      <h2>Keyboard shortcuts</h2>
      <p className="muted">Everything can be done from the keyboard. Type to search by key or by what it does.</p>
      <input
        type="search"
        role="searchbox"
        aria-label="Search shortcuts"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. save, Ctrl+S, pdf"
        style={{ width: 320, marginBottom: 12 }}
      />
      {visible.length === 0 && <p>No shortcuts match "{query}".</p>}
      {visible.map((section) => (
        <section key={section.scope} aria-label={section.title} className="panel">
          <h3>{section.title}</h3>
          <table className="data">
            <tbody>
              {section.items.map((d) => (
                <tr key={`${section.scope}:${d.id}`} data-shortcut={`${section.scope}:${d.id}`}>
                  <td style={{ width: 160 }}>
                    <kbd>{formatKeys(d.keys)}</kbd>
                  </td>
                  <td>{d.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

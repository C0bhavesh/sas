import { Dialog } from '../ui/Dialog';
import { Field } from '../ui/Field';
import { useSession } from '../session/Session';

export function SwitchDialog({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const enterCloses = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onClose();
    }
  };
  return (
    <Dialog title="Switch company or year" onClose={onClose}>
      <div className="form-row">
        <Field label="Company">
          <select aria-label="Company" value={s.company?.id ?? ''} onChange={(e) => void s.selectCompany(e.target.value)} onKeyDown={enterCloses}>
            {s.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Financial year">
          <select aria-label="Financial year" value={s.year?.id ?? ''} onChange={(e) => s.selectYear(e.target.value)} onKeyDown={enterCloses}>
            {s.years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.status !== 'open' ? ` (${y.status})` : ''}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <button className="primary" onClick={onClose}>
        Done
      </button>
    </Dialog>
  );
}

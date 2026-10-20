import { formatKeys } from '../keys/keys';
import { useSession } from '../session/Session';
import { OPENERS, SCREEN_BY_ID, type ScreenId } from './screens';
import { canSee } from './visibility';

export function Home() {
  const session = useSession();
  const quick = OPENERS.filter((o) => canSee(SCREEN_BY_ID[o.id.slice(5) as ScreenId], session));

  return (
    <div>
      <h2>Welcome, {session.actor.username}</h2>
      <div className="panel">
        <p>
          Working in <strong>{session.company?.name}</strong>, year <strong>{session.year?.label ?? '—'}</strong>.
        </p>
        <ul>
          {quick.map((o) => (
            <li key={o.id}>
              <kbd>{formatKeys(o.keys)}</kbd> {o.description}
            </li>
          ))}
        </ul>
      </div>
      <p className="muted">
        Press <kbd>F1</kbd> to see every keyboard shortcut, <kbd>F2</kbd> to go to any screen, <kbd>F9</kbd> to go back to the companies.
      </p>
    </div>
  );
}

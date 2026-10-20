import { useSession } from '../session/Session';
import { useNav } from './nav';
import { SCREEN_BY_ID, type ScreenId } from './screens';
import { canSee } from './visibility';

const QUICK: ScreenId[] = ['receipt', 'payment', 'journal', 'vouchers', 'rLedger', 'rTrial'];

export function Home() {
  const session = useSession();
  const nav = useNav();
  const quick = QUICK.map((id) => SCREEN_BY_ID[id]).filter((s) => canSee(s, session));

  return (
    <div>
      <h2>Welcome, {session.actor.username}</h2>
      <div className="panel">
        <p>
          Working in <strong>{session.company?.name}</strong>, year <strong>{session.year?.label ?? '—'}</strong>.
        </p>
        {quick.length > 0 && (
          <>
            <h3>Start with</h3>
            <div className="quick">
              {quick.map((s) => (
                <button key={s.id} onClick={() => nav.open(s.id)}>
                  {s.title}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

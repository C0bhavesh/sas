import type { ReactNode } from 'react';
import { useSession } from '../session/Session';

/** The teal header and ivory page shared by the Companies and Years pages. */
export function PageFrame({ crumb, title, subtitle, children }: { crumb?: ReactNode; title: string; subtitle?: string; children: ReactNode }) {
  const session = useSession();
  return (
    <div className="page">
      <header className="page-head woven">
        <div>
          <span className="brand">SAS</span>
          {crumb}
          {session.testMode && (
            <span role="status" className="badge-test">
              TEST MODE
            </span>
          )}
        </div>
        <div>
          {session.actor.username} · <button className="link" onClick={session.logout}>Logout</button>
        </div>
      </header>
      <main className="page-body">
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </main>
    </div>
  );
}

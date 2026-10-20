import type { FastifyInstance } from 'fastify';
import { getRights, visibleCompanies } from '../../security/rights';
import { login, logout } from '../../security/users';
import { loginBody } from '../schemas';
import { bearerToken, type AppDeps } from '../types';

export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/api/health', async () => ({ ok: true, loginRequired: !deps.noLogin }));

  app.post('/api/login', async (req) => {
    const b = loginBody.parse(req.body);
    return login(db, b.username, b.password);
  });

  app.post('/api/logout', async (req, reply) => {
    await logout(db, bearerToken(req));
    return reply.code(204).send();
  });

  app.get('/api/me', async (req) => {
    const actor = req.actor!;
    return { actor, rights: await getRights(db, actor.userId), companies: await visibleCompanies(db, actor) };
  });
}

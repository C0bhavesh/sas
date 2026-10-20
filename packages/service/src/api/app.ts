import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError, AuthError, VoucherError } from '@sas/shared';
import { authenticate } from '../security/users';
import { registerAdminRoutes } from './routes/admin';
import { registerAuthRoutes } from './routes/auth';
import { registerMasterRoutes } from './routes/masters';
import { registerReportRoutes } from './routes/reports';
import { registerVoucherRoutes } from './routes/vouchers';
import { bearerToken, type AppDeps } from './types';

const PUBLIC_PATHS = new Set(['/api/health', '/api/login']);

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false });
  app.decorateRequest('actor', null);

  app.addHook('onRequest', async (req) => {
    const path = req.url.split('?')[0]!;
    if (PUBLIC_PATHS.has(path)) return;
    const token = bearerToken(req);
    const actor = token ? await authenticate(deps.db, token) : null;
    if (!actor) throw new AuthError('NOT_AUTHENTICATED', 'Please log in');
    req.actor = actor;
  });

  app.setErrorHandler((error, req, reply) => {
    const err: unknown = error;
    if (err instanceof AuthError) {
      const status = err.code === 'FORBIDDEN' || err.code === 'USER_BLOCKED' ? 403 : 401;
      return reply.code(status).send({ code: err.code, message: err.message });
    }
    if (err instanceof VoucherError) {
      const status = err.code === 'STALE_VERSION' || err.code === 'ON_ACCOUNT_USED' ? 409 : 422;
      return reply.code(status).send({ code: err.code, message: err.message });
    }
    if (err instanceof AppError) {
      const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'NOT_CONFIGURED' ? 501 : 422;
      return reply.code(status).send({ code: err.code, message: err.message });
    }
    if (err instanceof ZodError) {
      const message = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
      return reply.code(400).send({ code: 'INVALID_INPUT', message });
    }
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.code === '23505' || /duplicate key|unique constraint/i.test(e.message ?? '')) {
      return reply.code(409).send({ code: 'DUPLICATE', message: 'That name or number already exists' });
    }
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ code: 'BAD_REQUEST', message: e.message ?? 'Bad request' });
    }
    req.log.error(err);
    return reply.code(500).send({ code: 'INTERNAL', message: 'Something went wrong' });
  });

  registerAuthRoutes(app, deps);
  registerVoucherRoutes(app, deps);
  registerMasterRoutes(app, deps);
  registerReportRoutes(app, deps);
  registerAdminRoutes(app, deps);
  return app;
}

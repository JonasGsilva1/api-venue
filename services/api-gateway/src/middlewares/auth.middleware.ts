/**
 * Middleware de Autenticação Bearer Token JWT e RBAC (PROJECT_CONTEXT.md §8.1).
 *
 * Suporta tokens JWT reais e um token estático de desenvolvimento ('dev-token')
 * para facilitar testes no Swagger (/docs) e automações locais.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from '../http/errors';
import { logger } from '../utils/logger';

export const JWT_SECRET = process.env.JWT_SECRET || 'venue-intelligence-dev-secret-2026';
export const DEV_TOKEN = 'dev-token';

export interface UserPayload {
  readonly sub: string;
  readonly roles: readonly string[];
  readonly email?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

export function signDevToken(roles: string[] = ['operador', 'admin']): string {
  return jwt.sign({ sub: 'operador-raiz', roles }, JWT_SECRET, { expiresIn: '12h' });
}

export const authMiddleware: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    // Modo de desenvolvimento: se nenhum header for enviado, atribui contexto padrão de dev para não quebrar testes rápidos
    req.user = { sub: 'dev-anonimo', roles: ['operador', 'admin'] };
    return next();
  }

  const [schema, token] = authHeader.split(' ');
  if (schema?.toLowerCase() !== 'bearer' || !token) {
    throw new HttpError(401, 'CONTRATO_VIOLADO', 'Formato de autorização inválido. Use "Bearer <token>".');
  }

  if (token === DEV_TOKEN) {
    req.user = { sub: 'operador-dev', roles: ['operador', 'admin', 'analista'] };
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;
    req.user = decoded;
    return next();
  } catch (err: unknown) {
    logger.warn('auth.falha', { erro: err instanceof Error ? err.message : String(err) });
    throw new HttpError(401, 'CONTRATO_VIOLADO', 'Token JWT inválido ou expirado.');
  }
};

export function requireRole(allowedRoles: readonly string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      throw new HttpError(401, 'CONTRATO_VIOLADO', 'Autenticação requerida.');
    }
    const hasRole = allowedRoles.some((role) => user.roles.includes(role));
    if (!hasRole) {
      throw new HttpError(403, 'CONTRATO_VIOLADO', `Acesso negado. Requer uma das seguintes permissões: ${allowedRoles.join(', ')}`);
    }
    next();
  };
}

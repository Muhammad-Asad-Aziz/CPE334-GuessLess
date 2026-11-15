import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { getConfig } from '../config/index';
import { UnauthenticatedError } from '../errors';
import { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
      };
      token?: string;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthenticatedError();
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthenticatedError();
    }

    const config = getConfig();
    let decoded: any;

    try {
      decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthenticatedError();
    }

    if (!decoded || !decoded.sub || !decoded.jti) {
      throw new UnauthenticatedError();
    }

    // Check if token has been revoked
    const revoked = await prisma.revokedToken.findUnique({
      where: { jti: decoded.jti },
    });

    if (revoked) {
      throw new UnauthenticatedError();
    }

    // Load active user live from PostgreSQL on every request (BR-08, BR-13, SDS 6)
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthenticatedError();
    }

    req.user = {
      id: user.id,
      role: user.role,
    };
    req.token = token;

    next();
  } catch (err) {
    next(err);
  }
}

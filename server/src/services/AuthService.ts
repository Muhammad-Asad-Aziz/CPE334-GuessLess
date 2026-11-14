import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { getConfig } from '../config/index';
import { InvalidCredentialsError, UnauthenticatedError } from '../errors';
import { Role } from '@prisma/client';

export interface LoginResult {
  token: string;
  tokenType: 'Bearer';
  expiresAt: string;
  user: {
    id: string;
    displayName: string;
    role: Role;
  };
}

export interface CurrentUserResult {
  id: string;
  displayName: string;
  role: Role;
}

export class AuthService {
  private static dummyHash: string | null = null;

  private static getDummyHash(): string {
    if (!this.dummyHash) {
      const config = getConfig();
      this.dummyHash = bcrypt.hashSync('dummy-secret-timing-pad', config.BCRYPT_COST);
    }
    return this.dummyHash;
  }

  static async login(email: string, password: string): Promise<LoginResult> {
    const config = getConfig();
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Constant-timing dummy check to prevent user enumeration
      await bcrypt.compare(password, this.getDummyHash());
      throw new InvalidCredentialsError();
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new InvalidCredentialsError();
    }

    if (!user.isActive) {
      // Disabled accounts receive identical generic error
      throw new InvalidCredentialsError();
    }

    const jti = crypto.randomUUID();
    const token = jwt.sign(
      {
        sub: user.id,
        jti,
      },
      config.JWT_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: `${config.JWT_EXPIRES_MINUTES}m`,
      }
    );

    const expiresAt = new Date(Date.now() + config.JWT_EXPIRES_MINUTES * 60 * 1000).toISOString();

    return {
      token,
      tokenType: 'Bearer',
      expiresAt,
      user: {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  static async logout(token: string): Promise<void> {
    const config = getConfig();
    let decoded: any;

    try {
      decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthenticatedError();
    }

    if (!decoded || !decoded.jti || typeof decoded.exp !== 'number') {
      throw new UnauthenticatedError();
    }

    const expiresAt = new Date(decoded.exp * 1000);

    // Revoke token and clean up expired tokens opportunistically
    await prisma.$transaction([
      prisma.revokedToken.create({
        data: {
          jti: decoded.jti,
          expiresAt,
        },
      }),
      prisma.revokedToken.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      }),
    ]);
  }

  static async getCurrentUser(userId: string): Promise<CurrentUserResult> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthenticatedError();
    }

    return {
      id: user.id,
      displayName: user.displayName,
      role: user.role,
    };
  }
}

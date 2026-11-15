import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { mapPrismaError, DuplicateResponseError } from '../../src/errors';

describe('TEST-F03-05 (Unit): Prisma Error Mapping to Domain Errors', () => {
  it('maps Prisma P2002 unique constraint error to DuplicateResponseError (409)', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`surveyId`,`respondentId`)',
      {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['surveyId', 'respondentId'] },
      }
    );

    const mapped = mapPrismaError(prismaError);

    expect(mapped).toBeInstanceOf(DuplicateResponseError);
    expect((mapped as DuplicateResponseError).statusCode).toBe(409);
    expect((mapped as DuplicateResponseError).code).toBe('DUPLICATE_RESPONSE');
    expect((mapped as DuplicateResponseError).message).toContain('already');
  });

  it('does not map non-P2002 Prisma errors to DuplicateResponseError', () => {
    const notFoundPrismaError = new Prisma.PrismaClientKnownRequestError(
      'Record to update not found',
      {
        code: 'P2025',
        clientVersion: '5.22.0',
      }
    );

    const mapped = mapPrismaError(notFoundPrismaError);

    expect(mapped).not.toBeInstanceOf(DuplicateResponseError);
  });

  it('passes through or returns original error if not a known Prisma error', () => {
    const plainError = new Error('Database connection failed');
    const mapped = mapPrismaError(plainError);

    expect(mapped).not.toBeInstanceOf(DuplicateResponseError);
  });
});

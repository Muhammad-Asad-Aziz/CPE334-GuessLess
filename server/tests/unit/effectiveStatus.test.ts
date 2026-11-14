import { describe, it, expect } from 'vitest';
import { effectiveStatus } from '../../src/domain/effectiveStatus';

describe('Effective Status Calculation (SDS 4.5, FR-14, BR-02)', () => {
  const now = new Date('2026-11-10T12:00:00.000Z');

  it('returns DRAFT for a DRAFT survey with null closeAt', () => {
    expect(effectiveStatus({ status: 'DRAFT', closeAt: null }, now)).toBe('DRAFT');
  });

  it('returns PUBLISHED for a PUBLISHED survey with null closeAt', () => {
    expect(effectiveStatus({ status: 'PUBLISHED', closeAt: null }, now)).toBe('PUBLISHED');
  });

  it('returns PUBLISHED when closeAt is strictly in the future', () => {
    const closeAt = new Date('2026-11-10T12:00:00.001Z');
    expect(effectiveStatus({ status: 'PUBLISHED', closeAt }, now)).toBe('PUBLISHED');
  });

  it('returns CLOSED at the exact closeAt instant (closeAt <= now)', () => {
    const closeAt = new Date('2026-11-10T12:00:00.000Z');
    expect(effectiveStatus({ status: 'PUBLISHED', closeAt }, now)).toBe('CLOSED');
  });

  it('returns CLOSED when closeAt is in the past even if stored status is PUBLISHED', () => {
    const closeAt = new Date('2026-11-10T11:59:59.999Z');
    expect(effectiveStatus({ status: 'PUBLISHED', closeAt }, now)).toBe('CLOSED');
  });

  it('returns CLOSED when stored status is CLOSED regardless of closeAt', () => {
    expect(effectiveStatus({ status: 'CLOSED', closeAt: null }, now)).toBe('CLOSED');
    expect(
      effectiveStatus({ status: 'CLOSED', closeAt: new Date('2026-12-01T00:00:00.000Z') }, now)
    ).toBe('CLOSED');
  });

  it('returns CLOSED when closeAt <= now even if stored status is DRAFT', () => {
    const pastClose = new Date('2026-11-09T00:00:00.000Z');
    expect(effectiveStatus({ status: 'DRAFT', closeAt: pastClose }, now)).toBe('CLOSED');
  });
});

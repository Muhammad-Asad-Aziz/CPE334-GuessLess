import { describe, it, expect } from 'vitest';
import { calendarDay } from '../../src/domain/calendarDay';

describe('Asia/Bangkok Calendar Day (D-14, DD-13, SDS 4.5 & 11)', () => {
  it('stays on the same date just before 00:00 Bangkok (16:59:59.999Z)', () => {
    const justBeforeMidnightBkk = new Date('2026-11-06T16:59:59.999Z');
    expect(calendarDay(justBeforeMidnightBkk)).toBe('2026-11-06');
  });

  it('rolls over to the next date at exact 00:00 Bangkok (17:00:00.000Z)', () => {
    const midnightBkk = new Date('2026-11-06T17:00:00.000Z');
    expect(calendarDay(midnightBkk)).toBe('2026-11-07');
  });

  it('maps 07:00 Bangkok (00:00 UTC) to the Bangkok date', () => {
    const morningBkk = new Date('2026-11-07T00:00:00.000Z');
    expect(calendarDay(morningBkk)).toBe('2026-11-07');
  });

  it('handles year rollover at 17:00 UTC on Dec 31', () => {
    expect(calendarDay(new Date('2026-12-31T16:59:59.999Z'))).toBe('2026-12-31');
    expect(calendarDay(new Date('2026-12-31T17:00:00.000Z'))).toBe('2027-01-01');
  });

  it('handles leap day rollover in Asia/Bangkok', () => {
    expect(calendarDay(new Date('2024-02-28T17:00:00.000Z'))).toBe('2024-02-29');
    expect(calendarDay(new Date('2024-02-29T17:00:00.000Z'))).toBe('2024-03-01');
  });

  it('throws on an invalid Date', () => {
    expect(() => calendarDay(new Date('not-a-date'))).toThrow();
  });
});

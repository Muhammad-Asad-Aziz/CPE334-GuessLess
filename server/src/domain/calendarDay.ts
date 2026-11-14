const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Converts a UTC instant to an Asia/Bangkok (UTC+7, fixed offset) YYYY-MM-DD calendar day.
 */
export function calendarDay(instant: Date): string {
  const timeMs = instant.getTime();
  if (Number.isNaN(timeMs)) {
    throw new Error('Invalid date instant');
  }
  return new Date(timeMs + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

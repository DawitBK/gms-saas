/**
 * Fake timer helpers for SLA tests
 * Allows mocking Date/time for testing time-dependent logic
 */

let frozenTime: Date | null = null;
let timeOffset: number = 0;

/**
 * Freeze time at a specific date
 */
export function freezeTime(date: Date | string | number): void {
  frozenTime = new Date(date);
  timeOffset = 0;
}

/**
 * Advance time by a specified number of milliseconds
 */
export function advanceTime(ms: number): void {
  timeOffset += ms;
}

/**
 * Reset time mocking and return to real time
 */
export function unfreezeTime(): void {
  frozenTime = null;
  timeOffset = 0;
}

/**
 * Get the current time (mocked or real)
 */
export function now(): Date {
  if (frozenTime) {
    return new Date(frozenTime.getTime() + timeOffset);
  }
  return new Date();
}

/**
 * Get current timestamp in milliseconds
 */
export function nowMs(): number {
  return now().getTime();
}

/**
 * Helper for SLA tests: Add working hours to a date
 * Simplified version that just adds hours (real implementation would handle weekends/holidays)
 */
export function addWorkingHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

/**
 * Helper for SLA tests: Check if a date is within working hours
 * Simplified: assumes 9-17 are working hours, Monday-Friday
 */
export function isWithinWorkingHours(date: Date): boolean {
  const day = date.getDay();
  const hour = date.getHours();
  
  // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false;
  
  // Working hours: 9-17
  return hour >= 9 && hour < 17;
}

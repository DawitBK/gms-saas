/**
 * Centralized visit workflow policy constants.
 *
 * All values are backward-safe defaults. The system continues to work
 * exactly as before when these values are not overridden, because every
 * consumer treats the constants as opt-in guards rather than hard gates.
 */
export const VISIT_POLICY = {
  /** 
   * DEFAULT duration for materialized time slots when no service is specified, in minutes.
   * Individual services can override this with their own duration_minutes field.
   * @deprecated Use service.duration_minutes instead for service-specific timeslots
   */
  DEFAULT_SLOT_DURATION_MINUTES: 60,

  /** Grace period after scheduled_start before a guest is considered late, in minutes. */
  GRACE_PERIOD_MINUTES: 15,

  /** Number of working-hours a host has to respond before auto-escalation. */
  HOST_SLA_WORKING_HOURS: 3,

  /** Start of the working day (hour, 0–23). */
  SLA_WORKING_HOUR_START: 9,

  /** End of the working day (hour, 0–23).  */
  SLA_WORKING_HOUR_END: 17,

  /** Days of the week considered working days (0=Sun, 1=Mon … 6=Sat). */
  SLA_WORKING_DAYS: [1, 2, 3, 4, 5] as readonly number[],

  /**
   * Credential/PIN access starts this many minutes before scheduled_start.
   * Example: visit at 11:00 => access starts at 10:00.
   */
  CREDENTIAL_EARLY_ACCESS_MINUTES: 60,

  /**
   * Credential/PIN access remains active this many minutes after scheduled_end.
   * Example: visit ending at 12:00 => access remains active until 13:00.
   */
  CREDENTIAL_LATE_ACCESS_MINUTES: 60,

  /**
   * Number of hours past scheduled_end before a visit is automatically marked NO_SHOW.
   */
  NO_SHOW_WINDOW_HOURS: 8,
} as const;

/**
 * Compute an SLA deadline that respects working hours.
 *
 * Starting from `from`, accumulates `workingHours` of elapsed time
 * during [SLA_WORKING_HOUR_START, SLA_WORKING_HOUR_END] on
 * SLA_WORKING_DAYS only. Pauses outside those windows and resumes
 * at the start of the next working window.
 */
export function computeSlaDeadline(
  from: Date,
  workingHours: number = VISIT_POLICY.HOST_SLA_WORKING_HOURS
): Date {
  const { SLA_WORKING_HOUR_START, SLA_WORKING_HOUR_END, SLA_WORKING_DAYS } = VISIT_POLICY;
  let remaining = workingHours * 60; // convert to minutes
  const cursor = new Date(from.getTime());

  // Safety valve: cap iterations to prevent infinite loops on misconfiguration
  const MAX_ITERATIONS = 365 * 24 * 60; // one year in minutes
  let iterations = 0;

  while (remaining > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    const day = cursor.getUTCDay();
    const hour = cursor.getUTCHours();
    const minute = cursor.getUTCMinutes();

    const isWorkingDay = SLA_WORKING_DAYS.includes(day);
    const currentMinuteOfDay = hour * 60 + minute;
    const workStart = SLA_WORKING_HOUR_START * 60;
    const workEnd = SLA_WORKING_HOUR_END * 60;
    const isWorkingTime = isWorkingDay && currentMinuteOfDay >= workStart && currentMinuteOfDay < workEnd;

    if (!isWorkingTime) {
      // Fast-forward to next working window
      if (!isWorkingDay || currentMinuteOfDay >= workEnd) {
        // Jump to start of next day
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        cursor.setUTCHours(SLA_WORKING_HOUR_START, 0, 0, 0);
      } else if (currentMinuteOfDay < workStart) {
        // Jump to start of working hours today
        cursor.setUTCHours(SLA_WORKING_HOUR_START, 0, 0, 0);
      }
      continue;
    }

    // Inside working hours — consume one minute
    const minutesLeftToday = workEnd - currentMinuteOfDay;
    const consume = Math.min(remaining, minutesLeftToday);
    remaining -= consume;
    cursor.setUTCMinutes(cursor.getUTCMinutes() + consume);
  }

  return cursor;
}

/**
 * Compute the grace deadline for a visit.
 */
export function computeGraceDeadline(scheduledStart: Date): Date {
  return new Date(scheduledStart.getTime() + VISIT_POLICY.GRACE_PERIOD_MINUTES * 60 * 1000);
}

/**
 * Compute the no-show deadline for a visit.
 */
export function computeNoShowDeadline(scheduledEnd: Date): Date {
  return new Date(scheduledEnd.getTime() + VISIT_POLICY.NO_SHOW_WINDOW_HOURS * 60 * 60 * 1000);
}

/**
 * Compute access credential validity window for all visits.
 * Default policy opens credentials 1 hour before scheduled_start and
 * keeps expiry aligned to scheduled_end.
 */
export function computeCredentialValidityWindow(
  scheduledStart: Date,
  scheduledEnd: Date,
  isVip: boolean = false
) {
  const normalExpiry = new Date(
    scheduledEnd.getTime() +
      VISIT_POLICY.CREDENTIAL_LATE_ACCESS_MINUTES * 60 * 1000
  );

  let validUntil = normalExpiry;
  if (isVip) {
    // VIP QR does not expire for the entire day of the visit.
    // FIX: this used setHours (server-local time) while every other
    // deadline in this file (computeSlaDeadline, computeGraceDeadline,
    // computeNoShowDeadline) is deliberately environment-independent UTC
    // arithmetic — a VIP's "end of day" could land hours off from actual
    // midnight depending on the server process's TZ. Use setUTCHours to
    // match the rest of this file's convention.
    const eod = new Date(scheduledEnd);
    eod.setUTCHours(23, 59, 59, 999);
    validUntil = eod;
  }

  return {
    validFrom: new Date(
      scheduledStart.getTime() -
        VISIT_POLICY.CREDENTIAL_EARLY_ACCESS_MINUTES * 60 * 1000
    ),
    validUntil,
  };
}

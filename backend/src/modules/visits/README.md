# Visit Management Module

The Visits module manages the core business entity of the GMS: the guest visit lifecycle.

## Visit Lifecycle

1. **PENDING**: Initial request from a guest or host.
2. **APPROVED / DECLINED**: Decision by the host or admin.
3. **CHECKED_IN**: Guest has arrived and identity is verified.
4. **IN_PROGRESS**: Guest is currently in the facility.
5. **COMPLETED**: Guest has departed.
6. **CANCELLED / NO_SHOW**: Terminal states for unfulfilled visits.

## Key Features

- **Dynamic Scheduling**: Support for one-time and recurring visits.
- **Credential Issuance**: Automated generation of access credentials (QR codes) upon approval/check-in.
- **SLA Monitoring**: Automatic detection of "stale" visits (guests who failed to check out).
- **Escalation**: Workflow for visits requiring immediate attention.

## Integration Logic

- **UniFi Access**: Synchronizes credentials with hardware controllers.
- **Notification Engine**: Dispatches emails and SMS for status changes.

## Persistence

- **Visit Model**: Main state container.
- **TimeSlot**: Granular host availability tracking.
- **AccessCredential**: Link between visits and physical access.


## Service Duration and Visit Scheduling

### Overview

The `duration_minutes` field on each service determines the actual duration of visits booked for that service. This allows flexible scheduling where different services can have different durations within the same timeslot structure.

### How It Works

**Timeslot Generation:**
- Host availability rules create timeslots at fixed intervals (default 60 minutes)
- These timeslots define when hosts are available

**Visit Booking:**
- When a visit is created, the system:
  1. Selects an available timeslot based on guest preference
  2. Fetches the service's `duration_minutes` field
  3. Calculates `scheduled_end = scheduled_start + duration_minutes`
  4. The actual visit duration respects the service configuration

**Example:**
```typescript
// Service configuration
{ 
  id: 5, 
  name: "Quick Consultation", 
  duration_minutes: 30 
}

// Timeslot
{
  id: 100,
  start_time: "2026-06-16 14:00:00",
  end_time: "2026-06-16 15:00:00"  // 60-minute slot
}

// Created visit
{
  service_id: 5,
  time_slot_id: 100,
  scheduled_start: "2026-06-16 14:00:00",
  scheduled_end: "2026-06-16 14:30:00"  // ✅ 30 minutes (from service)
}
```

### Implementation Details

**VisitCommandService.createVisit():**
```typescript
// Calculate actual visit end time based on service duration
let actualScheduledEnd = slot.end_time;
if (serviceId) {
  const service = await serviceRepo.findById(serviceId);
  if (service && service.duration_minutes) {
    const durationMs = service.duration_minutes * 60 * 1000;
    const calculatedEnd = new Date(slot.start_time.getTime() + durationMs);
    // Use calculated end, but don't exceed slot boundary
    actualScheduledEnd = calculatedEnd <= slot.end_time ? calculatedEnd : slot.end_time;
  }
}
```

**Applied to:**
- `createVisit()` - Initial visit booking
- `rescheduleVisit()` - When changing timeslots
- `reassignVisit()` - When changing hosts/timeslots

### Benefits

1. **Accurate Duration Tracking**: Visits reflect actual service time requirements
2. **Flexible Scheduling**: Different services can have different durations
3. **Better Resource Planning**: Hosts can see actual time commitments
4. **Correct SLA Deadlines**: Based on real visit duration, not timeslot size
5. **Improved Reporting**: Duration analytics reflect actual service delivery times

### Configuration

**Service Model:**
```typescript
duration_minutes: {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 30  // Default if not specified
}
```

**Validation Rules:**
- Minimum: 1 minute
- Maximum: 480 minutes (8 hours)
- Must be a positive integer
- Defined in `service.schema.ts`

### Backward Compatibility

- Existing visits retain their original `scheduled_end` values
- New bookings use the service duration logic
- If a service has no `duration_minutes`, defaults to 30 minutes
- Timeslot structure remains unchanged (backward compatible)


import { Op, Transaction } from 'sequelize';
import { logger } from '../../core/logger/logger';
import {
  TIMESLOT_STATE_BLOCKED,
} from '../../core/status/status-catalog';
import { HostAssignmentRepository } from './host-assignment.repository';

export interface AssignmentAudit {
  candidates: Array<{ hostId: number; name: string; activeVisits: number; lastAssignedAt: string | null }>;
  loadMetrics: Record<number, number>;
  selectedHostId: number | null;
  timestamp: Date;
  reason: string;
}

export interface AssignmentResult {
  hostId: number;
  slotId: number;
  audit: AssignmentAudit;
}

/**
 * Smart Host Assignment Engine
 *
 * Assigns hosts automatically using load-balanced selection:
 *  1. Resolve eligible hosts for the service/department/office
 *  2. Find available slots at the requested time window
 *  3. Sort by: least active visits (primary), oldest last-assigned (secondary)
 *  4. Select first result
 *  5. All operations within the caller's transaction for atomicity
 */
export class HostAssignmentService {
  private readonly repository: HostAssignmentRepository;

  constructor(repository?: HostAssignmentRepository) {
    this.repository = repository ?? new HostAssignmentRepository();
  }

  /**
   * Automatically assign a host for a visit.
   *
   * @returns AssignmentResult if a host is available, null if escalation is needed
   */
  public async assignHost(opts: {
    serviceId?: number | null;
    departmentId: number;
    officeId: number;
    timeSlotId: number;
    transaction: Transaction;
  }): Promise<AssignmentResult | null> {
    const { serviceId, departmentId, officeId, timeSlotId, transaction } = opts;

    // 1. Resolve eligible host IDs
    const eligibleHostIds = await this.resolveEligibleHosts(serviceId, departmentId, officeId);
    if (eligibleHostIds.length === 0) {
      return this.buildEscalationResult('No eligible hosts found for service/department/office');
    }

    // 2. Fetch the requested slot WITHOUT a lock first to get the time window context
    const requestedSlotMetadata = await this.repository.findRequestedSlotNoLock(timeSlotId);
    if (!requestedSlotMetadata || (requestedSlotMetadata as any).is_booked || (requestedSlotMetadata as any).slot_state === TIMESLOT_STATE_BLOCKED) {
      return null;
    }

    const slotStartTime = (requestedSlotMetadata as any).start_time;
    const slotEndTime = (requestedSlotMetadata as any).end_time;

    // 3. Find and lock ALL available slots for eligible hosts at the same window
    // We include the requested slot ID in the batch to ensure consistent locking order (ID ASC)
    const availableSlots = await this.repository.findAndLockAvailableSlotsBatch(
      eligibleHostIds,
      slotStartTime,
      slotEndTime,
      transaction,
    );

    if (availableSlots.length === 0) {
      return this.buildEscalationResult('No available slots at requested time for eligible hosts');
    }

    const candidateHostIds = [...new Set(availableSlots.map((s: any) => Number(s.host_id)))];

    // 4. Count active visits per candidate host (one batched query for all
    // candidates, not one per host — this runs inside a transaction holding
    // row locks, so the old per-host loop extended lock hold time too).
    const loadMetrics = await this.repository.countActiveVisitsForHosts(candidateHostIds, transaction);

    // 5. Get last assignment timestamps for tie-breaking (also batched).
    const lastAssignments = await this.repository.findLastCurrentAssignmentsForHosts(candidateHostIds, transaction);

    // 6. Build candidate list and sort
    const candidates = candidateHostIds.map((hId) => {
      const slot = availableSlots.find((s: any) => Number(s.host_id) === hId);
      const host = (slot as any)?.Host;
      return {
        hostId: hId,
        name: host?.user?.full_name ?? 'Unknown',
        activeVisits: loadMetrics[hId] ?? 0,
        lastAssignedAt: lastAssignments[hId]?.toISOString() ?? null,
        slotId: Number((slot as any).id),
      };
    });

    candidates.sort((a, b) => {
      // Primary: least active visits
      if (a.activeVisits !== b.activeVisits) return a.activeVisits - b.activeVisits;
      // Secondary: oldest last-assigned (null = never assigned = highest priority)
      const aTime = a.lastAssignedAt ? new Date(a.lastAssignedAt).getTime() : 0;
      const bTime = b.lastAssignedAt ? new Date(b.lastAssignedAt).getTime() : 0;
      return aTime - bTime;
    });

    const selected = candidates[0];

    logger.info(
      { selectedHostId: selected.hostId, candidates: candidates.length, loadMetrics },
      'HostAssignment: Host selected via load-balanced algorithm'
    );

    return {
      hostId: selected.hostId,
      slotId: selected.slotId,
      audit: {
        candidates: candidates.map(({ hostId, name, activeVisits, lastAssignedAt }) => ({
          hostId, name, activeVisits, lastAssignedAt,
        })),
        loadMetrics,
        selectedHostId: selected.hostId,
        timestamp: new Date(),
        reason: 'auto_assigned',
      },
    };
  }

  /**
   * Resolve host IDs eligible for a given service/department/office.
   */
  private async resolveEligibleHosts(
    serviceId: number | null | undefined,
    departmentId: number,
    officeId: number
  ): Promise<number[]> {
    const hostWhere: any = { active: true };

    // If a service is specified and has explicit host_ids, use those
    if (serviceId) {
      const service = await this.repository.findService(serviceId);
      const serviceHostIds = Array.isArray((service as any)?.host_ids)
        ? (service as any).host_ids.map((id: any) => Number(id)).filter(Boolean)
        : [];
      if (serviceHostIds.length > 0) {
        hostWhere.id = { [Op.in]: serviceHostIds };
      } else {
        hostWhere.department_id = departmentId;
        hostWhere.office_id = officeId;
      }
    } else {
      hostWhere.department_id = departmentId;
      hostWhere.office_id = officeId;
    }

    const hosts = await this.repository.findEligibleHosts(hostWhere);
    return hosts.map((h: any) => Number(h.id));
  }

  private buildEscalationResult(reason: string): null {
    logger.warn({ reason }, 'HostAssignment: No host available — visit will be escalated');
    return null;
  }
}

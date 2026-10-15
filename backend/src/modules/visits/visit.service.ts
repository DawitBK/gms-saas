import { Transaction } from "sequelize";
import { AppError } from "../../core/errors/AppError";
import { ErrorCodes } from "../../core/errors/errorCodes";
import { VisitCommandService } from "./visit.command.service";
import { VisitQueryService } from "./visit.query.service";
import { VisitTransitionService } from "./visit.transition.service";
import { VisitActor } from "./visit.types";

/**
 * VisitService
 * 
 * Orchestrator for visit-related operations. 
 * Delegates specific logic to specialized sub-services:
 * - VisitQueryService: For complex data retrieval and scoping.
 * - VisitCommandService: For data mutation and operational actions.
 * - VisitTransitionService: For state machine lifecycle management.
 */
export class VisitService {
  private readonly queryService: VisitQueryService;
  private readonly commandService: VisitCommandService;
  private readonly transitionService: VisitTransitionService;

  constructor() {
    this.queryService = new VisitQueryService();
    this.commandService = new VisitCommandService();
    this.transitionService = new VisitTransitionService();
  }

  /**
   * Retrieves a visit by its primary ID.
   * @param id The numeric visit ID.
   * @returns The visit record or null if not found.
   */
  public async getVisitById(id: number) {
    return this.queryService.getVisitById(id);
  }

  /**
   * Retrieves a visit with security scoping for a specific actor (guest, host, or admin).
   * @param id The numeric visit ID.
   * @param actor The actor requesting the data (contains ID and roles).
   * @returns The scoped visit record.
   */
  public async getVisitForActor(id: number, actor: VisitActor) {
    return this.queryService.getVisitForActor(id, actor);
  }

  /**
   * Generates or retrieves the QR code source (token) for a visit, scoped to an actor.
   * @param id The numeric visit ID.
   * @param actor The actor requesting the QR.
   * @returns The QR code string.
   */
  public async getVisitQrSourceForActor(id: number, actor: VisitActor) {
    return this.queryService.getVisitQrSourceForActor(id, actor);
  }

  /**
   * Lists visits based on filters and pagination.
   * @param filter The filter object (status, search query, etc.).
   * @param page Current page number.
   * @param limit Records per page.
   * @returns Paginated visit results.
   */
  public async listVisits(filter: any, page: number, limit: number) {
    return this.queryService.listVisits(filter, page, limit);
  }

  /**
   * Builds a Sequelize-compatible filter object scoped to the actor's permissions.
   * @param actor The actor performing the query.
   * @param base The initial filter parameters from the request.
   * @returns A hardened filter object.
   */
  public async buildScopedFilter(
    actor: VisitActor,
    base: Record<string, any> = {},
  ) {
    return this.queryService.buildScopedFilter(actor, base);
  }

  /**
   * Creates a new visit booking.
   * @param guestId The ID of the guest creating the booking.
   * @param payload The visit details (office, department, service, slot, etc.).
   * @returns The newly created visit record.
   */
  public async createVisit(guestId: number, payload: any, actorRoles: string[] = []) {
    return this.commandService.createVisit(guestId, payload, actorRoles);
  }

  /**
   * Processes a lifecycle status transition (e.g., PENDING -> APPROVED).
   * Enforces business rules and state machine constraints.
   * @param visitId The numeric visit ID.
   * @param actor The actor triggering the change.
   * @param newStatus The target status.
   * @param existingTransaction Optional transaction for atomic multi-step changes.
   * @returns `{ visit, changed }` — `visit` is the current visit record
   *   (always up to date, even on a no-op); `changed` is false when the
   *   visit was already in `newStatus` (e.g. a racing duplicate call), so
   *   callers can skip their own duplicate audit/notification side effects.
   */
  public async processStatusChange(
    visitId: number,
    actor: VisitActor | number,
    newStatus: string,
    existingTransaction?: Transaction,
  ) {
    return this.transitionService.processStatusChange(
      visitId,
      actor,
      newStatus,
      existingTransaction,
    );
  }

  /**
   * Reschedules an existing visit to a new time slot.
   * @param visitId The numeric visit ID.
   * @param actor The actor requesting the reschedule.
   * @param payload The new slot ID and optional note.
   * @returns The updated visit record.
   */
  public async rescheduleVisit(
    visitId: number,
    actor: VisitActor,
    payload: { time_slot_id: number; note?: string },
  ) {
    return this.commandService.rescheduleVisit(visitId, actor, payload);
  }

  /**
   * Reassigns a visit to a different host.
   * @param visitId The numeric visit ID.
   * @param actor The actor requesting reassignment.
   * @param payload The target host ID, optional new slot, and note.
   * @returns The updated visit record.
   */
  public async reassignVisit(
    visitId: number,
    actor: VisitActor,
    payload: { host_id: number; time_slot_id?: number; note?: string },
  ) {
    return this.commandService.reassignVisit(visitId, actor, payload);
  }

  /**
   * Escalates a visit to reception for manual handling or special attention.
   * @param visitId The numeric visit ID.
   * @param actor The actor requesting escalation.
   * @param payload Optional reason for escalation.
   * @returns The updated visit record.
   */
  public async escalateVisit(
    visitId: number,
    actor: VisitActor,
    payload: { reason?: string },
  ) {
    return this.commandService.escalateVisit(visitId, actor, payload);
  }

  /**
   * Processes a guest's decision to accept or decline a proposed visit/reschedule.
   * @param visitId The numeric visit ID.
   * @param guestId The numeric guest ID.
   * @param decision The decision (ACCEPTED or DECLINED).
   * @returns The updated visit record.
   */
  public async processGuestDecision(
    visitId: number,
    guestId: number,
    decision: "ACCEPTED" | "DECLINED",
  ) {
    return this.commandService.processGuestDecision(visitId, guestId, decision);
  }

  /**
   * Extends the scheduled duration of an active visit.
   * @param visitId The numeric visit ID.
   * @param actor The actor requesting the extension.
   * @param newEndTime The new target end time.
   * @returns The updated visit record.
   */
  public async extendVisit(
    visitId: number,
    actor: VisitActor,
    newEndTime: Date,
  ) {
    return this.commandService.extendVisit(visitId, actor, newEndTime);
  }

  /**
   * Submits post-visit feedback (rating and comment) from the guest.
   * @param visitId The numeric visit ID.
   * @param guestId The numeric guest ID.
   * @param rating Numeric rating (1-5).
   * @param comment Optional textual feedback.
   * @returns The updated visit record.
   */
  public async submitFeedback(
    visitId: number,
    guestId: number,
    rating: number,
    comment?: string,
  ) {
    return this.commandService.submitFeedback(
      visitId,
      guestId,
      rating,
      comment,
    );
  }

  /**
   * Soft-archives a visit, making it inactive in standard views.
   * @param id The numeric visit ID.
   * @param actor The actor requesting archival.
   * @returns Success confirmation.
   */
  public async archiveVisit(id: number, actor: VisitActor) {
    const visit = await this.queryService.getVisitForActor(id, actor);
    if (!visit) {
      throw new AppError("Visit not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }
    return this.commandService.archiveVisit(id);
  }

  /**
   * Restores a soft-archived visit.
   * @param id The numeric visit ID.
   * @param actor The actor requesting restoration.
   * @returns Success confirmation.
   */
  public async restoreVisit(id: number, actor: VisitActor) {
    // FIX: actor was accepted but never used, so an office-scoped admin
    // could restore any OTHER office's soft-deleted visit. Mirror
    // archiveVisit's authorization check — but archiveVisit's own
    // getVisitForActor can't be reused as-is here: it excludes soft-deleted
    // rows (Visit is paranoid:true), and this visit is, by definition,
    // already soft-deleted. Use the soft-delete-tolerant variant instead so
    // the office-scope check still runs before the restore is allowed.
    await this.queryService.getVisitForActorIncludingDeleted(id, actor);
    return this.commandService.restoreVisit(id);
  }

  /**
   * Regenerates a fresh QR code for an approved visit, voiding the previous one.
   * @param id The numeric visit ID.
   * @param actor The actor requesting regeneration.
   * @returns The new QR code record.
   */
  public async regenerateQR(id: number, actor: VisitActor) {
    return this.commandService.regenerateQR(id, actor);
  }
}

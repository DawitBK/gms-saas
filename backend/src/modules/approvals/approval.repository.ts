import { Approval, Visit, User } from '../../infrastructure/database/models';
import { ApprovalStatus } from '../../shared/domain/status-catalog';

export class ApprovalRepository {
  public async create(data: {
    visit_id: number;
    approver_id: number;
    status: ApprovalStatus;
    reason?: string;
  }, transaction?: any) {
    return Approval.create(data, { transaction });
  }

  public async findByVisitId(visitId: number) {
    return Approval.findAll({
      where: { visit_id: visitId },
      include: [{ model: User, as: 'approver', required: false }],
      order: [['created_at', 'DESC']],
    });
  }

  public async findLatestByVisitId(visitId: number) {
    return Approval.findOne({
      where: { visit_id: visitId },
      order: [['created_at', 'DESC']],
    });
  }

  public async findVisitForDecision(visitId: number, transaction?: any) {
    // Lock the visit row WITHOUT any LEFT JOIN includes.
    // PostgreSQL forbids FOR UPDATE on the nullable side of an outer join.
    // Only visit-level columns (status, guest_id) are needed for the decision flow.
    return Visit.findByPk(visitId, {
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
  }
}

import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';
import {
  STORED_VISIT_LIFECYCLE_STATUSES,
  StoredVisitLifecycleStatus,
  VisitGuestDecisionStatus,
} from '../../../core/status/status-catalog';

export class Visit extends Model {
  declare id: number;
  declare guest_id: number;
  declare service_id: number | null;
  declare department_id: number;
  declare office_id: number;
  declare time_slot_id: number | null;
  declare assigned_host_id: number | null;
  // NOTE: 'RECEIVED' and 'REASSIGNED' are retained for backward compatibility but unused in logic.
  declare status: StoredVisitLifecycleStatus;
  declare scheduled_start: Date;
  declare scheduled_end: Date;
  declare purpose: string | null;
  declare escalated_to_reception: boolean;
  declare escalated_at: Date | null;
  declare escalated_by_id: number | null;
  declare escalation_reason: string | null;
  declare qr_code: string;
  declare sla_deadline_at: Date | null;
  declare grace_deadline_at: Date | null;
  declare guest_decision_status: VisitGuestDecisionStatus | null;
  declare guest_decision_at: Date | null;
  declare reception_sla_deadline_at: Date | null;
  declare daily_sequence: number | null;
  declare reference_number: string | null;
  declare checked_in_at: Date | null;
  declare checked_out_at: Date | null;
  declare is_vip: boolean;
  declare rating: number | null;
  declare rating_comment: string | null;
  declare is_extended: boolean;
  declare original_scheduled_end: Date | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

Visit.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    guest_id: { type: DataTypes.BIGINT, allowNull: false },
    service_id: { type: DataTypes.BIGINT, allowNull: true },
    department_id: { type: DataTypes.BIGINT, allowNull: false },
    office_id: { type: DataTypes.BIGINT, allowNull: false },
    time_slot_id: { type: DataTypes.BIGINT, allowNull: true },
    assigned_host_id: { type: DataTypes.BIGINT, allowNull: true },
    status: {
      type: DataTypes.ENUM(...STORED_VISIT_LIFECYCLE_STATUSES),
      defaultValue: 'PENDING',
    },
    scheduled_start: DataTypes.DATE,
    scheduled_end: DataTypes.DATE,
    purpose: { type: DataTypes.TEXT, allowNull: true },
    escalated_to_reception: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    escalated_at: { type: DataTypes.DATE, allowNull: true },
    escalated_by_id: { type: DataTypes.BIGINT, allowNull: true },
    escalation_reason: { type: DataTypes.TEXT, allowNull: true },
    qr_code: DataTypes.TEXT,
    sla_deadline_at: { type: DataTypes.DATE, allowNull: true },
    grace_deadline_at: { type: DataTypes.DATE, allowNull: true },
    guest_decision_status: { type: DataTypes.STRING(20), allowNull: true },
    guest_decision_at: { type: DataTypes.DATE, allowNull: true },
    daily_sequence: { type: DataTypes.INTEGER, allowNull: true },
    reference_number: { type: DataTypes.STRING(50), allowNull: true },
    checked_in_at: { type: DataTypes.DATE, allowNull: true },
    checked_out_at: { type: DataTypes.DATE, allowNull: true },
    reception_sla_deadline_at: { type: DataTypes.DATE, allowNull: true },
    sla_breached: { type: DataTypes.BOOLEAN, defaultValue: false },
    sla_breached_at: { type: DataTypes.DATE, allowNull: true },
    is_vip: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    rating: { type: DataTypes.INTEGER, allowNull: true },
    rating_comment: { type: DataTypes.TEXT, allowNull: true },
    is_extended: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    original_scheduled_end: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'visits',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
  }
);

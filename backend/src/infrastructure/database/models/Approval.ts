import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';
import { APPROVAL_STATUSES, ApprovalStatus } from '../../../shared/domain/status-catalog';

export class Approval extends Model {
  declare id: number;
  declare visit_id: number;
  declare approver_id: number;
  declare status: ApprovalStatus;
  declare reason: string | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

Approval.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    visit_id: { type: DataTypes.BIGINT, allowNull: false },
    approver_id: { type: DataTypes.BIGINT, allowNull: false },
    status: {
      type: DataTypes.ENUM(...APPROVAL_STATUSES),
      allowNull: false,
    },
    reason: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'approvals',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

export class VisitAssignment extends Model {
  declare id: number;
  declare visit_id: number;
  declare host_id: number;
  declare assigned_by_id: number | null;
  declare assigned_at: Date | null;
  declare assignment_reason: string | null;
  declare candidate_hosts: any | null;
  declare load_metrics: any | null;
  declare is_current: boolean;
}

VisitAssignment.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    visit_id: { type: DataTypes.BIGINT, allowNull: false },
    host_id: { type: DataTypes.BIGINT, allowNull: false },
    assigned_by_id: { type: DataTypes.BIGINT, allowNull: true },
    assigned_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    assignment_reason: { type: DataTypes.TEXT, allowNull: true },
    candidate_hosts: { type: DataTypes.JSONB, allowNull: true },
    load_metrics: { type: DataTypes.JSONB, allowNull: true },
    is_current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    tableName: 'visit_assignments',
    timestamps: false,
  }
);


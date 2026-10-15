import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../sequelize';

export class AuditLog extends Model {
  declare id: number;
  declare user_id: number;
  declare request_id: string; // The Trace ID from CLS
  declare action: string;
  declare entity: string;
  declare entity_id: string;
  declare metadata: any; // JSON containing 'before' and 'after'
  declare readonly created_at: Date;
}

AuditLog.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  request_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  entity: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  entity_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
}, {
  sequelize,
  tableName: 'audit_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

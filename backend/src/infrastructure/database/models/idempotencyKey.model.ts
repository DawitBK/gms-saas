import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../sequelize';

export class IdempotencyKey extends Model {
  declare key: string;
  declare response: any;
  declare user_id: number | null;
  declare endpoint: string | null;
  declare request_hash: string | null;
  declare created_at: Date;
}

IdempotencyKey.init({
  key: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  response: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  endpoint: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  request_hash: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
}, {
  sequelize,
  tableName: 'idempotency_keys',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

export class Notification extends Model {
  declare id: number;
  declare user_id: number;
  declare type: string;
  declare title: string;
  declare message: string;
  declare metadata: object;
  declare is_read: boolean;
  declare readonly created_at: Date;
}

Notification.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.BIGINT, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    metadata: { type: DataTypes.JSONB },
    is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'notifications',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

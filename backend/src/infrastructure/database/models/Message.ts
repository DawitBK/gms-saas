import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

export class Message extends Model {
  declare id: number;
  declare visit_id: number;
  declare sender_id: number;
  declare content: string;
  declare readonly created_at: Date;
}

Message.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    visit_id: { type: DataTypes.BIGINT, allowNull: false },
    sender_id: { type: DataTypes.BIGINT, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    sequelize,
    tableName: 'messages',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

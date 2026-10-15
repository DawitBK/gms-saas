import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

export class AuthSession extends Model {
  declare id: number;
  declare user_id: number;
  declare token_id: string;
  declare refresh_token_hash: string;
  declare expires_at: Date;
  declare revoked_at: Date | null;
  declare user_agent: string | null;
  declare ip_address: string | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

AuthSession.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.BIGINT, allowNull: false },
    token_id: { type: DataTypes.STRING, allowNull: false, unique: true },
    refresh_token_hash: { type: DataTypes.TEXT, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    user_agent: { type: DataTypes.TEXT, allowNull: true },
    ip_address: { type: DataTypes.STRING, allowNull: true },
  },
  {
    sequelize,
    tableName: 'auth_sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

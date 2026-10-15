import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

export class UserRole extends Model {
  declare user_id: number;
  declare role_id: number;
  declare created_at: Date;
  declare updated_at: Date;
}

UserRole.init(
  {
    user_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
    },
    role_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
  },
  {
    sequelize,
    tableName: "user_roles",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

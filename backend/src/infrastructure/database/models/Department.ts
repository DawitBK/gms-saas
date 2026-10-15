import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

export class Department extends Model {
  declare id: number;
  declare name: string;
  declare office_id: number;
  declare created_at: Date;
  declare updated_at: Date;
}

Department.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    office_id: { type: DataTypes.BIGINT },
  },
  {
    sequelize,
    tableName: "departments",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

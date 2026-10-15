import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

export class Service extends Model {
  declare id: number;
  declare name: string;
  declare duration_minutes: number;
  declare department_id: number;
  declare office_id: number;
  declare host_ids?: number[];
}

Service.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    duration_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
    department_id: { type: DataTypes.BIGINT },
    office_id: { type: DataTypes.BIGINT },
    host_ids: { type: DataTypes.ARRAY(DataTypes.BIGINT), allowNull: false, defaultValue: [] },
  },
  {
    sequelize,
    tableName: 'services',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
  }
);

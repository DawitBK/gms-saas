import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

export class Host extends Model {
  declare id: number;
  declare user_id: number;
  declare department_id: number;
  declare office_id: number;
  declare active: boolean;
}

Host.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.BIGINT, allowNull: false },
    department_id: { type: DataTypes.BIGINT },
    office_id: { type: DataTypes.BIGINT },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    sequelize,
    tableName: 'hosts',
    timestamps: false,
  }
);

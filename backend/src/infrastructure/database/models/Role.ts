import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

export class Role extends Model {
  declare id: number;
  declare name: string;
}

Role.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, unique: true, allowNull: false },
  },
  {
    sequelize,
    tableName: 'roles',
    timestamps: false,
  }
);

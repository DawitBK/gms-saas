import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

export class Office extends Model {
  declare id: number;
  declare name: string;
  declare address: string;
  declare city: string;
  declare country: string;
  declare timezone: string;
  declare active: boolean;
  declare latitude: number;
  declare longitude: number;
  declare created_at: Date;
  declare updated_at: Date;
}

Office.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    address: DataTypes.TEXT,
    city: DataTypes.STRING,
    country: DataTypes.STRING,
    timezone: DataTypes.STRING,
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: false },
    longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: false },
  },
  {
    sequelize,
    tableName: "offices",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

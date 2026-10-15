import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

export class Pin extends Model {
  declare id: number;
  declare visit_id: number;
  declare pin_code: string;
  declare expires_at: Date;
}

Pin.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    visit_id: { type: DataTypes.BIGINT, allowNull: false },
    pin_code: { type: DataTypes.STRING(10), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'pins',
    timestamps: false,
  }
);

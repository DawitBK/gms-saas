import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

export class RecurringAvailability extends Model {
  declare id: number;
  declare host_id: number;
  declare office_id: number | null;
  declare recurrence_type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'DATE_OVERRIDE';
  declare day_of_week: number | null;
  declare day_of_month: number | null;
  declare specific_date: string | null;
  declare start_time: string;
  declare end_time: string;
  declare is_available: boolean;
  declare label: string | null;
  declare notes: string | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

RecurringAvailability.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    host_id: { type: DataTypes.BIGINT, allowNull: false },
    office_id: { type: DataTypes.BIGINT, allowNull: true },
    recurrence_type: {
      type: DataTypes.ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'DATE_OVERRIDE'),
      allowNull: false,
      defaultValue: 'WEEKLY',
    },
    day_of_week: { type: DataTypes.INTEGER, allowNull: true },
    day_of_month: { type: DataTypes.INTEGER, allowNull: true },
    specific_date: { type: DataTypes.DATEONLY, allowNull: true },
    start_time: { type: DataTypes.TIME, allowNull: false },
    end_time: { type: DataTypes.TIME, allowNull: false },
    is_available: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    label: { type: DataTypes.STRING, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'recurring_availability',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

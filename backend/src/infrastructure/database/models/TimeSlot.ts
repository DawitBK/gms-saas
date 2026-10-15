import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';
import {
  TIMESLOT_STATE_STATUSES,
  TimeSlotStateStatus,
} from '../../../core/status/status-catalog';

export class TimeSlot extends Model {
  declare id: number;
  declare host_id: number;
  declare office_id: number;
  declare availability_rule_id: number | null;
  declare start_time: Date;
  declare end_time: Date;
  declare is_booked: boolean;
  declare slot_state: TimeSlotStateStatus;
}

TimeSlot.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    host_id: { type: DataTypes.BIGINT, allowNull: false },
    office_id: { type: DataTypes.BIGINT },
    availability_rule_id: { type: DataTypes.BIGINT, allowNull: true },
    start_time: { type: DataTypes.DATE, allowNull: false },
    end_time: { type: DataTypes.DATE, allowNull: false },
    is_booked: { type: DataTypes.BOOLEAN, defaultValue: false },
    slot_state: {
      type: DataTypes.ENUM(...TIMESLOT_STATE_STATUSES),
      allowNull: false,
      defaultValue: 'AVAILABLE',
    },
  },
  {
    sequelize,
    tableName: 'time_slots',
    timestamps: false,
  }
);

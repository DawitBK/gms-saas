import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../sequelize';
import {
  OUTBOX_PROCESSING_STATUSES,
  OutboxProcessingStatus,
} from '../../../core/status/status-catalog';

export type OutboxChannel = 'EVENT_BUS' | 'QUEUE_JOB';
export type OutboxStatus = OutboxProcessingStatus;

export class OutboxEvent extends Model {
  declare id: number;
  declare channel: OutboxChannel;
  declare status: OutboxStatus;
  declare aggregate_type: string | null;
  declare aggregate_id: string | null;
  declare event_type: string | null;
  declare queue_name: string | null;
  declare job_name: string | null;
  declare payload: Record<string, unknown>;
  declare attempt_count: number;
  declare max_attempts: number;
  declare available_at: Date;
  declare locked_at: Date | null;
  declare last_attempt_at: Date | null;
  declare processed_at: Date | null;
  declare error_message: string | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

OutboxEvent.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    channel: {
      type: DataTypes.ENUM('EVENT_BUS', 'QUEUE_JOB'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...OUTBOX_PROCESSING_STATUSES),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    aggregate_type: { type: DataTypes.STRING, allowNull: true },
    aggregate_id: { type: DataTypes.STRING, allowNull: true },
    event_type: { type: DataTypes.STRING, allowNull: true },
    queue_name: { type: DataTypes.STRING, allowNull: true },
    job_name: { type: DataTypes.STRING, allowNull: true },
    payload: { type: DataTypes.JSONB, allowNull: false },
    attempt_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // Aligned with DMS's outbox retry policy (3 attempts) - was 10, far more
    // than DMS's equivalent outbox and inconsistent with no stated reason.
    max_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
    available_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    locked_at: { type: DataTypes.DATE, allowNull: true },
    last_attempt_at: { type: DataTypes.DATE, allowNull: true },
    processed_at: { type: DataTypes.DATE, allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'outbox_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

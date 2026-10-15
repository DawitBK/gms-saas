import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../sequelize';
import {
  WEBHOOK_INGESTION_STATUSES,
  WebhookIngestionStatus,
} from '../../../core/status/status-catalog';

export class ExternalWebhookEvent extends Model {
  declare id: number;
  declare source: string;
  declare event_id: string;
  declare event_type: string;
  declare status: WebhookIngestionStatus;
  declare payload: Record<string, unknown>;
  declare error_message: string | null;
  declare received_at: Date;
  declare processed_at: Date | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

ExternalWebhookEvent.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    source: { type: DataTypes.STRING, allowNull: false },
    event_id: { type: DataTypes.STRING, allowNull: false },
    event_type: { type: DataTypes.STRING, allowNull: false },
    status: {
      type: DataTypes.ENUM(...WEBHOOK_INGESTION_STATUSES),
      allowNull: false,
      defaultValue: 'RECEIVED',
    },
    payload: { type: DataTypes.JSONB, allowNull: false },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    received_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    processed_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'external_webhook_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

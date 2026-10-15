import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

export class GuestProfile extends Model {
  declare id: number;
  declare user_id: number;
  declare company: string | null;
  declare government_id: string | null;
  declare document_url: string | null;
  declare notes: string | null;
  declare emergency_contact_name: string | null;
  declare emergency_contact_phone: string | null;
  declare preferred_notification_channel: 'EMAIL' | 'SMS' | 'BOTH';
  declare is_vip: boolean;
  declare last_visit_at: Date | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

GuestProfile.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.BIGINT, allowNull: false, unique: true },
    company: { type: DataTypes.STRING, allowNull: true },
    government_id: { type: DataTypes.STRING, allowNull: true },
    document_url: { type: DataTypes.TEXT, allowNull: true },
    ocr_text: { type: DataTypes.TEXT, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    emergency_contact_name: { type: DataTypes.STRING, allowNull: true },
    emergency_contact_phone: { type: DataTypes.STRING, allowNull: true },
    preferred_notification_channel: {
      type: DataTypes.ENUM('EMAIL', 'SMS', 'BOTH'),
      allowNull: false,
      defaultValue: 'EMAIL',
    },
    is_vip: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    last_visit_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'guest_profiles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';
import { CREDENTIAL_STATUSES, CredentialStatus } from '../../../shared/domain/status-catalog';

export class AccessCredential extends Model {
  declare id: number;
  declare visit_id: number;
  declare pin_id: number | null;
  declare credential_type: 'QR' | 'PIN';
  declare provider: 'INTERNAL' | 'UNIFI_ACCESS';
  declare status: CredentialStatus;
  declare external_credential_id: string | null;
  declare external_identity_id: string | null;
  declare door_ids: string[] | null;
  declare valid_from: Date;
  declare valid_until: Date;
  declare provisioned_at: Date | null;
  declare revoked_at: Date | null;
  declare metadata: Record<string, unknown> | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

AccessCredential.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    visit_id: { type: DataTypes.BIGINT, allowNull: false },
    pin_id: { type: DataTypes.BIGINT, allowNull: true },
    credential_type: { type: DataTypes.ENUM('QR', 'PIN'), allowNull: false },
    provider: {
      type: DataTypes.ENUM('INTERNAL', 'UNIFI_ACCESS'),
      allowNull: false,
      defaultValue: 'UNIFI_ACCESS',
    },
    status: {
      type: DataTypes.ENUM(...CREDENTIAL_STATUSES),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    external_credential_id: { type: DataTypes.STRING, allowNull: true },
    external_identity_id: { type: DataTypes.STRING, allowNull: true },
    door_ids: { type: DataTypes.JSONB, allowNull: true },
    valid_from: { type: DataTypes.DATE, allowNull: false },
    valid_until: { type: DataTypes.DATE, allowNull: false },
    provisioned_at: { type: DataTypes.DATE, allowNull: true },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: 'access_credentials',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';
import {
  USER_ACCOUNT_STATUSES,
  USER_PRESENCE_STATUSES,
  UserAccountStatus,
  UserPresenceStatus,
} from '../../../core/status/status-catalog';

export class User extends Model {
  declare id: number;
  declare full_name: string;
  declare email: string;
  declare phone: string;
  declare office_id: number | null;
  declare password_hash: string;
  declare status: UserAccountStatus;
  declare presence: UserPresenceStatus;
  declare email_verified: boolean;
  declare phone_verified: boolean;
  declare registration_otp: string | null;
  declare registration_otp_at: Date | null;
  declare registration_otp_attempts: number;
  declare reset_password_otp: string | null;
  declare reset_password_otp_at: Date | null;
  declare reset_password_otp_attempts: number;
  declare two_factor_enabled: boolean;
  declare two_factor_otp: string | null;
  declare two_factor_otp_at: Date | null;
  declare two_factor_otp_attempts: number;
  declare requires_password_change: boolean;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

User.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    full_name: DataTypes.STRING,
    email: { type: DataTypes.STRING, unique: false, allowNull: false },
    phone: { type: DataTypes.STRING, unique: false },
    office_id: { type: DataTypes.BIGINT, allowNull: true },
    password_hash: DataTypes.TEXT,
    status: { type: DataTypes.ENUM(...USER_ACCOUNT_STATUSES), defaultValue: 'ACTIVE' },
    presence: { type: DataTypes.ENUM(...USER_PRESENCE_STATUSES), defaultValue: 'OFFLINE' },
    last_seen: DataTypes.DATE,
    email_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    registration_otp: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    registration_otp_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Failed submissions against the CURRENT registration code. This one
    // matters most of the three: a correct guess auto-issues a login session,
    // so it is account takeover rather than a step toward one.
    registration_otp_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    reset_password_otp: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    reset_password_otp_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Failed submissions against the CURRENT reset code. Burned back to 0 by
    // AuthService.registerOtpFailure once the ceiling invalidates the code.
    reset_password_otp_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    two_factor_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    two_factor_otp: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    two_factor_otp_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Failed submissions against the CURRENT 2FA code. See the reset-code
    // counter above.
    two_factor_otp_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    phone_verified: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    requires_password_change: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
  }
);

import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

export class HostProfile extends Model {
  declare id: number;
  declare user_id: number;
  declare employee_id: string | null;
  declare job_title: string | null;
  declare bio: string | null;
  declare avatar_url: string | null;
  declare phone_extension: string | null;
  declare notes: string | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

HostProfile.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { 
      type: DataTypes.BIGINT, 
      allowNull: false, 
      unique: true,
      references: { model: 'users', key: 'id' }
    },
    employee_id: { type: DataTypes.STRING, allowNull: true },
    job_title: { type: DataTypes.STRING, allowNull: true },
    bio: { type: DataTypes.TEXT, allowNull: true },
    avatar_url: { type: DataTypes.STRING, allowNull: true },
    phone_extension: { type: DataTypes.STRING, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'host_profiles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

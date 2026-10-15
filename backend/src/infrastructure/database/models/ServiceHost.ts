import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../sequelize';

export class ServiceHost extends Model {
  declare service_id: number;
  declare host_id: number;
}

ServiceHost.init(
  {
    service_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      references: {
        model: 'services',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    host_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      references: {
        model: 'hosts',
        key: 'id'
      },
      onDelete: 'CASCADE'
    }
  },
  {
    sequelize,
    tableName: 'service_hosts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('access_credentials', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      visit_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'visits', key: 'id' },
        onDelete: 'CASCADE',
      },
      pin_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'pins', key: 'id' },
        onDelete: 'SET NULL',
      },
      credential_type: {
        type: Sequelize.ENUM('QR', 'PIN'),
        allowNull: false,
      },
      provider: {
        type: Sequelize.ENUM('INTERNAL', 'UNIFI_ACCESS'),
        allowNull: false,
        defaultValue: 'UNIFI_ACCESS',
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED', 'FAILED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      external_credential_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      external_identity_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      door_ids: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      valid_from: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      valid_until: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      provisioned_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      revoked_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('access_credentials', ['visit_id', 'status'], {
      name: 'idx_access_credentials_visit_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('access_credentials', 'idx_access_credentials_visit_status');
    await queryInterface.dropTable('access_credentials');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_access_credentials_credential_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_access_credentials_provider";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_access_credentials_status";');
  },
};

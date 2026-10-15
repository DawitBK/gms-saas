'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('auth_sessions', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      token_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      refresh_token_hash: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      revoked_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      ip_address: {
        type: Sequelize.STRING,
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

    await queryInterface.addIndex('auth_sessions', ['user_id', 'revoked_at'], {
      name: 'idx_auth_sessions_user_revoked',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('auth_sessions', 'idx_auth_sessions_user_revoked');
    await queryInterface.dropTable('auth_sessions');
  },
};

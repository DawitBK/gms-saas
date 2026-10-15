'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('idempotency_keys', {
      key: {
        type: Sequelize.STRING(255),
        primaryKey: true,
      },
      response: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Auto-purge keys older than 24h via a background job — the index accelerates that query
    await queryInterface.addIndex('idempotency_keys', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('idempotency_keys');
  },
};

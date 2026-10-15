'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('external_webhook_events', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      source: { type: Sequelize.STRING, allowNull: false },
      event_id: { type: Sequelize.STRING, allowNull: false },
      event_type: { type: Sequelize.STRING, allowNull: false },
      status: {
        type: Sequelize.ENUM('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED'),
        allowNull: false,
        defaultValue: 'RECEIVED',
      },
      payload: { type: Sequelize.JSONB, allowNull: false },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      received_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      processed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addConstraint('external_webhook_events', {
      fields: ['source', 'event_id'],
      type: 'unique',
      name: 'external_webhook_events_source_event_id_key',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('external_webhook_events');
  },
};

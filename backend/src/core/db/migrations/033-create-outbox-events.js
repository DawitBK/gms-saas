'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('outbox_events', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      channel: {
        type: Sequelize.ENUM('EVENT_BUS', 'QUEUE_JOB'),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      aggregate_type: { type: Sequelize.STRING, allowNull: true },
      aggregate_id: { type: Sequelize.STRING, allowNull: true },
      event_type: { type: Sequelize.STRING, allowNull: true },
      queue_name: { type: Sequelize.STRING, allowNull: true },
      job_name: { type: Sequelize.STRING, allowNull: true },
      payload: { type: Sequelize.JSONB, allowNull: false },
      attempt_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      max_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 10 },
      available_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      locked_at: { type: Sequelize.DATE, allowNull: true },
      last_attempt_at: { type: Sequelize.DATE, allowNull: true },
      processed_at: { type: Sequelize.DATE, allowNull: true },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('outbox_events', ['status', 'available_at'], {
      name: 'outbox_events_status_available_at_idx',
    });

    await queryInterface.addIndex('outbox_events', ['aggregate_type', 'aggregate_id'], {
      name: 'outbox_events_aggregate_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('outbox_events');
  },
};

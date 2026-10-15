'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('audit_logs', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      action: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      entity: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      entity_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Index for fast per-entity lookups. Use IF NOT EXISTS to keep migration reruns safe.
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS "audit_logs_entity_entity_id" ON "audit_logs" ("entity", "entity_id")'
    );
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS "audit_logs_user_id" ON "audit_logs" ("user_id")'
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs');
  },
};

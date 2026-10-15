'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('approvals', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      visit_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'visits', key: 'id' },
        onDelete: 'CASCADE',
      },
      approver_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'RESTRICT',
      },
      status: {
        type: Sequelize.ENUM('APPROVED', 'DECLINED', 'REVOKED'),
        allowNull: false,
      },
      reason: {
        type: Sequelize.TEXT,
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

    await queryInterface.addIndex('approvals', ['visit_id', 'created_at'], {
      name: 'idx_approvals_visit_created_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('approvals', 'idx_approvals_visit_created_at');
    await queryInterface.dropTable('approvals');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_approvals_status";');
  },
};

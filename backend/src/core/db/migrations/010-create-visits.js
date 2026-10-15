'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('visits', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      guest_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      service_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'services', key: 'id' },
        onDelete: 'CASCADE'
      },
      department_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'departments', key: 'id' },
        onDelete: 'CASCADE'
      },
      office_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'offices', key: 'id' },
        onDelete: 'CASCADE'
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'APPROVED', 'DECLINED', 'RESCHEDULED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED'),
        defaultValue: 'PENDING'
      },
      scheduled_start: { type: Sequelize.DATE },
      scheduled_end: { type: Sequelize.DATE },
      qr_code: { type: Sequelize.TEXT },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('visits');
  }
};

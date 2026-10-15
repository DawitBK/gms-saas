'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('recurring_availability', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      host_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'hosts', key: 'id' },
        onDelete: 'CASCADE'
      },
      office_id: {
        type: Sequelize.BIGINT,
        references: { model: 'offices', key: 'id' },
        onDelete: 'CASCADE'
      },
      day_of_week: { type: Sequelize.INTEGER, allowNull: false },
      start_time: { type: Sequelize.TIME, allowNull: false },
      end_time: { type: Sequelize.TIME, allowNull: false }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('recurring_availability');
  }
};

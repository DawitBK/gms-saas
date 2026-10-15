'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('time_slots', {
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
      start_time: { type: Sequelize.DATE, allowNull: false },
      end_time: { type: Sequelize.DATE, allowNull: false },
      is_booked: { type: Sequelize.BOOLEAN, defaultValue: false }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('time_slots');
  }
};

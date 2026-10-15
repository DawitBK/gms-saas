'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('visits');
    if (table.time_slot_id) {
      return;
    }

    await queryInterface.addColumn('visits', 'time_slot_id', {
      type: Sequelize.BIGINT,
      references: { model: 'time_slots', key: 'id' },
      onDelete: 'SET NULL',
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('visits');
    if (!table.time_slot_id) {
      return;
    }

    await queryInterface.removeColumn('visits', 'time_slot_id');
  }
};

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('visits', 'daily_sequence', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('visits', 'reference_number', {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addIndex('visits', ['reference_number'], {
      name: 'visits_reference_number_idx',
    });

    await queryInterface.addIndex('visits', ['office_id', 'daily_sequence'], {
      name: 'visits_office_daily_seq_idx',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('visits', 'visits_reference_number_idx');
    await queryInterface.removeIndex('visits', 'visits_office_daily_seq_idx');
    await queryInterface.removeColumn('visits', 'reference_number');
    await queryInterface.removeColumn('visits', 'daily_sequence');
  }
};

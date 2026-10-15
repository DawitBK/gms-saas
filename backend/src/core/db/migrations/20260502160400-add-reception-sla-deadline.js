'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add reception_sla_deadline_at to visits
    await queryInterface.addColumn('visits', 'reception_sla_deadline_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('visits', 'reception_sla_deadline_at');
  }
};

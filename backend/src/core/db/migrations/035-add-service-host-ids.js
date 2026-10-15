'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('services', 'host_ids', {
      type: Sequelize.ARRAY(Sequelize.BIGINT),
      allowNull: false,
      defaultValue: [],
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('services', 'host_ids');
  },
};

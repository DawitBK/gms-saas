'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('offices', 'latitude', {
      type: Sequelize.DECIMAL(10, 8),
      allowNull: false,
      defaultValue: 0.0, // Default to equator/prime meridian temporarily for existing records
    });
    
    await queryInterface.addColumn('offices', 'longitude', {
      type: Sequelize.DECIMAL(11, 8),
      allowNull: false,
      defaultValue: 0.0,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('offices', 'latitude');
    await queryInterface.removeColumn('offices', 'longitude');
  }
};

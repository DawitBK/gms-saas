'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Ensure idempotent migration: add only missing timestamp/deleted columns
    const tableInfo = await queryInterface.describeTable('services');

    if (!tableInfo.created_at) {
      await queryInterface.addColumn('services', 'created_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      });
    }

    if (!tableInfo.updated_at) {
      await queryInterface.addColumn('services', 'updated_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      });
    }

    if (!tableInfo.deleted_at) {
      await queryInterface.addColumn('services', 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('services');
    if (tableInfo.deleted_at) await queryInterface.removeColumn('services', 'deleted_at');
    if (tableInfo.updated_at) await queryInterface.removeColumn('services', 'updated_at');
    if (tableInfo.created_at) await queryInterface.removeColumn('services', 'created_at');
  },
};

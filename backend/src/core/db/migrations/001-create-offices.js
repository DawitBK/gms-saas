'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('offices', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      address: { type: Sequelize.TEXT },
      city: { type: Sequelize.STRING },
      country: { type: Sequelize.STRING },
      timezone: { type: Sequelize.STRING },
      active: { type: Sequelize.BOOLEAN, defaultValue: true }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('offices');
  }
};

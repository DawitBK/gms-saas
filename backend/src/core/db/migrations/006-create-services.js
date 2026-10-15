'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('services', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      duration_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 30 },
      department_id: {
        type: Sequelize.BIGINT,
        references: { model: 'departments', key: 'id' },
        onDelete: 'SET NULL'
      },
      office_id: {
        type: Sequelize.BIGINT,
        references: { model: 'offices', key: 'id' },
        onDelete: 'SET NULL'
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('services');
  }
};

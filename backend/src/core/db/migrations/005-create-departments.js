'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('departments', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      office_id: {
        type: Sequelize.BIGINT,
        references: { model: 'offices', key: 'id' },
        onDelete: 'SET NULL'
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('departments');
  }
};

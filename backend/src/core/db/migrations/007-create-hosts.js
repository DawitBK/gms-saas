'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('hosts', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      department_id: {
        type: Sequelize.BIGINT,
        references: { model: 'departments', key: 'id' },
        onDelete: 'SET NULL'
      },
      office_id: {
        type: Sequelize.BIGINT,
        references: { model: 'offices', key: 'id' },
        onDelete: 'SET NULL'
      },
      active: { type: Sequelize.BOOLEAN, defaultValue: true }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('hosts');
  }
};

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('visit_assignments', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      visit_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'visits', key: 'id' },
        onDelete: 'CASCADE'
      },
      host_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'hosts', key: 'id' },
        onDelete: 'CASCADE'
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('visit_assignments');
  }
};

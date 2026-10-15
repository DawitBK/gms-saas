'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_roles', {
      user_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      role_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        references: { model: 'roles', key: 'id' },
        onDelete: 'CASCADE'
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_roles');
  }
};

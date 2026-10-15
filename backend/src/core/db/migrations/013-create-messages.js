'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('messages', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      visit_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'visits', key: 'id' },
        onDelete: 'CASCADE'
      },
      sender_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      content: { type: Sequelize.TEXT, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('messages');
  }
};

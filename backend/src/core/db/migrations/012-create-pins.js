'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('pins', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      visit_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'visits', key: 'id' },
        onDelete: 'CASCADE'
      },
      pin_code: { type: Sequelize.STRING(10), allowNull: false },
      expires_at: { type: Sequelize.DATE, allowNull: false }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('pins');
  }
};

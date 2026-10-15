'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('visits', 'service_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'services', key: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('visits', 'service_id', {
      type: Sequelize.BIGINT,
      allowNull: false,
      references: { model: 'services', key: 'id' },
      onDelete: 'CASCADE',
    });
  },
};
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('visits', 'is_vip', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.addColumn('visits', 'rating', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn('visits', 'rating_comment', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn('visits', 'is_extended', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.addColumn('visits', 'original_scheduled_end', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('visits', 'is_vip');
    await queryInterface.removeColumn('visits', 'rating');
    await queryInterface.removeColumn('visits', 'rating_comment');
    await queryInterface.removeColumn('visits', 'is_extended');
    await queryInterface.removeColumn('visits', 'original_scheduled_end');
  }
};

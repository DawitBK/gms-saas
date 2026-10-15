'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'reset_password_otp', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'reset_password_otp_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'two_factor_enabled', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
    await queryInterface.addColumn('users', 'two_factor_otp', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'two_factor_otp_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'reset_password_otp');
    await queryInterface.removeColumn('users', 'reset_password_otp_at');
    await queryInterface.removeColumn('users', 'two_factor_enabled');
    await queryInterface.removeColumn('users', 'two_factor_otp');
    await queryInterface.removeColumn('users', 'two_factor_otp_at');
  }
};

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add OTP fields to users
    await queryInterface.addColumn('users', 'registration_otp', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'registration_otp_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Add OCR text to guest_profiles
    await queryInterface.addColumn('guest_profiles', 'ocr_text', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('users', 'registration_otp');
    await queryInterface.removeColumn('users', 'registration_otp_at');
    await queryInterface.removeColumn('guest_profiles', 'ocr_text');
  }
};

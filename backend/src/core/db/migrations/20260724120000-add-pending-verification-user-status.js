'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_users_status" ADD VALUE IF NOT EXISTS 'PENDING_VERIFICATION';`
      );
    } catch (error) {
      console.warn("Enum value might already exist or the ENUM type might be different. Error:", error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    // Cannot easily drop enum values in Postgres.
  }
};

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.sequelize.query(`ALTER TYPE "enum_visits_status" ADD VALUE IF NOT EXISTS 'REASSIGNED';`);
      await queryInterface.sequelize.query(`ALTER TYPE "enum_visits_status" ADD VALUE IF NOT EXISTS 'REASSIGNED_RESCHEDULED';`);
    } catch (error) {
      console.warn("Enum values might already exist or the ENUM type might be different. Error:", error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    // Cannot easily drop enum values in Postgres
  }
};

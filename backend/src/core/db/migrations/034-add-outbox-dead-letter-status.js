'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    if (queryInterface.sequelize.options.dialect === 'postgres') {
      try {
        await queryInterface.sequelize.query('ALTER TYPE "enum_outbox_events_status" ADD VALUE \'DEAD_LETTER\'');
      } catch (e) {
        // Ignore if it already exists
        if (e.message && !e.message.includes('already exists')) {
          throw e;
        }
      }
    } else {
      // For SQLite fallback or other dialects, altering ENUM might not be simply supported or necessary
    }
  },

  async down(queryInterface) {
    // ENUM value removal is not supported in Postgres within a simple down migration.
    // We leave it as is.
  },
};

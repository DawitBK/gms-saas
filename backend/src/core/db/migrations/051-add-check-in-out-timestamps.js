'use strict';

/**
 * Migration 051 – Add Check-in/Out Timestamps to Visits
 * 
 * Adds:
 *  - checked_in_at: When the visitor actually arrived and was processed.
 *  - checked_out_at: When the visitor departed the facility.
 * 
 * These columns are essential for the reports and arrival trend accuracy.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'visits';
    
    // Add checked_in_at
    const hasCheckedIn = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = '${table}' AND column_name = 'checked_in_at' LIMIT 1;`
    );
    if (hasCheckedIn[0].length === 0) {
      await queryInterface.addColumn(table, 'checked_in_at', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
      });
    }

    // Add checked_out_at
    const hasCheckedOut = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = '${table}' AND column_name = 'checked_out_at' LIMIT 1;`
    );
    if (hasCheckedOut[0].length === 0) {
      await queryInterface.addColumn(table, 'checked_out_at', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('visits', 'checked_in_at');
    await queryInterface.removeColumn('visits', 'checked_out_at');
  }
};

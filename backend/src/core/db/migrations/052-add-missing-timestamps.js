'use strict';

/**
 * Migration 052 – Add Missing Timestamps
 * 
 * Adds created_at and updated_at to:
 *  - offices
 *  - departments
 *  - user_roles
 * 
 * This resolves the schema inconsistency identified in SYSTEM_EVALUATION.md.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = ['offices', 'departments', 'user_roles'];

    for (const table of tables) {
      // Add created_at
      const hasCreatedAt = await queryInterface.sequelize.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = '${table}' AND column_name = 'created_at' LIMIT 1;`
      );
      if (hasCreatedAt[0].length === 0) {
        await queryInterface.addColumn(table, 'created_at', {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        });
      }

      // Add updated_at
      const hasUpdatedAt = await queryInterface.sequelize.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = '${table}' AND column_name = 'updated_at' LIMIT 1;`
      );
      if (hasUpdatedAt[0].length === 0) {
        await queryInterface.addColumn(table, 'updated_at', {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        });
      }
    }
  },

  async down(queryInterface) {
    const tables = ['offices', 'departments', 'user_roles'];
    for (const table of tables) {
      try {
        await queryInterface.removeColumn(table, 'created_at');
        await queryInterface.removeColumn(table, 'updated_at');
      } catch (err) {
        // Ignore errors if columns don't exist
      }
    }
  }
};

'use strict';

/**
 * Fixes the unique email constraint to support Soft Deletes.
 * 
 * Problem: The initial 'unique: true' constraint on users.email blocks re-registration 
 * if a previous user with the same email was soft-deleted (deleted_at is NOT NULL).
 * 
 * Solution: Drop the standard unique constraint and replace it with a 
 * Partial/Filtered Unique Index that only applies to active records.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Drop the existing unique constraint
    // In PostgreSQL, Sequelize usually names this 'users_email_key'
    try {
      await queryInterface.removeConstraint('users', 'users_email_key');
    } catch (err) {
      // Fallback for different naming conventions or if it was an index
      try {
        await queryInterface.removeIndex('users', 'users_email_key');
      } catch (inner) {}
    }

    // 2. Create the Partial Unique Index
    // This allows multiple rows with the same email as long as only ONE has deleted_at = NULL
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_users_email_active_unique 
      ON users (email) 
      WHERE deleted_at IS NULL;
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_users_email_active_unique;');
    
    // Restore the strict unique constraint (note: this will FAIL if duplicates exist in soft-deleted rows)
    await queryInterface.addConstraint('users', {
      fields: ['email'],
      type: 'unique',
      name: 'users_email_key'
    });
  }
};

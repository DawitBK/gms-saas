'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add unique constraint to phone numbers (ignore nulls)
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_users_phone_unique ON users (phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;
    `);
    
    // Add verification flags
    await queryInterface.addColumn('users', 'email_verified', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });
    
    await queryInterface.addColumn('users', 'phone_verified', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_users_phone_unique;');
    await queryInterface.removeColumn('users', 'email_verified');
    await queryInterface.removeColumn('users', 'phone_verified');
  }
};

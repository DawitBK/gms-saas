'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      full_name: { type: Sequelize.STRING },
      email: { type: Sequelize.STRING, unique: true, allowNull: false },
      phone: { type: Sequelize.STRING },
      password_hash: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED'), defaultValue: 'ACTIVE' },
      presence: { type: Sequelize.ENUM('ONLINE', 'OFFLINE', 'BUSY'), defaultValue: 'OFFLINE' },
      last_seen: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
  }
};

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('guest_profiles', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      company: { type: Sequelize.STRING, allowNull: true },
      government_id: { type: Sequelize.STRING, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      emergency_contact_name: { type: Sequelize.STRING, allowNull: true },
      emergency_contact_phone: { type: Sequelize.STRING, allowNull: true },
      preferred_notification_channel: {
        type: Sequelize.ENUM('EMAIL', 'SMS', 'BOTH'),
        allowNull: false,
        defaultValue: 'EMAIL',
      },
      is_vip: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      last_visit_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('guest_profiles', ['is_vip']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('guest_profiles');
  },
};

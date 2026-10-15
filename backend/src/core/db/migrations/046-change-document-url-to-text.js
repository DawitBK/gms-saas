'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('guest_profiles', 'document_url', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === 'postgres') {
      await queryInterface.sequelize.query(`
        UPDATE guest_profiles
        SET document_url = LEFT(document_url, 255)
        WHERE document_url IS NOT NULL
          AND LENGTH(document_url) > 255
      `);
    }

    await queryInterface.changeColumn('guest_profiles', 'document_url', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  }
};

'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE visits
      ALTER COLUMN service_id DROP NOT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE visits
      ALTER COLUMN service_id SET NOT NULL;
    `);
  },
};

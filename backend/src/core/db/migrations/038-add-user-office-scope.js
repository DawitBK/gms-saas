'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');

    if (!table.office_id) {
      await queryInterface.addColumn('users', 'office_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'offices', key: 'id' },
        onDelete: 'SET NULL',
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE users
      SET office_id = offices.id
      FROM offices
      WHERE users.office_id IS NULL
        AND (
          (users.email = 'reception.branch-a@gms.local' AND offices.name = 'Branch A')
          OR
          (users.email = 'reception.branch-c@gms.local' AND offices.name = 'Branch C')
        );
    `);
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('users');
    if (table.office_id) {
      await queryInterface.removeColumn('users', 'office_id');
    }
  },
};

'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE roles
      SET name = 'super_admin'
      WHERE name = 'admin'
        AND NOT EXISTS (SELECT 1 FROM roles WHERE name = 'super_admin');
    `);

    await queryInterface.sequelize.query(`
      UPDATE roles
      SET name = 'super_reception'
      WHERE name = 'reception'
        AND NOT EXISTS (SELECT 1 FROM roles WHERE name = 'super_reception');
    `);

    await queryInterface.sequelize.query(`
      INSERT INTO roles (name)
      SELECT role_name
      FROM (
        VALUES
          ('guest'),
          ('host'),
          ('admin'),
          ('reception'),
          ('super_admin'),
          ('super_reception'),
          ('super_host')
      ) AS desired(role_name)
      WHERE NOT EXISTS (
        SELECT 1
        FROM roles
        WHERE roles.name = desired.role_name
      );
    `);

    await queryInterface.sequelize.query(`
      UPDATE recurring_availability
      SET day_of_week = 0
      WHERE day_of_week = 7;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM roles
      WHERE name = 'super_host'
        AND NOT EXISTS (
          SELECT 1
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE r.name = 'super_host'
        );
    `);

    await queryInterface.sequelize.query(`
      DELETE FROM roles
      WHERE name = 'admin'
        AND NOT EXISTS (
          SELECT 1
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE r.name = 'admin'
        );
    `);

    await queryInterface.sequelize.query(`
      DELETE FROM roles
      WHERE name = 'reception'
        AND NOT EXISTS (
          SELECT 1
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE r.name = 'reception'
        );
    `);

    await queryInterface.sequelize.query(`
      UPDATE roles
      SET name = 'admin'
      WHERE name = 'super_admin'
        AND NOT EXISTS (SELECT 1 FROM roles WHERE name = 'admin');
    `);

    await queryInterface.sequelize.query(`
      UPDATE roles
      SET name = 'reception'
      WHERE name = 'super_reception'
        AND NOT EXISTS (SELECT 1 FROM roles WHERE name = 'reception');
    `);

    await queryInterface.sequelize.query(`
      UPDATE recurring_availability
      SET day_of_week = 7
      WHERE day_of_week = 0;
    `);
  },
};

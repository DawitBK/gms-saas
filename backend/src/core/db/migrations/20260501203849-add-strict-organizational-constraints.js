'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 0. Ensure deleted_at exists in offices (missing in baseline)
    const officeInfo = await queryInterface.describeTable('offices');
    if (!officeInfo.deleted_at) {
      await queryInterface.addColumn('offices', 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    // 1. Offices: Name must be unique globally (where not deleted)
    await queryInterface.addIndex('offices', ['name'], {
      unique: true,
      name: 'offices_name_unique_idx',
      where: { deleted_at: null }
    });

    // 2. Departments: Name must be unique within an Office (where not deleted)
    await queryInterface.addIndex('departments', ['office_id', 'name'], {
      unique: true,
      name: 'departments_office_name_unique_idx',
      where: { deleted_at: null }
    });

    // 3. Services: Name must be unique within a Department (where not deleted)
    await queryInterface.addIndex('services', ['department_id', 'name'], {
      unique: true,
      name: 'services_dept_name_unique_idx',
      where: { deleted_at: null }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('offices', 'offices_name_unique_idx');
    await queryInterface.removeIndex('departments', 'departments_office_name_unique_idx');
    await queryInterface.removeIndex('services', 'services_dept_name_unique_idx');
    // We keep the column for safety in down migration
  }
};

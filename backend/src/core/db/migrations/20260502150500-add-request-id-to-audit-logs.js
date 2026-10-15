'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add request_id to support trace ID correlation in audit logs
    await queryInterface.addColumn('audit_logs', 'request_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('audit_logs', 'request_id');
  }
};

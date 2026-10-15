'use strict';

/**
 * Phase 9: Soft Deletes + Composite Performance Indexes
 *
 * - Adds deleted_at to: users, visits, services
 * - Adds composite index on visits for scheduling query performance
 * - Adds composite index on time_slots for availability lookups
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // --- Soft Delete Columns ---
    const usersInfo = await queryInterface.describeTable('users');
    if (!usersInfo.deleted_at) {
      await queryInterface.addColumn('users', 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    const visitsInfo = await queryInterface.describeTable('visits');
    if (!visitsInfo.deleted_at) {
      await queryInterface.addColumn('visits', 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    const servicesInfo = await queryInterface.describeTable('services');
    if (!servicesInfo.deleted_at) {
      await queryInterface.addColumn('services', 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    // --- Composite Performance Indexes (Phase 13) ---
    // Scheduling queries: filter by office + time range
    await queryInterface.addIndex('visits', ['scheduled_start', 'office_id'], {
      name: 'idx_visits_scheduled_start_office_id',
    });

    // Status-based dashboard queries
    await queryInterface.addIndex('visits', ['status', 'office_id'], {
      name: 'idx_visits_status_office',
    });

    // Availability slot lookups
    await queryInterface.addIndex('time_slots', ['host_id', 'is_booked', 'start_time'], {
      name: 'idx_time_slots_host_availability',
    });

    // Partial index for active (non-soft-deleted) users
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_users_active ON users (email) WHERE deleted_at IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('visits', 'idx_visits_scheduled_start_office_id');
    await queryInterface.removeIndex('visits', 'idx_visits_status_office');
    await queryInterface.removeIndex('time_slots', 'idx_time_slots_host_availability');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_users_active;');

    await queryInterface.removeColumn('users', 'deleted_at');
    await queryInterface.removeColumn('visits', 'deleted_at');
    await queryInterface.removeColumn('services', 'deleted_at');
  },
};

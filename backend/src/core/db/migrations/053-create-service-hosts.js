'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('service_hosts', {
      service_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        references: {
          model: 'services',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      host_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        references: {
          model: 'hosts',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Add indexes for faster lookups
    await queryInterface.addIndex('service_hosts', ['service_id']);
    await queryInterface.addIndex('service_hosts', ['host_id']);

    // Data migration: Migrate from services.host_ids array to service_hosts table
    const [services] = await queryInterface.sequelize.query(
      'SELECT id, host_ids FROM services'
    );

    const now = new Date();
    const serviceHosts = [];

    for (const service of services) {
      if (service.host_ids && Array.isArray(service.host_ids)) {
        // Use a Set to avoid duplicates within the same service
        const uniqueHostIds = [...new Set(service.host_ids)];
        for (const hostId of uniqueHostIds) {
            // Check if host exists to avoid FK violation
            const [hosts] = await queryInterface.sequelize.query(
                `SELECT id FROM hosts WHERE id = ${hostId}`
            );
            if (hosts.length > 0) {
                serviceHosts.push({
                    service_id: service.id,
                    host_id: hostId,
                    created_at: now,
                    updated_at: now
                });
            }
        }
      }
    }

    if (serviceHosts.length > 0) {
      await queryInterface.bulkInsert('service_hosts', serviceHosts);
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('service_hosts');
  }
};

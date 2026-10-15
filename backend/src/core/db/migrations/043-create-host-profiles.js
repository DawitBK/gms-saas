"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("host_profiles", {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        unique: true,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      employee_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      job_title: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      bio: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      avatar_url: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      phone_extension: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex("host_profiles", ["user_id"]);
    await queryInterface.addIndex("host_profiles", ["employee_id"]);

    // Backfill existing hosts with profiles
    const [hosts] = await queryInterface.sequelize.query(`
      SELECT user_id FROM hosts
    `);

    if (hosts.length) {
      const now = new Date();
      const profiles = hosts.map((host) => ({
        user_id: host.user_id,
        job_title: "Staff Host",
        created_at: now,
        updated_at: now,
      }));
      await queryInterface.bulkInsert("host_profiles", profiles);
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("host_profiles");
  },
};

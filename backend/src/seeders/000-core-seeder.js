"use strict";

const { seedPasswordHash } = require("./seed-password");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const now = new Date();
    // Throws in production unless GMS_SEED_ADMIN_PASSWORD is set — this seeder
    // creates master@gms.local and admin@gms.local as super_admin, and
    // package.json's db:fresh:prod / seed:passwords:prod point it at gmsprod.
    const passwordHash = await seedPasswordHash();

    // 1. Roles
    const roles = [
      { id: 1, name: "guest" },
      { id: 2, name: "host" },
      { id: 3, name: "reception" },
      { id: 4, name: "admin" },
      { id: 5, name: "super_host" },
      { id: 6, name: "super_reception" },
      { id: 7, name: "super_admin" },
    ];

    for (const role of roles) {
      await queryInterface.sequelize.query(
        `INSERT INTO roles (id, name) 
         VALUES (${role.id}, '${role.name}')
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name;`
      );
    }

    // Ensure we have up-to-date role IDs (don't assume hard-coded numeric ids)
    const roleNamesList = roles.map(r => `'${r.name}'`).join(',');
    const [existingRoles] = await queryInterface.sequelize.query(
      `SELECT id, name FROM roles WHERE name IN (${roleNamesList})`
    );
    const roleMap = {};
    for (const r of existingRoles) {
      roleMap[r.name] = r.id;
    }
    const superAdminRoleId = roleMap['super_admin'] || 7;

    // 2. Bootstrap Super Admin (Master account)
    const [existingUsers] = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE email = 'master@gms.local'`
    );

    let userId;
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
    } else {
      const [user] = await queryInterface.bulkInsert("users", [{
        full_name: "System Master",
        email: "master@gms.local",
        password_hash: passwordHash,
        status: "ACTIVE",
        requires_password_change: true,
        created_at: now,
        updated_at: now
      }], { returning: true });
      userId = user.id;
    }

    // 2b. Bootstrap Admin Account (Commonly used by user)
    const [existingAdmins] = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE email = 'admin@gms.local'`
    );
    if (existingAdmins.length === 0) {
      const [adminUser] = await queryInterface.bulkInsert("users", [{
        full_name: "Admin User",
        email: "admin@gms.local",
        password_hash: passwordHash,
        status: "ACTIVE",
        requires_password_change: true,
        created_at: now,
        updated_at: now
      }], { returning: true });
      
      await queryInterface.sequelize.query(
        `INSERT INTO user_roles (user_id, role_id, created_at, updated_at) 
         VALUES (${adminUser.id}, ${superAdminRoleId}, '${now.toISOString()}', '${now.toISOString()}');`
      );
    }

    // 3. Assign Super Admin Role
    await queryInterface.sequelize.query(
      `INSERT INTO user_roles (user_id, role_id, created_at, updated_at) 
       VALUES (${userId}, ${superAdminRoleId}, '${now.toISOString()}', '${now.toISOString()}')
       ON CONFLICT (user_id, role_id) DO NOTHING;`
    );

    console.log("[Core Seeder] System roles and master account initialized.");
  },

  down: async (queryInterface, Sequelize) => {
    // Usually core roles are not deleted
  }
};

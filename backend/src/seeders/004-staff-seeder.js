"use strict";

const { seedPasswordHash, seedPasswordNotice } = require("./seed-password");

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const sq = queryInterface.sequelize;
    const passwordHash = await seedPasswordHash();

    console.log("\n[staff-seed] Starting staff and guest seeding...");

    // 1. Fetch Roles
    const [roles] = await sq.query(`SELECT id, name FROM roles`);
    const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

    // 2. Staff Roles to seed (6 roles)
    const staffRoles = [
      "host",
      "reception",
      "admin",
      "super_host",
      "super_reception",
      "super_admin",
    ];

    // 3. Create Staff
    console.log(`[staff-seed] Seeding staff with roles and passwords...`);

    for (const roleName of staffRoles) {
      const email = `${roleName}@gms.local`;
      const fullName = `${roleName.replace("_", " ").toUpperCase()}`;

      // Create User
      const [[existUser]] = await sq.query(
        `SELECT id FROM users WHERE email = :email LIMIT 1`,
        { replacements: { email } },
      );

      let userId;
      if (existUser) {
        userId = existUser.id;
        await sq.query(
          `UPDATE users SET full_name = :fn, password_hash = :ph, updated_at = NOW() WHERE id = :id`,
          { replacements: { fn: fullName, ph: passwordHash, id: userId } },
        );
      } else {
        const [[ins]] = await sq.query(
          `INSERT INTO users (full_name, email, password_hash, status, created_at, updated_at)
           VALUES (:fn, :email, :ph, 'ACTIVE', NOW(), NOW()) RETURNING id`,
          { replacements: { fn: fullName, email, ph: passwordHash } },
        );
        userId = ins.id;
      }

      // Assign Role
      const roleId = roleMap[roleName];
      if (roleId) {
        await sq.query(
          `INSERT INTO user_roles (user_id, role_id, created_at, updated_at)
           VALUES (:uid, :rid, NOW(), NOW()) ON CONFLICT (user_id, role_id) DO NOTHING`,
          { replacements: { uid: userId, rid: roleId } },
        );
      }
    }

    console.log("\n[staff-seed] Seeding complete!");
    console.log(`Credentials: password for all seeded accounts is ${seedPasswordNotice()}.`);
  },

  async down(queryInterface, Sequelize) {
    const sq = queryInterface.sequelize;
    // Cleanup users with @gms.local
    await sq.query(
      `DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@gms.local')`,
    );
    await sq.query(
      `DELETE FROM guest_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@gms.local')`,
    );
    await sq.query(
      `DELETE FROM hosts WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@gms.local')`,
    );
    await sq.query(`DELETE FROM users WHERE email LIKE '%@gms.local'`);
    console.log("[staff-seed] Staff and guest data rolled back.");
  },
};

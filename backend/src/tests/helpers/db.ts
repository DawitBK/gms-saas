import { sequelize } from "../../infrastructure/database/sequelize";

export async function connectTestDb() {
  await sequelize.authenticate();
}

export async function disconnectTestDb() {
  await sequelize.close();
}

export async function cleanDb() {
  // Truncate all tables in correct FK order
  await sequelize.query(`
    TRUNCATE TABLE 
      audit_logs, outbox_events, access_credentials, visit_assignments,
      visits, time_slots, recurring_availability, service_hosts, services,
      host_profiles, hosts, notifications, messages, guest_profiles,
      auth_sessions, idempotency_keys, user_roles, users,
      departments, offices, roles
    RESTART IDENTITY CASCADE
  `);
}

export async function seedMinimal() {
  // Insert bare minimum: core roles + one user per role
  // Use the same logic as 000-core-seeder.js but inline for test isolation
  const {
    Role,
    User,
    UserRole,
  } = require("../../infrastructure/database/models");

  // Create core roles if they don't exist
  const roles = [
    { name: "super_admin", display_name: "Super Admin", level: 100 },
    { name: "admin", display_name: "Admin", level: 90 },
    { name: "super_reception", display_name: "Super Reception", level: 80 },
    { name: "reception", display_name: "Reception", level: 70 },
    { name: "super_host", display_name: "Super Host", level: 60 },
    { name: "host", display_name: "Host", level: 50 },
    { name: "guest", display_name: "Guest", level: 10 },
    { name: "vip_guest", display_name: "VIP Guest", level: 15 },
  ];

  for (const role of roles) {
    await Role.findOrCreate({
      where: { name: role.name },
      defaults: role,
    });
  }
}

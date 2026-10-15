const bcrypt = require('bcryptjs');
const { sequelize } = require('../dist/infrastructure/database/sequelize.js');

async function main() {
  await sequelize.authenticate();
  const hash = await bcrypt.hash('GuestE2E@2026', 10);
  
  // Upsert or update guest user
  const [check] = await sequelize.query("SELECT id FROM users WHERE email = 'natnael.hailu19@guestmail.et'");
  if (check.length > 0) {
    await sequelize.query("UPDATE users SET password_hash = :hash, status = 'ACTIVE' WHERE email = 'natnael.hailu19@guestmail.et'", {
      replacements: { hash }
    });
    console.log('Updated existing guest user password');
  } else {
    await sequelize.query(
      "INSERT INTO users (email, password_hash, full_name, role, status, department_id, office_id, created_at, updated_at) VALUES ('natnael.hailu19@guestmail.et', :hash, 'Natnael Hailu', 'guest', 'ACTIVE', 1, 1, NOW(), NOW())",
      { replacements: { hash } }
    );
    console.log('Inserted new guest user');
  }
  
  // Also ensure guest user has a visit record for e2e tests
  const [user] = await sequelize.query("SELECT id FROM users WHERE email = 'natnael.hailu19@guestmail.et'");
  const guestId = user[0].id;
  const [visitCheck] = await sequelize.query("SELECT id FROM visits WHERE guest_id = :guestId", {
    replacements: { guestId }
  });
  if (visitCheck.length === 0) {
    await sequelize.query(
      "INSERT INTO visits (guest_id, host_id, department_id, office_id, status, purpose, scheduled_start_time, scheduled_end_time, created_at, updated_at) VALUES (:guestId, 1, 1, 1, 'CONFIRMED', 'E2E Testing', NOW(), NOW() + interval '1 hour', NOW(), NOW())",
      { replacements: { guestId } }
    );
    console.log('Seeded visit for guest');
  }
  
  await sequelize.close();
}

main().catch(console.error);

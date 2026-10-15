const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const mode = process.argv[2] || process.env.NODE_ENV || 'development';
const rootDir = path.resolve(__dirname, '..');
const envFiles = ['.env', `.env.${mode}`];

process.env.NODE_ENV = mode;

for (const envFile of envFiles) {
  const envPath = path.join(rootDir, envFile);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  }
}

const { sequelize } = require('../dist/infrastructure/database/sequelize');

const WORKING_DAYS_TO_SEED = Number(process.env.GMS_SEED_WORKING_DAYS ?? 30);
const SLOT_INTERVAL_MINUTES = Number(process.env.GMS_SEED_SLOT_INTERVAL_MINUTES ?? 30);
const START_HOUR = Number(process.env.GMS_SEED_START_HOUR ?? 8);
const END_HOUR = Number(process.env.GMS_SEED_END_HOUR ?? 18);

function startOfDataWindow() {
  const date = new Date();
  date.setDate(date.getDate() - 3);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isWeekday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

async function main() {
  await sequelize.authenticate();

  const [hosts] = await sequelize.query(`
    SELECT id, office_id
    FROM hosts
    WHERE active = TRUE
    ORDER BY id
  `);

  if (!hosts.length) {
    console.log('No active hosts found. No time slots seeded.');
    await sequelize.close();
    return;
  }

  let inserted = 0;
  const startDate = startOfDataWindow();
  const slotsPerDay = ((END_HOUR - START_HOUR) * 60) / SLOT_INTERVAL_MINUTES;

  for (const host of hosts) {
    let seededDays = 0;
    const cursor = new Date(startDate);

    while (seededDays < WORKING_DAYS_TO_SEED) {
      if (!isWeekday(cursor)) {
        cursor.setDate(cursor.getDate() + 1);
        continue;
      }

      for (let slotIndex = 0; slotIndex < slotsPerDay; slotIndex += 1) {
        const start = new Date(cursor);
        const minutesFromStart = slotIndex * SLOT_INTERVAL_MINUTES;
        const hour = START_HOUR + Math.floor(minutesFromStart / 60);
        const minute = minutesFromStart % 60;
        start.setHours(hour, minute, 0, 0);

        const end = new Date(start);
        end.setMinutes(end.getMinutes() + SLOT_INTERVAL_MINUTES);

        const [result] = await sequelize.query(
          `
            INSERT INTO time_slots (host_id, office_id, start_time, end_time, is_booked)
            SELECT :hostId, :officeId, :startTime, :endTime, FALSE
            WHERE NOT EXISTS (
              SELECT 1
              FROM time_slots
              WHERE host_id = :hostId
                AND start_time = :startTime
            )
            RETURNING id
          `,
          {
            replacements: {
              hostId: host.id,
              officeId: host.office_id,
              startTime: start.toISOString(),
              endTime: end.toISOString(),
            },
          }
        );

        inserted += result.length;
      }

      seededDays += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  console.log(
    `Seeded ${inserted} time slot(s) across ${hosts.length} active host(s) ` +
      `for ${WORKING_DAYS_TO_SEED} weekday(s) with ${SLOT_INTERVAL_MINUTES}-minute intervals.`
  );
  await sequelize.close();
}

main().catch(async (error) => {
  console.error('Failed to seed time slots:', error);
  await sequelize.close();
  process.exit(1);
});

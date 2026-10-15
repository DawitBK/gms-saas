const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { randomUUID } = require('crypto');

// Import EventBus after build (dist/ exists)
const { EventBus } = require('../dist/infrastructure/events/eventBus');

/* ============================================================
   GMS Enterprise — Simulation Engine
   ============================================================
   Generates realistic guest users and visit lifecycle data for
   dashboard / report / load testing.  Two modes:

   1) HISTORY SEED (default)
      Instantly backfills N days of realistic visits, guests,
      approvals, ratings and check-ins.

   2) LIVE TURBO MODE (optional)
      After seeding history, continuously creates new visits and
      advances them through the lifecycle at an accelerated
      clock so you can watch the system evolve in real time.

   Environment variables
   ---------------------
   SIMULATION_HISTORY_DAYS     Past days to seed  (default: 180)
   SIMULATION_TARGET_VISITS    Total visits to create (default: 8000)
   SIMULATION_GUEST_POOL       Unique guests to create (default: 400)
   SIMULATION_VIP_RATIO        Fraction of VIP guests (default: 0.08)
   SIMULATION_LIVE_MODE        "true" to enable live turbo (default: false)
   SIMULATION_TIME_SCALE       Simulated seconds per real second
                               1      = real-time
                               3600   = 1 hour/sec
                               86400  = 1 day/sec   (default: 86400)
   SIMULATION_TICK_MS          Real ms between ticks (default: 1000)
   SIMULATION_LIVE_DURATION_HOURS How many real hours to run live
                               (default: 0.5 = 30 min)
   SIMULATION_OFFICE_IDS       Comma-separated office filter
                               (default: all offices)

   Usage
   -----
   npm run simulate
   or
   node scripts/simulation-engine.js

   Prerequisites
   -------------
   npm run build   (so dist/ exists)
   npm run seed:demo   (creates offices, departments, services, hosts)
   ============================================================ */

const mode = process.env.NODE_ENV || 'development';
const rootDir = path.resolve(__dirname, '..');
for (const envFile of ['.env', `.env.${mode}`]) {
  const envPath = path.join(rootDir, envFile);
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: true });
}

const { sequelize } = require('../dist/infrastructure/database/sequelize');

/* ---------- Config ---------- */
const HISTORY_DAYS = Number(process.env.SIMULATION_HISTORY_DAYS || 30);
const TARGET_VISITS = Number(process.env.SIMULATION_TARGET_VISITS || 8000);
const GUEST_POOL = Number(process.env.SIMULATION_GUEST_POOL || 400);
const VIP_RATIO = Number(process.env.SIMULATION_VIP_RATIO || 0.08);
const LIVE_MODE = String(process.env.SIMULATION_LIVE_MODE).toLowerCase() === 'true';
const TIME_SCALE = Number(process.env.SIMULATION_TIME_SCALE || 86400); // 1 day / sec
const TICK_MS = Number(process.env.SIMULATION_TICK_MS || 1000);
const LIVE_DURATION_HOURS = Number(process.env.SIMULATION_LIVE_DURATION_HOURS || 0.5);
const OFFICE_FILTER = process.env.SIMULATION_OFFICE_IDS
  ? process.env.SIMULATION_OFFICE_IDS.split(',').map(Number)
  : null;

/* ---------- Name pools ---------- */
const FIRST_NAMES = [
  'Abebe','Kebede','Tigist','Alemu','Daniel','Haile','Selamawit','Tesfaye',
  'Yohannes','Girma','Hiwot','Mengesha','Bereket','Tadesse','Marta','Worku',
  'Solomon','Bekele','Eyob','Getachew','Rahel','Assefa','Tewodros','Asfaw',
  'Bezawit','Demissie','Henok','Fekadu','Almaz','Shiferaw','Mikias','Negash',
  'Sara','Tilahun','Kaleb','Zeleke','Eden','Tsegay','Natnael','Hailu',
  'Mulu','Belay','Genet','Desta','Woinshet','Bogale','Fikir','Teferi',
  'Aster','Gedion','Mahlet','Kassahun','Meron','Abiy','Yonas','Meseret',
  'Fitsum','Habtamu','Rediet','Tamirat','Hiwot','Abel','Samuel','Liya',
  'Nardos','Yared','Eyerus','Biruk','Hanna','Kidus','Mekdes','Robel'
];
const LAST_NAMES = [
  'Alemu','Tesfaye','Kebede','Girma','Bekele','Mengesha','Tadesse','Worku',
  'Getachew','Assefa','Asfaw','Demissie','Fekadu','Shiferaw','Negash','Tilahun',
  'Zeleke','Tsegay','Hailu','Belay','Desta','Bogale','Teferi','Gedion',
  'Kassahun','Abiy','Meseret','Habtamu','Tamirat','Kidus','Robel','Mekonnen',
  'Ayalew','Wondimu','Tafesse','Hailemariam','Abera','Dagne','Yilma','Berhe',
  'Lemma','Shewangizaw','Hailu','Wolde','Gebre','Tewolde','Asnake','Seifu',
  'Zewdu','Belew','Melaku','Arega','Benti','Gosa','Jemberu','Ketema'
];
const COMPANIES = [
  'Ethio Telecom','CBE','Awash Bank','Dashen Bank','Examplelandn Airlines',
  'Safaricom ET','M-BIRR','Oromia International Bank','Wegagen Bank',
  'Bidco Exampleland','Example Corp Trading','Moha Soft Drinks','East Africa Holding',
  null, null, null, null
];
const PURPOSES = [
  'Quarterly review meeting','Project kick-off discussion','Contract negotiation',
  'Technical support session','Vendor inspection','Financial audit walkthrough',
  'Job interview — Senior Role','Partnership exploration','Legal advisory session',
  'IT security briefing','HR onboarding briefing','Marketing campaign review',
  'Logistics coordination','Safety training follow-up','Farm quality inspection',
  'Fleet maintenance review','Budget approval discussion','Stakeholder alignment',
  'Product demo','Guest courtesy visit'
];
const GOOD_COMMENTS = [
  'Excellent service and very welcoming host.',
  'Everything was on time and professional.',
  'Great experience, will definitely return.',
  'The reception team was outstanding.',
  'Smooth process from start to finish.'
];
const BAD_COMMENTS = [
  'Waited longer than expected.',
  'Host seemed unprepared for the meeting.',
  'Room was too cold and no refreshments offered.',
  'Difficult to locate the office.',
  'Scheduling conflict caused a 20 min delay.'
];

/* ---------- Helpers ---------- */
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(p) { return Math.random() < p; }
function pickWeighted(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) { if (r < weights[i]) return items[i]; r -= weights[i]; }
  return items[items.length - 1];
}
function dateStr(d) { return d.toISOString().slice(2, 10).replace(/-/g, ''); }
function officeCode(name) {
  return (name || 'OFC').split(' ').map(w => w[0]).join('').substring(0, 3).toUpperCase();
}
function addMinutes(d, mins) { const x = new Date(d); x.setMinutes(x.getMinutes() + mins); return x; }
function addSeconds(d, secs) { const x = new Date(d); x.setSeconds(x.getSeconds() + secs); return x; }
function isWeekend(d) { const day = d.getDay(); return day === 0 || day === 6; }
function businessHourMinutes() {
  // weighted toward peak hours 09-11 and 14-16
  const hour = pickWeighted([8,9,10,11,12,13,14,15,16,17], [5,20,25,15,10,5,20,25,15,5]);
  const minute = pick([0,15,30,45]);
  return hour * 60 + minute;
}

/**
 * Dynamic Probability Matrix
 * Returns probabilities that fluctuate based on simulated time of day
 * to model peak hours, lunch lulls, and end-of-day rush.
 */
function getProbabilities(simTime) {
  const hour = simTime.getHours();
  let peakFactor = 1.0;

  // Peak hours (09:00-11:00 and 14:00-16:00)
  if ((hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16)) peakFactor = 1.25;
  // Lunch lull (12:00-13:30)
  else if (hour >= 12 && hour <= 13) peakFactor = 0.6;
  // Night/Evening (after 18:00 or before 08:00)
  else if (hour >= 18 || hour < 8) peakFactor = 0.3;

  // Add random jitter +/- 5% to the base probabilities
  const jitter = () => 0.95 + Math.random() * 0.1;

  return {
    TRANSITION_TO_IN_PROGRESS: 0.85 * peakFactor * jitter(),
    TRANSITION_TO_COMPLETED: 0.90 * jitter(),
    AUTO_APPROVE: 0.65 * peakFactor * jitter(),
    REASSIGNMENT: 0.12 * jitter(),
    ESCALATION: 0.08 * (1/peakFactor) * jitter(), 
    RESCHEDULE: 0.05 * jitter(),
    GUEST_ACCEPTED: 0.80 * jitter(),
    NO_SHOW: 0.15 * (1/peakFactor) * jitter(), 
    EXTENSION: 0.15 * jitter(),
    MANUAL_CHECKIN_OVERRIDE: 0.05 * jitter(), // Simulates QR/UniFi failure + Receptionist override
    VISIT_VOLUME_MULTIPLIER: peakFactor,
  };
}

/**
 * Stochastic check helper
 */
function stochastic(baseProb, weight = 1.0) {
  const adjusted = Math.min(0.99, Math.max(0.01, baseProb * weight));
  return Math.random() < adjusted;
}

/* ---------- DB Bootstrap ---------- */
async function loadInfrastructure() {
  const [offices] = await sequelize.query(`SELECT id, name FROM offices ORDER BY id`);
  let activeOffices = offices;
  if (OFFICE_FILTER && OFFICE_FILTER.length) {
    activeOffices = offices.filter(o => OFFICE_FILTER.includes(Number(o.id)));
  }
  if (!activeOffices.length) throw new Error('No offices found. Run seed:demo first.');

  const officeIds = activeOffices.map(o => o.id);
  const [hosts] = await sequelize.query(
    `SELECT h.id, h.office_id, h.user_id FROM hosts h WHERE h.active = TRUE AND h.office_id IN (:oids) ORDER BY h.id`,
    { replacements: { oids: officeIds } }
  );
  if (!hosts.length) throw new Error('No active hosts found. Run seed:demo first.');

  const [departments] = await sequelize.query(
    `SELECT id, office_id, name FROM departments WHERE office_id IN (:oids) ORDER BY id`,
    { replacements: { oids: officeIds } }
  );
  const [services] = await sequelize.query(
    `SELECT id, office_id, department_id, name, duration_minutes FROM services WHERE office_id IN (:oids) ORDER BY id`,
    { replacements: { oids: officeIds } }
  );

  const [roles] = await sequelize.query(`SELECT id, name FROM roles`);
  const guestRoleId = roles.find(r => r.name === 'guest')?.id;

  // group hosts & depts & svcs by office for fast lookup
  const byOffice = {
    hosts: {}, depts: {}, svcs: {}
  };
  for (const o of activeOffices) {
    byOffice.hosts[o.id] = hosts.filter(h => Number(h.office_id) === Number(o.id));
    byOffice.depts[o.id] = departments.filter(d => Number(d.office_id) === Number(o.id));
    byOffice.svcs[o.id] = services.filter(s => Number(s.office_id) === Number(o.id));
  }

  return { offices: activeOffices, hosts, departments, services, guestRoleId, byOffice };
}

/* ---------- Guest Generation ---------- */
async function generateGuests(guestRoleId, count) {
  console.log(`[sim] Creating ${count} simulated guests...`);
  const ids = [];
  const vipIds = new Set();

  const existingGuests = await sequelize.query(
    `SELECT email FROM users WHERE email LIKE '%@simguest.et'`,
    { type: sequelize.QueryTypes.SELECT }
  );
  const existingEmails = new Set(existingGuests.map(g => g.email));

  for (let i = 0; i < count; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const email = `${first.toLowerCase()}.${last.toLowerCase()}.${i + 1}@simguest.et`;
    
    if (existingEmails.has(email)) {
      const [[userRow]] = await sequelize.query(
        `SELECT id FROM users WHERE email = :email`,
        { replacements: { email }, type: sequelize.QueryTypes.SELECT }
      );
      if (userRow) ids.push(userRow.id);
      continue;
    }
    
    const phone = `+15559${rnd(1, 9)}${String(rnd(100000, 999999))}`;
    const isVip = chance(VIP_RATIO);

    const [[userRow]] = await sequelize.query(
      `INSERT INTO users (full_name, email, phone, status, created_at, updated_at)
       VALUES (:fn, :email, :phone, 'ACTIVE', NOW(), NOW()) RETURNING id`,
      { replacements: { fn: `${first} ${last}`, email, phone } }
    );
    const userId = userRow.id;

    if (guestRoleId) {
      await sequelize.query(
        `INSERT INTO user_roles (user_id, role_id, created_at, updated_at)
         VALUES (:uid, :rid, NOW(), NOW()) ON CONFLICT DO NOTHING`,
        { replacements: { uid: userId, rid: guestRoleId } }
      );
    }

    await sequelize.query(
      `INSERT INTO guest_profiles (user_id, company, is_vip, preferred_notification_channel, created_at, updated_at)
       VALUES (:uid, :company, :vip, 'EMAIL', NOW(), NOW())`,
      { replacements: { uid: userId, company: pick(COMPANIES), vip: isVip } }
    );

    ids.push(userId);
    if (isVip) vipIds.add(userId);
  }
  console.log(`[sim]  ✔ ${ids.length} guests created (${vipIds.size} VIP)`);
  return { guestIds: ids, vipIds };
}

async function seedHostAvailability(infra) {
  console.log('[sim] Seeding host availability rules and slots...');
  const { hosts } = infra;
  
  for (const host of hosts) {
    // Mon-Fri Weekly
    for (let day = 1; day <= 5; day++) {
      await sequelize.query(
        `INSERT INTO recurring_availability (host_id, office_id, recurrence_type, day_of_week, start_time, end_time, is_available, created_at, updated_at)
         VALUES (:hid, :oid, 'WEEKLY', :day, '08:00:00', '18:00:00', TRUE, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        { replacements: { hid: host.id, oid: host.office_id, day } }
      );
    }
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Seed slots for +/- 15 days to cover history and future
    for (let i = -15; i < 15; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      if (isWeekend(date)) continue;
      
      const slots = ['08:30', '09:30', '10:30', '11:30', '13:30', '14:30', '15:30', '16:30'];
      for (const time of slots) {
        const [h, m] = time.split(':').map(Number);
        const start = new Date(date);
        start.setHours(h, m, 0, 0);
        const end = new Date(start);
        end.setMinutes(end.getMinutes() + 60);
        
        await sequelize.query(
          `INSERT INTO time_slots (host_id, office_id, start_time, end_time, is_booked, slot_state)
           VALUES (:hid, :oid, :start, :end, FALSE, 'AVAILABLE')
           ON CONFLICT DO NOTHING`,
          { replacements: { hid: host.id, oid: host.office_id, start: start.toISOString(), end: end.toISOString() } }
        );
      }
    }
  }
  console.log('[sim]  ✔ Host availability seeded.');
}

/* ---------- Visit Factory ---------- */
function chooseStatusForPastVisit() {
  return pickWeighted(
    ['COMPLETED','CANCELLED','NO_SHOW','DECLINED','ESCALATED'],
    [70, 10, 8, 7, 5]
  );
}

function chooseStatusForRecentVisit() {
  // visits in the last ~24h
  return pickWeighted(
    ['COMPLETED','CHECKED_IN','IN_PROGRESS','APPROVED','CANCELLED','NO_SHOW','DECLINED','ESCALATED'],
    [40, 15, 10, 12, 8, 6, 5, 4]
  );
}

function chooseStatusForFutureVisit() {
  return pickWeighted(['PENDING','APPROVED'], [60, 40]);
}

/* ---------- Daily Sequence Tracker ---------- */
class DailySeq {
  constructor() { this.map = new Map(); }
  key(officeId, d) { return `${officeId}|${dateStr(d)}`; }
  next(officeId, d) {
    const k = this.key(officeId, d);
    const n = (this.map.get(k) || 0) + 1;
    this.map.set(k, n);
    return n;
  }
}

/* ---------- Bulk Visit Inserter ---------- */
async function insertVisitsBatch(visits) {
  if (!visits.length) return [];

  const visitValues = visits.map(v => `(
    ${v.guest_id}, ${v.office_id}, ${v.department_id}, ${v.service_id || 'NULL'},
    ${v.assigned_host_id || 'NULL'}, ${sequelize.escape(v.purpose)},
    ${sequelize.escape(v.status)}, ${sequelize.escape(v.scheduled_start.toISOString())},
    ${sequelize.escape(v.scheduled_end.toISOString())},
    ${v.checked_in_at ? sequelize.escape(v.checked_in_at.toISOString()) : 'NULL'},
    ${v.checked_out_at ? sequelize.escape(v.checked_out_at.toISOString()) : 'NULL'},
    ${sequelize.escape(v.qr_code)}, ${v.escalated_to_reception},
    ${v.is_vip}, ${v.rating || 'NULL'}, ${v.rating_comment ? sequelize.escape(v.rating_comment) : 'NULL'},
    ${v.daily_sequence || 'NULL'}, ${v.reference_number ? sequelize.escape(v.reference_number) : 'NULL'},
    ${sequelize.escape(v.created_at.toISOString())}, NOW()
  )`).join(',');

  const q = `
    INSERT INTO visits
      (guest_id, office_id, department_id, service_id, assigned_host_id, purpose, status,
       scheduled_start, scheduled_end, checked_in_at, checked_out_at, qr_code,
       escalated_to_reception, is_vip, rating, rating_comment,
       daily_sequence, reference_number, created_at, updated_at)
    VALUES ${visitValues}
    RETURNING id, guest_id, office_id, department_id, status, scheduled_start, assigned_host_id
  `;

  const [rows] = await sequelize.query(q);
  const inserted = Array.isArray(rows) ? rows : [];

  // Emit real-time events for dashboard updates
  for (const v of inserted) {
    try {
      EventBus.emitEvent({
        type: 'VISIT.CREATED',
        metadata: {
          entity_id: v.id,
          office_id: v.office_id,
          timestamp: new Date(),
          after: { id: v.id, status: v.status, scheduled_start: v.scheduled_start },
        },
      });
    } catch (e) {
      // Ignore event errors during simulation
    }
  }

  return inserted;
}

/* ---------- Audit & Notification Factories ---------- */
async function insertAuditLogsBatch(logs) {
  if (!logs.length) return;
  const values = logs.map(l => {
    // Merge extra fields into metadata
    const metadata = { ...l.metadata, office_id: l.office_id, timestamp: l.timestamp };
    return `(
      ${l.actor_id || 'NULL'}, ${sequelize.escape(l.event_type)},
      ${sequelize.escape(l.entity_type)}, ${sequelize.escape(String(l.entity_id || ''))},
      ${sequelize.escape(JSON.stringify(metadata))}, 
      ${sequelize.escape((l.timestamp || new Date()).toISOString())}
    )`;
  }).join(',');

  await sequelize.query(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata, created_at)
     VALUES ${values}`,
    { type: sequelize.QueryTypes.INSERT }
  );
}

async function insertNotificationsBatch(notifs) {
  if (!notifs.length) return;
  const values = notifs.map(n => `(
    ${n.user_id}, ${sequelize.escape(n.title)}, ${sequelize.escape(n.message)},
    ${sequelize.escape(n.type)}, ${sequelize.escape(JSON.stringify(n.metadata || {}))},
    FALSE, ${sequelize.escape((n.created_at || new Date()).toISOString())}
  )`).join(',');

  await sequelize.query(
    `INSERT INTO notifications (user_id, title, message, type, metadata, is_read, created_at)
     VALUES ${values}`,
    { type: sequelize.QueryTypes.INSERT }
  );
}

async function backfillCredentials(visitRows, nowRef) {
  const creds = [];
  const activeVisits = visitRows.filter(v => ['CHECKED_IN', 'IN_PROGRESS'].includes(v.status));
  
  for (const v of activeVisits) {
    if (!v.scheduled_end) continue;
    const validUntil = new Date(v.scheduled_end);
    if (isNaN(validUntil.getTime())) continue;
    
    validUntil.setHours(validUntil.getHours() + 1);
    
    creds.push(`(
      ${v.id}, 
      'QR',
      'INTERNAL', 
      'ACTIVE', 
      'sim-id-${v.guest_id}', 
      'sim-cred-${v.id}', 
      '{"qr_code": "${v.qr_code}", "is_sim": true}', 
      NOW(),
      ${sequelize.escape(validUntil.toISOString())}, 
      NOW(), 
      NOW()
    )`);
  }

  if (!creds.length) return;
  const total = creds.length;
  const chunks = [];
  while (creds.length) chunks.push(creds.splice(0, 500));
  for (const chunk of chunks) {
    await sequelize.query(
      `INSERT INTO access_credentials (visit_id, credential_type, provider, status, external_identity_id, external_credential_id, metadata, valid_from, valid_until, created_at, updated_at) 
       VALUES ${chunk.join(',')}`,
      { type: sequelize.QueryTypes.INSERT }
    );
  }
  console.log(`[sim]  ✔ ${total} active credentials backfilled.`);
}

async function backfillApprovals(visitRows, hostMap, nowRef) {
  const approvalValues = [];
  for (const v of visitRows) {
    const status = v.status;
    if (!['APPROVED','COMPLETED','CHECKED_IN','IN_PROGRESS','NO_SHOW'].includes(status)) continue;
    const host = pick(hostMap[v.office_id] || []);
    if (!host) continue;
    const decided = new Date(new Date(v.scheduled_start).getTime() - rnd(5, 120) * 60000);
    approvalValues.push(`(${v.id}, ${host.user_id}, 'APPROVED', ${sequelize.escape(decided.toISOString())}, ${sequelize.escape(decided.toISOString())})`);
  }

  if (!approvalValues.length) return;
  const chunks = [];
  while (approvalValues.length) chunks.push(approvalValues.splice(0, 500));
  for (const chunk of chunks) {
    await sequelize.query(
      `INSERT INTO approvals (visit_id, approver_id, status, created_at, updated_at) VALUES ${chunk.join(',')}`,
      { type: sequelize.QueryTypes.INSERT }
    );
  }
}

async function notifyAdmins(visitRows, adminUserIds) {
  const notifs = [];
  const logs = [];
  
  for (const v of visitRows) {
    logs.push({
      event_type: 'VISIT_CREATED',
      entity_type: 'Visit',
      entity_id: v.id,
      office_id: v.office_id,
      timestamp: new Date(v.scheduled_start),
      metadata: { status: v.status, reference_number: v.reference_number }
    });

    if (v.status === 'COMPLETED' || v.status === 'CHECKED_IN') {
      logs.push({
        event_type: 'GUEST_CHECKED_IN',
        entity_type: 'Visit',
        entity_id: v.id,
        office_id: v.office_id,
        timestamp: v.checked_in_at || new Date(v.scheduled_start),
        metadata: { method: 'QR_SCAN' }
      });
      
      // Notify all admins of activity
      for (const adminId of adminUserIds) {
        notifs.push({
          user_id: adminId,
          title: 'Guest Arrival',
          message: `A guest has checked in for visit #${v.id}`,
          type: 'INFO',
          created_at: v.checked_in_at || new Date()
        });
      }
    }

    // Stochastic security events
    if (chance(0.05)) {
      logs.push({
        event_type: 'UNAUTHORIZED_ENTRY_DETECTED',
        entity_type: 'Security',
        entity_id: null,
        office_id: v.office_id,
        timestamp: new Date(new Date(v.scheduled_start).getTime() + rnd(1, 10) * 60000),
        metadata: { alert_level: 'HIGH', detail: 'Tailgating detected at south gate' }
      });
    }
  }

  await Promise.all([
    insertAuditLogsBatch(logs),
    insertNotificationsBatch(notifs)
  ]);
}

/* ---------- History Seeder ---------- */
async function seedHistory(infra, guests) {
  console.log(`[sim] Seeding history: ${HISTORY_DAYS} days, ~${TARGET_VISITS} visits target...`);

  const { offices, byOffice, guestIds, vipIds } = { ...infra, ...guests };
  const now = new Date();
  const start = new Date();
  start.setDate(start.getDate() - HISTORY_DAYS);
  start.setHours(0, 0, 0, 0);

  const seqTracker = new DailySeq();
  const guestFreq = new Map(); // some guests are regulars
  for (const gid of guestIds) guestFreq.set(gid, Math.random() ** 2); // power bias toward frequent visitors

  let totalCreated = 0;
  let dayCursor = new Date(start);
  const batchSize = 400;
  let batch = [];
  let allInsertedRows = [];

  while (dayCursor <= now && totalCreated < TARGET_VISITS) {
    const weekend = isWeekend(dayCursor);
    const dayVisits = weekend ? rnd(10, 30) : rnd(60, 180);

    for (let i = 0; i < dayVisits && totalCreated < TARGET_VISITS; i++) {
      // weighted guest pick
      const guestId = pickWeighted(guestIds, guestIds.map(g => guestFreq.get(g)));
      const isVip = vipIds.has(guestId);

      // office, dept, service, host
      const office = pick(offices);
      const officeHosts = byOffice.hosts[office.id] || [];
      const officeDepts = byOffice.depts[office.id] || [];
      const officeSvcs = byOffice.svcs[office.id] || [];
      if (!officeHosts.length || !officeDepts.length) continue;

      const host = pick(officeHosts);
      const dept = pick(officeDepts);
      const svc = officeSvcs.length ? pick(officeSvcs.filter(s => Number(s.department_id) === Number(dept.id))) : null;
      const svcId = svc ? svc.id : null;
      const duration = svc && svc.duration_minutes ? Number(svc.duration_minutes) + rnd(-5, 10) : rnd(20, 90);

      // schedule
      const scheduledStart = new Date(dayCursor);
      const mins = businessHourMinutes();
      scheduledStart.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
      let scheduledEnd = addMinutes(scheduledStart, Math.max(15, duration));

      // Real-life scenario: stochastic extension of meetings
      const extensionProb = rnd(5, 20) / 100; // dynamic probability between 5% and 20%
      let isExtended = false;
      if (chance(extensionProb)) {
        const extensionMins = rnd(15, 90); // random extension between 15m and 1.5h
        scheduledEnd = addMinutes(scheduledEnd, extensionMins);
        isExtended = true;
      }


      // status logic
      const hoursFromNow = (now - scheduledStart) / 36e5;
      let status;
      if (hoursFromNow > 24) status = chooseStatusForPastVisit();
      else if (hoursFromNow >= -2) status = chooseStatusForRecentVisit();
      else status = chooseStatusForFutureVisit();

      // timestamps & flags
      let checkedInAt = null;
      let checkedOutAt = null;
      let rating = null;
      let ratingComment = null;
      let escalated = false;

      if (status === 'COMPLETED') {
        checkedInAt = addMinutes(scheduledStart, rnd(0, 8));
        checkedOutAt = addMinutes(scheduledEnd, rnd(-3, 12));
        rating = pickWeighted([1,2,3,4,5], [2,3,8,30,57]);
        if (rating <= 2) ratingComment = pick(BAD_COMMENTS);
        else if (rating === 5 && chance(0.4)) ratingComment = pick(GOOD_COMMENTS);
      } else if (status === 'CHECKED_IN') {
        checkedInAt = addMinutes(scheduledStart, rnd(0, 5));
      } else if (status === 'IN_PROGRESS') {
        checkedInAt = addMinutes(scheduledStart, rnd(0, 5));
      } else if (status === 'ESCALATED') {
        escalated = true;
        // many escalated visits ultimately resolved to completed
        if (hoursFromNow > 2 && chance(0.7)) {
          status = 'COMPLETED'; // resolved escalation
          checkedInAt = addMinutes(scheduledStart, rnd(5, 20));
          checkedOutAt = addMinutes(scheduledEnd, rnd(10, 30));
          rating = pickWeighted([1,2,3,4,5], [3,5,12,35,45]);
          if (rating <= 3) ratingComment = pick(BAD_COMMENTS);
          escalated = false; // resolved
        }
      }

      const createdAt = addMinutes(scheduledStart, -rnd(10, 1440)); // booked 10 min to 1 day before

      // reference number
      const seq = seqTracker.next(office.id, scheduledStart);
      const ref = `${officeCode(office.name)}-${dateStr(scheduledStart)}-${String(seq).padStart(3, '0')}`;

      batch.push({
        guest_id: guestId,
        office_id: office.id,
        department_id: dept.id,
        service_id: svcId,
        assigned_host_id: host.id,
        purpose: pick(PURPOSES),
        status,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        checked_in_at: checkedInAt,
        checked_out_at: checkedOutAt,
        qr_code: randomUUID(),
        escalated_to_reception: escalated,
        is_vip: isVip,
        rating,
        rating_comment: ratingComment,
        daily_sequence: seq,
        reference_number: ref,
        created_at: createdAt
      });

      if (batch.length >= batchSize) {
        const rows = await insertVisitsBatch(batch);
        allInsertedRows.push(...rows);
        batch = [];
      }
      totalCreated++;
    }

    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  if (batch.length) {
    const rows = await insertVisitsBatch(batch);
    allInsertedRows.push(...rows);
  }

  try {
    await backfillApprovals(allInsertedRows, byOffice.hosts, now);
    await backfillCredentials(allInsertedRows, now);
    
    // Find admin users to notify
    const [admins] = await sequelize.query(`
      SELECT ur.user_id FROM user_roles ur 
      JOIN roles r ON ur.role_id = r.id 
      WHERE r.name IN ('admin', 'super_admin')
    `);
    const adminIds = admins.map(a => a.user_id);
    await notifyAdmins(allInsertedRows, adminIds);
    
    console.log(`[sim] ✔ History seeding completed: ${allInsertedRows.length} visits.`);
  } catch (e) {
    console.error(e);
  }
  return totalCreated;
}

/* ---------- Live Turbo Mode ---------- */
async function runLiveTurbo(infra, guests) {
  console.log(`[sim] LIVE TURBO starting (scale=${TIME_SCALE}s/real-sec, duration=${LIVE_DURATION_HOURS}h real time)`);

  const { offices, byOffice, guestIds, vipIds } = { ...infra, ...guests };
  const hostMap = {};
  for (const h of infra.hosts) { (hostMap[h.office_id] = hostMap[h.office_id] || []).push(h); }

  let simTime = new Date();
  const endReal = Date.now() + LIVE_DURATION_HOURS * 3600 * 1000;
  const seqTracker = new DailySeq();

  let tickCount = 0;
  let visitsCreated = 0;
  let transitionsDone = 0;
  let running = false;

  async function tick() {
    if (Date.now() >= endReal) {
      console.log(`[sim] Live turbo complete. Created ${visitsCreated} visits, ${transitionsDone} transitions.`);
      await sequelize.close();
      process.exit(0);
      return;
    }
    if (running) return;
    running = true;

    try {
      const prevSim = new Date(simTime);
      simTime = new Date(simTime.getTime() + TIME_SCALE * 1000);
      tickCount++;

      const probs = getProbabilities(simTime);

      // 1) Generate new visits for elapsed window
      const elapsedHours = (simTime - prevSim) / 36e5;
      const baseNew = rnd(1, 4) * elapsedHours;
      const nNew = Math.max(0, Math.round(baseNew * probs.VISIT_VOLUME_MULTIPLIER));
      const newBatch = [];

      for (let i = 0; i < nNew; i++) {
        const guestId = pick(guestIds);
        const office = pick(offices);
        const officeHosts = byOffice.hosts[office.id] || [];
        const officeDepts = byOffice.depts[office.id] || [];
        const officeSvcs = byOffice.svcs[office.id] || [];
        if (!officeHosts.length || !officeDepts.length) continue;

        const host = pick(officeHosts);
        const dept = pick(officeDepts);
        const svc = officeSvcs.length ? pick(officeSvcs.filter(s => Number(s.department_id) === Number(dept.id))) : null;
        const duration = svc && svc.duration_minutes ? Number(svc.duration_minutes) : rnd(20, 60);

        const scheduledStart = new Date(simTime);
        const offsetMinutes = rnd(-5, 15);
        scheduledStart.setMinutes(scheduledStart.getMinutes() + offsetMinutes);
        
        const scheduledEnd = new Date(scheduledStart.getTime() + Math.max(30, duration) * 60 * 1000);

        const seq = seqTracker.next(office.id, scheduledStart);
        const ref = `${officeCode(office.name)}-${dateStr(scheduledStart)}-${String(seq).padStart(3, '0')}`;

        newBatch.push({
          guest_id: guestId,
          office_id: office.id,
          department_id: dept.id,
          service_id: svc ? svc.id : null,
          assigned_host_id: host.id,
          purpose: pick(PURPOSES),
          status: 'PENDING',
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          checked_in_at: null,
          checked_out_at: null,
          qr_code: randomUUID(),
          escalated_to_reception: false,
          is_vip: vipIds.has(guestId),
          rating: null,
          rating_comment: null,
          daily_sequence: seq,
          reference_number: ref,
          created_at: simTime
        });
      }

      let rows = [];
      if (newBatch.length) {
        rows = await insertVisitsBatch(newBatch);
        visitsCreated += rows.length;
      }

      // auto-approve
      for (const v of rows) {
        if (stochastic(probs.AUTO_APPROVE)) {
          await sequelize.query(
            `UPDATE visits SET status = 'APPROVED', updated_at = NOW() WHERE id = :id`,
            { replacements: { id: Number(v.id) }, type: sequelize.QueryTypes.UPDATE }
          );
          const host = pick(hostMap[v.office_id] || []);
          if (host) {
            await sequelize.query(
              `INSERT INTO approvals (visit_id, approver_id, status, created_at, updated_at)
               VALUES (:vid, :uid, 'APPROVED', NOW(), NOW())`,
              { replacements: { vid: Number(v.id), uid: host.user_id } }
            );
            try {
              EventBus.emitEvent({
                type: 'VISIT.APPROVED',
                metadata: {
                  entity_id: v.id,
                  office_id: v.office_id,
                  actor_id: host.user_id,
                  timestamp: new Date(),
                  after: { id: v.id, status: 'APPROVED' },
                },
              });
            } catch (e) {}
          }
          transitionsDone++;
        }
      }

      // 2) Transition APPROVED -> CHECKED_IN
      const [dueApproved] = await sequelize.query(
        `SELECT id, office_id, scheduled_start, scheduled_end, guest_id, qr_code
         FROM visits
         WHERE status = 'APPROVED' AND scheduled_start <= :now
         LIMIT 20`,
        { replacements: { now: simTime.toISOString() } }
      );
      for (const v of dueApproved) {
        let next = 'CHECKED_IN';
        if (stochastic(probs.NO_SHOW)) {
          next = 'NO_SHOW';
        } else if (chance(0.08)) { 
          next = 'CANCELLED';
        }

        let isManualOverride = false;
        if (next === 'CHECKED_IN' && stochastic(probs.MANUAL_CHECKIN_OVERRIDE)) {
          isManualOverride = true;
        }

        const checkedInAt = (next === 'CHECKED_IN') ? new Date(v.scheduled_start) : null;

        await sequelize.query(
          `UPDATE visits SET status = :st, checked_in_at = :ci, updated_at = NOW() WHERE id = :id`,
          { replacements: { st: next, ci: checkedInAt || null, id: v.id }, type: sequelize.QueryTypes.UPDATE }
        );

        if (next === 'CHECKED_IN') {
          const validUntil = new Date(v.scheduled_end);
          validUntil.setHours(validUntil.getHours() + 2); 
          
          await sequelize.query(
            `INSERT INTO access_credentials (visit_id, credential_type, provider, status, external_identity_id, external_credential_id, metadata, valid_from, valid_until, created_at, updated_at)
             VALUES (:vid, 'QR', 'INTERNAL', 'ACTIVE', :eid, :ecid, :meta, NOW(), :expiry, NOW(), NOW())`,
            { 
              replacements: { 
                vid: v.id, 
                eid: `sim-id-${v.guest_id}`, 
                ecid: `sim-cred-${v.id}`, 
                meta: JSON.stringify({ qr_code: v.qr_code, is_sim: true, manual_override: isManualOverride }),
                expiry: validUntil.toISOString()
              }
            }
          );

          const host = pick(hostMap[v.office_id] || []);
          const receptionistId = host ? host.user_id : 1; 
          
          await sequelize.query(
            `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, created_at)
             VALUES (:actor, :action, 'Visit', :vid, :meta, NOW())`,
            {
              replacements: {
                actor: receptionistId,
                action: isManualOverride ? 'CHECKIN_MANUAL_OVERRIDE' : 'CHECKIN_PERFORMED',
                vid: v.id,
                meta: JSON.stringify({ 
                  method: isManualOverride ? 'MANUAL_OVERRIDE' : 'QR_SCAN',
                  notes: isManualOverride ? 'Visitor QR failed to scan. Receptionist performed manual override after ID verification.' : 'Automatic entry via QR scan.'
                })
              }
            }
          );
        }

        try {
          EventBus.emitEvent({
            type: next === 'CHECKED_IN' ? 'VISIT.CHECKED_IN' : (next === 'CANCELLED' ? 'VISIT.CANCELLED' : 'VISIT.NO_SHOW'),
            metadata: {
              entity_id: v.id,
              office_id: v.office_id,
              timestamp: new Date(),
              after: { id: v.id, status: next },
            },
          });
        } catch (e) {}
        
        transitionsDone++;
      }

      // 3) Handle ESCALATIONS
      const [dueEscalate] = await sequelize.query(
        `SELECT id, office_id FROM visits WHERE status = 'PENDING' AND random() < 0.05 LIMIT 5`
      );
      for (const v of dueEscalate) {
         await sequelize.query(
          `UPDATE visits SET status = 'ESCALATED', escalated_to_reception = TRUE, escalated_at = NOW(), escalation_reason = 'Simulated arrival conflict or missing host signal.' WHERE id = :id`,
          { replacements: { id: v.id } }
        );
        transitionsDone++;
      }

      // 4) Transition -> IN_PROGRESS
      const [dueInProgress] = await sequelize.query(
        `SELECT id, office_id, checked_in_at FROM visits 
         WHERE status = 'CHECKED_IN' AND checked_in_at <= :nowWindow LIMIT 10`,
        { replacements: { nowWindow: new Date(simTime.getTime() - 2 * 60000).toISOString() } }
      );
      for (const v of dueInProgress) {
        await sequelize.query(
          `UPDATE visits SET status = 'IN_PROGRESS', updated_at = NOW() WHERE id = :id`,
          { replacements: { id: v.id }, type: sequelize.QueryTypes.UPDATE }
        );
        try {
          EventBus.emitEvent({
            type: 'VISIT.IN_PROGRESS',
            metadata: {
              entity_id: v.id,
              office_id: v.office_id,
              timestamp: new Date(),
              after: { id: v.id, status: 'IN_PROGRESS' },
            },
          });
        } catch (e) {}
        transitionsDone++;
      }

      // 5) Random Extensions & Conflict Generation
      const [dueExtension] = await sequelize.query(
        `SELECT id, office_id, scheduled_end, assigned_host_id FROM visits 
         WHERE status = 'IN_PROGRESS' AND scheduled_end <= :now 
         AND scheduled_end > :nowMinusHour LIMIT 5`,
        { 
          replacements: { 
            now: simTime.toISOString(), 
            nowMinusHour: new Date(simTime.getTime() - 3600000).toISOString() 
          } 
        }
      );
      for (const v of dueExtension) {
        if (stochastic(probs.EXTENSION)) {
          const extensionMinutes = stochastic(0.2) ? 60 : 30; // 20% chance of a long extension
          const newEnd = new Date(new Date(v.scheduled_end).getTime() + extensionMinutes * 60000);
          
          await sequelize.query(
            `UPDATE visits SET scheduled_end = :end, updated_at = NOW() WHERE id = :id`,
            { replacements: { end: newEnd.toISOString(), id: v.id }, type: sequelize.QueryTypes.UPDATE }
          );
          await sequelize.query(
            `UPDATE access_credentials SET valid_until = :end, updated_at = NOW() WHERE visit_id = :id AND status = 'ACTIVE'`,
            { replacements: { end: newEnd.toISOString(), id: v.id } }
          );

          // Check for future visits that this extension just blocked
          const [conflicts] = await sequelize.query(
            `SELECT id FROM visits WHERE assigned_host_id = :hid AND status = 'APPROVED' AND scheduled_start < :end AND id != :id`,
            { replacements: { hid: v.assigned_host_id, end: newEnd.toISOString(), id: v.id } }
          );

          if (conflicts.length > 0) {
            console.log(`[sim] Extension for visit #${v.id} created conflict with ${conflicts.length} future visits.`);
            // Escalation logic is handled by the repository/dashboard query now, 
            // but we can also manually escalate one to test the 'Reception Action' flow
            await sequelize.query(
              `UPDATE visits SET status = 'ESCALATED', escalated_to_reception = true, escalation_reason = 'Host still in previous meeting (Overdue Extension)' WHERE id = :id`,
              { replacements: { id: conflicts[0].id } }
            );
          }
        }
      }

      // 5.1) Physical Anomaly: Tailgate Entry (Door found open)
      // Represented by guests who should have arrived but never scanned.
      if (stochastic(0.02)) { // 2% chance of a tailgate entry
        const [tailgater] = await sequelize.query(
          `SELECT id, office_id, guest_id FROM visits WHERE status = 'APPROVED' AND scheduled_start <= :now LIMIT 1`,
          { replacements: { now: simTime.toISOString() } }
        );
        if (tailgater.length) {
          const v = tailgater[0];
          // We don't CHECK_IN via the engine (to simulate no scan), 
          // but we emit a system-level "Door Activity" event and a "Missing Scan" audit
          await sequelize.query(
            `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, created_at)
             VALUES (1, 'UNAUTHORIZED_ENTRY_DETECTED', 'Visit', :vid, :meta, NOW())`,
            {
              replacements: {
                vid: v.id,
                meta: JSON.stringify({ 
                  issue: 'Door opened by previous guest; current guest entered without scanning.',
                  security_alert: true 
                })
              }
            }
          );
          try {
            EventBus.emitEvent({
              type: 'SECURITY.TAILGATE_DETECTED',
              metadata: {
                visit_id: v.id,
                office_id: v.office_id,
                timestamp: new Date(),
                message: 'Possible unauthorized entry: Guest entered while door was already open.'
              }
            });
          } catch (e) {}
        }
      }

      // 6) Completion
      const [dueComplete] = await sequelize.query(
        `SELECT id, office_id, scheduled_end FROM visits 
         WHERE status = 'IN_PROGRESS' AND scheduled_end <= :now LIMIT 10`,
        { replacements: { now: simTime.toISOString() } }
      );
      for (const v of dueComplete) {
        const next = stochastic(0.08) ? 'CANCELLED' : 'COMPLETED';
        await sequelize.query(
          `UPDATE visits SET status = :st, checked_out_at = :co, updated_at = NOW() WHERE id = :id`,
          { replacements: { st: next, co: next === 'COMPLETED' ? v.scheduled_end : null, id: v.id }, type: sequelize.QueryTypes.UPDATE }
        );
        await sequelize.query(
          `UPDATE access_credentials SET status = 'REVOKED', updated_at = NOW() 
           WHERE visit_id = :vid AND status = 'ACTIVE'`,
          { replacements: { vid: v.id }, type: sequelize.QueryTypes.UPDATE }
        );

        try {
          EventBus.emitEvent({
            type: next === 'COMPLETED' ? 'VISIT.COMPLETED' : 'VISIT.CANCELLED',
            metadata: {
              entity_id: v.id, office_id: v.office_id, timestamp: new Date(), after: { id: v.id, status: next },
            },
          });
        } catch (e) {}

        if (next === 'COMPLETED' && chance(0.4)) {
          const r = pickWeighted([1,2,3,4,5], [1,2,5,25,67]);
          const rc = r <= 3 ? pick(BAD_COMMENTS) : (r === 5 && chance(0.5) ? pick(GOOD_COMMENTS) : null);
          await sequelize.query(
            `UPDATE visits SET rating = :r, rating_comment = :rc WHERE id = :id`,
            { replacements: { r, rc, id: v.id }, type: sequelize.QueryTypes.UPDATE }
          );
        }
        transitionsDone++;
      }

      // 7) Print pulse
      if (tickCount % 10 === 0) {
        const [[stats]] = await sequelize.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
            COUNT(*) FILTER (WHERE status = 'APPROVED') as approved,
            COUNT(*) FILTER (WHERE status = 'CHECKED_IN') as checked_in,
            COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as in_progress,
            COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
            COUNT(*) FILTER (WHERE status = 'ESCALATED') as escalated,
            COUNT(*) as total
          FROM visits
          WHERE created_at > NOW() - INTERVAL '7 days'
        `);
        console.log(`[sim] tick=${tickCount} sim=${simTime.toISOString()} new=${visitsCreated} transitions=${transitionsDone} | P:${stats.pending} A:${stats.approved} C-in:${stats.checked_in} IP:${stats.in_progress} Done:${stats.completed} Esc:${stats.escalated} Tot:${stats.total}`);
      }
    } catch (err) {
      console.error('[sim] Live tick error:', err.message);
    } finally {
      running = false;
      setTimeout(tick, TICK_MS);
    }
  }

  setTimeout(tick, TICK_MS);
}

/* ---------- Cleanup ---------- */
async function cleanupSimulationData() {
  console.log('[sim] Cleaning up previously simulated data...');
  const sq = sequelize;
  // delete simulated visits by guest email pattern
  await sq.query(`
    DELETE FROM approvals WHERE visit_id IN (
      SELECT id FROM visits WHERE guest_id IN (
        SELECT id FROM users WHERE email LIKE '%@simguest.et'
      )
    )
  `);
  await sq.query(`
    DELETE FROM visits WHERE guest_id IN (
      SELECT id FROM users WHERE email LIKE '%@simguest.et'
    )
  `);
  await sq.query(`DELETE FROM guest_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@simguest.et')`);
  await sq.query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@simguest.et')`);
  await sq.query(`DELETE FROM users WHERE email LIKE '%@simguest.et'`);
  console.log('[sim] Cleanup complete.');
}

/* ---------- Main ---------- */
async function main() {
  await sequelize.authenticate();
  console.log('[sim] DB connected');

  if (String(process.env.SIMULATION_CLEANUP).toLowerCase() === 'true') {
    await cleanupSimulationData();
    console.log('[sim] Cleanup complete. Exiting.');
    await sequelize.close();
    process.exit(0);
  }

  const infra = await loadInfrastructure();
  const guests = await generateGuests(infra.guestRoleId, GUEST_POOL);

  await seedHostAvailability(infra);
  await seedHistory(infra, guests);

  if (LIVE_MODE) {
    await runLiveTurbo(infra, guests);
  } else {
    console.log('[sim] Seeding complete. Refresh your dashboard to see the data.');
    await sequelize.close();
    process.exit(0);
  }
}

main().catch(async (err) => {
  console.error('[sim] Fatal error:', err);
  await sequelize.close();
  process.exit(1);
});

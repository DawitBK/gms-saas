#!/usr/bin/env node
'use strict';

/**
 * GMS Enterprise – Demo Data Seeder
 * ===================================
 * Populates the DB with realistic, evenly distributed demo data:
 *   - 4 offices
 *   - 3 departments per office (12 total)
 *   - 2 services per department (24 total)
 *   - 3 staff users per office: 1 admin, 1 reception, 1 host (12 total)
 *   - 20 guests
 *   - 40 visits evenly distributed across offices
 *
 * This script uses Sequelize models directly — NO running server needed.
 * Run AFTER: npm run db:prepare-fresh && npm run seed:passwords
 *
 * Usage:
 *   node scripts/seed-demo-data.js
 */

const path = require('path');
const dotenv = require('dotenv');

const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '.env.development'), override: true });

// Set NODE_ENV before requiring models
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const bcrypt = require('bcryptjs');

const OFFICES = [
  { name: 'Head Office 6th Floor', address: 'Central District', city: 'Example City', country: 'Exampleland', latitude: 40.7128, longitude: -74.0060 },
  { name: 'Head Office 7th Floor', address: 'Central District', city: 'Example City', country: 'Exampleland', latitude: 40.7128, longitude: -74.0060 },
  { name: 'Ground Floor Reception', address: 'Central District', city: 'Example City', country: 'Exampleland', latitude: 40.7128, longitude: -74.0060 },
  { name: 'Conference & Training Wing', address: 'Central District', city: 'Example City', country: 'Exampleland', latitude: 40.7128, longitude: -74.0060 },
];

const DEPARTMENTS_PER_OFFICE = [
  ['IT & Digital', 'Human Resources', 'Finance & Accounts'],
  ['Operations', 'Procurement', 'Legal & Compliance'],
  ['Customer Relations', 'Security & Safety', 'Facilities Management'],
  ['Training & Development', 'Research & Analytics', 'Executive Affairs'],
];

const SERVICES_PER_DEPT = [
  ['Technical Support Consultation', 'System Access Request'],
  ['HR Advisory', 'Recruitment Interview'],
  ['Accounts Payable', 'Budget Review Meeting'],
  ['Operations Planning', 'Logistics Coordination'],
  ['Procurement Inquiry', 'Vendor Meeting'],
  ['Legal Advisory', 'Contract Review'],
  ['Customer Complaint', 'Service Request'],
  ['Security Clearance', 'Incident Reporting'],
  ['Facilities Request', 'Maintenance Walkthrough'],
  ['Training Enrollment', 'Workshop Attendance'],
  ['Data Analysis Briefing', 'Research Presentation'],
  ['Executive Briefing', 'Board Preparation'],
];

const STAFF = (officeIdx) => [
  {
    full_name: `Admin User O${officeIdx + 1}`,
    email: `admin.o${officeIdx + 1}@examplecorp.com`,
    role: 'admin',
    suffix: `admin${officeIdx + 1}`,
  },
  {
    full_name: `Reception O${officeIdx + 1}`,
    email: `reception.o${officeIdx + 1}@examplecorp.com`,
    role: 'reception',
    suffix: `recv${officeIdx + 1}`,
  },
  {
    full_name: `Host Officer O${officeIdx + 1}`,
    email: `host.o${officeIdx + 1}@examplecorp.com`,
    role: 'host',
    suffix: `host${officeIdx + 1}`,
  },
];

const GUEST_NAMES = [
  ['Abebe', 'Kebede'], ['Tigist', 'Alemu'], ['Daniel', 'Haile'], ['Selamawit', 'Tesfaye'],
  ['Yohannes', 'Girma'], ['Hiwot', 'Mengesha'], ['Bereket', 'Tadesse'], ['Marta', 'Worku'],
  ['Solomon', 'Bekele'], ['Eyob', 'Getachew'], ['Rahel', 'Assefa'], ['Tewodros', 'Asfaw'],
  ['Bezawit', 'Demissie'], ['Henok', 'Fekadu'], ['Almaz', 'Shiferaw'], ['Mikias', 'Negash'],
  ['Sara', 'Tilahun'], ['Kaleb', 'Zeleke'], ['Eden', 'Tsegay'], ['Natnael', 'Hailu'],
];

const VISIT_STATUSES = ['PENDING', 'APPROVED', 'CHECKED_IN', 'CHECKED_OUT', 'DECLINED', 'CANCELLED', 'NO_SHOW'];

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

function futureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(randomBetween(8, 16), randomBetween(0, 3) * 15, 0, 0);
  return d;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║        GMS Enterprise — Demo Data Seeder         ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Initialize Sequelize
  const { sequelize } = require('../src/infrastructure/database/connection');
  const models = require('../src/infrastructure/database/models');
  const { Office, Department, Service, User, Role, UserRole, HostProfile, Guest, Visit } = models;

  await sequelize.authenticate();
  console.log('[demo] ✔ DB connected.\n');

  const now = new Date();
  const passwordHash = await bcrypt.hash('GMSAdmin@2026', 10);

  // ── Step 1: Offices ──────────────────────────────────────────
  console.log('[demo] Creating offices...');
  const officeRecords = [];
  for (const officeData of OFFICES) {
    const [office] = await Office.findOrCreate({
      where: { name: officeData.name },
      defaults: { ...officeData, active: true },
    });
    officeRecords.push(office);
    console.log(`  ✔ ${office.name}`);
  }

  // ── Step 2: Departments ──────────────────────────────────────
  console.log('\n[demo] Creating departments...');
  const deptRecords = [];
  for (let oi = 0; oi < officeRecords.length; oi++) {
    const office = officeRecords[oi];
    const deptNames = DEPARTMENTS_PER_OFFICE[oi];
    for (const deptName of deptNames) {
      const [dept] = await Department.findOrCreate({
        where: { name: deptName, office_id: office.id },
        defaults: { name: deptName, office_id: office.id },
      });
      deptRecords.push({ dept, officeId: office.id, officeIdx: oi });
      console.log(`  ✔ ${office.name} → ${deptName}`);
    }
  }

  // ── Step 3: Services ─────────────────────────────────────────
  console.log('\n[demo] Creating services...');
  const serviceRecords = [];
  for (let di = 0; di < deptRecords.length; di++) {
    const { dept, officeId } = deptRecords[di];
    const svcNames = SERVICES_PER_DEPT[di] || [`Service A – ${dept.name}`, `Service B – ${dept.name}`];
    for (const svcName of svcNames) {
      const [svc] = await Service.findOrCreate({
        where: { name: svcName, department_id: dept.id },
        defaults: { name: svcName, department_id: dept.id, office_id: officeId, duration_minutes: randomBetween(20, 60) },
      });
      serviceRecords.push({ svc, deptId: dept.id, officeId });
    }
    console.log(`  ✔ ${dept.name}: ${svcNames.join(', ')}`);
  }

  // ── Step 4: Roles ─────────────────────────────────────────────
  const roleNameMap = {};
  const roles = await Role.findAll();
  for (const r of roles) {
    roleNameMap[r.name] = r.id;
  }

  // ── Step 5: Staff Users ───────────────────────────────────────
  console.log('\n[demo] Creating staff users...');
  const hostProfileIds = [];
  for (let oi = 0; oi < officeRecords.length; oi++) {
    const office = officeRecords[oi];
    const staffList = STAFF(oi);
    for (const staffData of staffList) {
      const [user, created] = await User.findOrCreate({
        where: { email: staffData.email },
        defaults: {
          full_name: staffData.full_name,
          email: staffData.email,
          password_hash: passwordHash,
          status: 'ACTIVE',
          office_id: office.id,
          created_at: now,
          updated_at: now,
        },
      });

      const roleId = roleNameMap[staffData.role];
      if (roleId) {
        await UserRole.findOrCreate({
          where: { user_id: user.id, role_id: roleId },
          defaults: { user_id: user.id, role_id: roleId, created_at: now, updated_at: now },
        });
      }

      if (staffData.role === 'host') {
        const [hp] = await HostProfile.findOrCreate({
          where: { user_id: user.id },
          defaults: {
            user_id: user.id,
            office_id: office.id,
            availability_status: 'AVAILABLE',
            created_at: now,
            updated_at: now,
          },
        });

        // Assign services in this office to the host
        const officeServices = serviceRecords.filter((s) => s.officeId === office.id);
        for (const { svc } of officeServices) {
          try {
            await svc.addHost(hp).catch(() => {});
          } catch {}
        }
        hostProfileIds.push({ hp, officeId: office.id });
      }

      console.log(`  ${created ? '✔' : '~'} ${staffData.full_name} (${staffData.role}) @ ${office.name}`);
    }
  }

  // ── Step 6: Guests ────────────────────────────────────────────
  console.log('\n[demo] Creating guests...');
  const guestRecords = [];
  for (let gi = 0; gi < GUEST_NAMES.length; gi++) {
    const [firstName, lastName] = GUEST_NAMES[gi];
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${gi}@example.com`;
    const phone = `+15559${String(10000000 + gi).padStart(8, '0')}`;

    const [guest, created] = await Guest.findOrCreate({
      where: { email },
      defaults: {
        full_name: `${firstName} ${lastName}`,
        email,
        phone,
        company: randomFrom(['Ethio Telecom', 'CBE', 'Examplelandn Airlines', 'Safaricom ET', 'Awash Bank', null]),
        created_at: pastDate(randomBetween(10, 90)),
        updated_at: now,
      },
    });
    guestRecords.push(guest);
    console.log(`  ${created ? '✔' : '~'} ${guest.full_name}`);
  }

  // ── Step 7: Visits ────────────────────────────────────────────
  console.log('\n[demo] Creating visits...');
  let visitCount = 0;
  const targetVisits = 40;

  // Load host profiles with their users
  const allHostProfiles = await HostProfile.findAll({ include: [{ model: User, as: 'user' }] });

  for (let vi = 0; vi < targetVisits; vi++) {
    const guest = guestRecords[vi % guestRecords.length];
    const office = officeRecords[vi % officeRecords.length];
    const officeService = serviceRecords.filter((s) => s.officeId === office.id);
    if (!officeService.length) continue;

    const { svc, deptId } = randomFrom(officeService);
    const officeHosts = allHostProfiles.filter((hp) => hp.office_id === office.id);
    const assignedHost = officeHosts.length ? randomFrom(officeHosts) : null;

    // Mix of past and future visits
    const isPast = vi < 25;
    const scheduledStart = isPast ? pastDate(randomBetween(1, 30)) : futureDate(randomBetween(1, 14));
    const scheduledEnd = new Date(scheduledStart.getTime() + (svc.duration_minutes || 30) * 60000);

    // Pick a realistic status based on whether the visit is past/future
    let status;
    if (!isPast) {
      status = randomFrom(['PENDING', 'PENDING', 'APPROVED']);
    } else {
      status = randomFrom(['CHECKED_OUT', 'CHECKED_OUT', 'CHECKED_IN', 'NO_SHOW', 'CANCELLED', 'DECLINED']);
    }

    const checkedInAt = ['CHECKED_IN', 'CHECKED_OUT'].includes(status) ? scheduledStart : null;
    const checkedOutAt = status === 'CHECKED_OUT' ? scheduledEnd : null;

    try {
      const { randomUUID } = require('crypto');
      await Visit.create({
        guest_id: guest.id,
        office_id: office.id,
        department_id: deptId,
        service_id: svc.id,
        assigned_host_id: assignedHost?.id ?? null,
        purpose: `Scheduled meeting for ${svc.name}`,
        status,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        checked_in_at: checkedInAt,
        checked_out_at: checkedOutAt,
        qr_code: randomUUID(),
        escalated_to_reception: status === 'DECLINED',
        created_at: pastDate(randomBetween(1, 90)),
      });
      visitCount++;
    } catch (err) {
      console.error(`  ✗ Visit ${vi + 1}: ${err.message}`);
    }
  }

  console.log(`  ✔ ${visitCount} visits created.`);

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  ✅  Demo data seeded successfully!');
  console.log('');
  console.log('  System accounts:');
  console.log('  master@gms.local         / GMSAdmin@2026  (super_admin)');
  console.log('  admin@gms.local          / GMSAdmin@2026  (super_admin)');
  console.log('  admin.o1@examplecorp.com   / GMSAdmin@2026  (admin, Office 1)');
  console.log('  reception.o1@examplecorp.com / GMSAdmin@2026  (reception, Office 1)');
  console.log('  host.o1@examplecorp.com    / GMSAdmin@2026  (host, Office 1)');
  console.log('  ... (pattern repeats for o2, o3, o4)');
  console.log('');
  console.log('  Data summary:');
  console.log(`    Offices: ${officeRecords.length}`);
  console.log(`    Departments: ${deptRecords.length}`);
  console.log(`    Services: ${serviceRecords.length}`);
  console.log(`    Guests: ${guestRecords.length}`);
  console.log(`    Visits: ${visitCount}`);
  console.log('══════════════════════════════════════════════════════\n');

  await sequelize.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n[demo] ❌ Fatal Error:', err.message || err);
  console.error(err.stack);
  process.exit(1);
});

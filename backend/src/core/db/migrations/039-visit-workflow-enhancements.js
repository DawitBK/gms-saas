'use strict';

/**
 * Migration 039 – Visit Workflow Enhancements
 *
 * Adds:
 *  - NO_SHOW and ESCALATED to the visits.status ENUM
 *  - SLA / grace / guest-decision tracking columns on visits
 *  - Assignment audit columns on visit_assignments
 *
 * Backward-safe: all new columns are nullable with sensible defaults.
 * Existing data is not modified.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ── 1. Extend the visit status ENUM ──────────────────────────────
    // PostgreSQL ENUMs cannot be extended inside a transaction by default,
    // so we add each value individually and swallow "already exists" errors.
    const addEnumValue = async (value) => {
      try {
        await queryInterface.sequelize.query(
          `ALTER TYPE "enum_visits_status" ADD VALUE IF NOT EXISTS '${value}';`
        );
      } catch (_) {
        // value already exists — safe to ignore
      }
    };

    await addEnumValue('NO_SHOW');
    await addEnumValue('ESCALATED');

    // ── 2. New columns on visits ─────────────────────────────────────
    const visitColumns = {
      sla_deadline_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
        comment: 'Deadline for assigned host to respond (working-hours aware)',
      },
      grace_deadline_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
        comment: 'Check-in grace window end (scheduled_start + grace period)',
      },
      guest_decision_status: {
        type: Sequelize.STRING(20),
        allowNull: true,
        defaultValue: null,
        comment: 'PENDING_GUEST | ACCEPTED | DECLINED — tracks guest response to reschedule/reassign',
      },
      guest_decision_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
        comment: 'When the guest accepted or declined a proposed change',
      },
    };

    for (const [col, def] of Object.entries(visitColumns)) {
      const exists = await queryInterface.sequelize.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'visits' AND column_name = '${col}' LIMIT 1;`
      );
      if (exists[0].length === 0) {
        await queryInterface.addColumn('visits', col, def);
      }
    }

    // ── 3. Enrich visit_assignments ──────────────────────────────────
    const assignmentColumns = {
      assigned_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.fn('NOW'),
        comment: 'When this assignment was made',
      },
      assignment_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: null,
        comment: 'auto_assigned | reassigned | escalation_resolved | manual',
      },
      candidate_hosts: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: null,
        comment: 'Snapshot of candidate hosts considered during assignment',
      },
      load_metrics: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: null,
        comment: 'Snapshot of host load counts at assignment time',
      },
      is_current: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether this is the active assignment (false for historical records)',
      },
    };

    for (const [col, def] of Object.entries(assignmentColumns)) {
      const exists = await queryInterface.sequelize.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'visit_assignments' AND column_name = '${col}' LIMIT 1;`
      );
      if (exists[0].length === 0) {
        await queryInterface.addColumn('visit_assignments', col, def);
      }
    }

    // ── 4. Index for SLA and no-show workers ─────────────────────────
    try {
      await queryInterface.addIndex('visits', ['status', 'sla_deadline_at'], {
        name: 'idx_visits_sla_pending',
        where: { status: 'PENDING' },
      });
    } catch (_) {}

    try {
      await queryInterface.addIndex('visits', ['status', 'grace_deadline_at'], {
        name: 'idx_visits_noshow_approved',
        where: { status: 'APPROVED' },
      });
    } catch (_) {}

    try {
      await queryInterface.addIndex('visit_assignments', ['visit_id', 'is_current'], {
        name: 'idx_visit_assignments_current',
      });
    } catch (_) {}
  },

  async down(queryInterface) {
    // Remove indexes
    try { await queryInterface.removeIndex('visits', 'idx_visits_sla_pending'); } catch (_) {}
    try { await queryInterface.removeIndex('visits', 'idx_visits_noshow_approved'); } catch (_) {}
    try { await queryInterface.removeIndex('visit_assignments', 'idx_visit_assignments_current'); } catch (_) {}

    // Remove visit columns
    const visitCols = ['sla_deadline_at', 'grace_deadline_at', 'guest_decision_status', 'guest_decision_at'];
    for (const col of visitCols) {
      try { await queryInterface.removeColumn('visits', col); } catch (_) {}
    }

    // Remove assignment columns
    const assignCols = ['assigned_at', 'assignment_reason', 'candidate_hosts', 'load_metrics', 'is_current'];
    for (const col of assignCols) {
      try { await queryInterface.removeColumn('visit_assignments', col); } catch (_) {}
    }

    // NOTE: PostgreSQL does not support removing values from an ENUM.
    // NO_SHOW and ESCALATED will remain in the type but cause no harm.
  },
};

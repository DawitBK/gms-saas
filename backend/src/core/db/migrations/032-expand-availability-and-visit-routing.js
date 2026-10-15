'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const recurringAvailability = await queryInterface.describeTable('recurring_availability');

    if (!recurringAvailability.recurrence_type) {
      await queryInterface.addColumn('recurring_availability', 'recurrence_type', {
        type: Sequelize.ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'DATE_OVERRIDE'),
        allowNull: false,
        defaultValue: 'WEEKLY',
      });
    }

    // The initial schema had day_of_week as NOT NULL; allow null for non-weekly rules.
    if (!recurringAvailability.day_of_week) {
      await queryInterface.addColumn('recurring_availability', 'day_of_week', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    } else if (recurringAvailability.day_of_week && recurringAvailability.day_of_week.allowNull === false) {
      await queryInterface.changeColumn('recurring_availability', 'day_of_week', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!recurringAvailability.day_of_month) {
      await queryInterface.addColumn('recurring_availability', 'day_of_month', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!recurringAvailability.specific_date) {
      await queryInterface.addColumn('recurring_availability', 'specific_date', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }

    if (!recurringAvailability.is_available) {
      await queryInterface.addColumn('recurring_availability', 'is_available', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }

    if (!recurringAvailability.label) {
      await queryInterface.addColumn('recurring_availability', 'label', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!recurringAvailability.notes) {
      await queryInterface.addColumn('recurring_availability', 'notes', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    if (!recurringAvailability.created_at) {
      await queryInterface.addColumn('recurring_availability', 'created_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      });
    }

    if (!recurringAvailability.updated_at) {
      await queryInterface.addColumn('recurring_availability', 'updated_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      });
    }

    const timeSlots = await queryInterface.describeTable('time_slots');

    if (!timeSlots.availability_rule_id) {
      await queryInterface.addColumn('time_slots', 'availability_rule_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'recurring_availability', key: 'id' },
        onDelete: 'SET NULL',
      });
    }

    if (!timeSlots.slot_state) {
      await queryInterface.addColumn('time_slots', 'slot_state', {
        type: Sequelize.ENUM('AVAILABLE', 'BOOKED', 'BLOCKED'),
        allowNull: false,
        defaultValue: 'AVAILABLE',
      });
    }

    const visits = await queryInterface.describeTable('visits');

    if (!visits.purpose) {
      await queryInterface.addColumn('visits', 'purpose', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    if (!visits.assigned_host_id) {
      await queryInterface.addColumn('visits', 'assigned_host_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'hosts', key: 'id' },
        onDelete: 'SET NULL',
      });
    }

    if (!visits.escalated_to_reception) {
      await queryInterface.addColumn('visits', 'escalated_to_reception', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!visits.escalated_at) {
      await queryInterface.addColumn('visits', 'escalated_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!visits.escalated_by_id) {
      await queryInterface.addColumn('visits', 'escalated_by_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      });
    }

    if (!visits.escalation_reason) {
      await queryInterface.addColumn('visits', 'escalation_reason', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE visits
      SET assigned_host_id = ts.host_id
      FROM time_slots ts
      WHERE visits.time_slot_id = ts.id
        AND visits.assigned_host_id IS NULL
    `);

    await queryInterface.sequelize.query(`
      UPDATE time_slots
      SET slot_state = CASE
        WHEN is_booked = true THEN CAST('BOOKED' AS "enum_time_slots_slot_state")
        ELSE CAST('AVAILABLE' AS "enum_time_slots_slot_state")
      END
      WHERE slot_state IS NULL OR slot_state = 'AVAILABLE'
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS visits_active_time_slot_booking_idx;
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX visits_active_time_slot_booking_idx
      ON visits (time_slot_id)
      WHERE time_slot_id IS NOT NULL
        AND status NOT IN ('CANCELLED', 'DECLINED', 'COMPLETED', 'EXPIRED', 'RESCHEDULED');
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS visits_active_time_slot_booking_idx;
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX visits_active_time_slot_booking_idx
      ON visits (time_slot_id)
      WHERE time_slot_id IS NOT NULL
        AND status NOT IN ('CANCELLED', 'DECLINED');
    `);
  },
};

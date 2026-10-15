import { AvailabilityService } from '../src/modules/scheduling/availability.service';
import { sequelize } from '../src/infrastructure/database/sequelize';
import { RecurringAvailability } from '../src/infrastructure/database/models';

async function main() {
  console.log('Materializing all availability rules into time slots...');
  await sequelize.authenticate();

  const service = new AvailabilityService();
  const rules = await RecurringAvailability.findAll();

  console.log(`Found ${rules.length} rules. Processing...`);

  let count = 0;
  for (const rule of rules) {
    // Materialize for the next 14 days to be safe
    await (service as any).materializeRuleSlots(rule, 14);
    count++;
    if (count % 10 === 0) {
      console.log(`Processed ${count}/${rules.length} rules...`);
    }
  }

  console.log('Successfully materialized all slots for the next 14 days.');
  await sequelize.close();
}

main().catch(err => {
  console.error('Failed to materialize slots:', err);
  process.exit(1);
});

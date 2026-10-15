import { Transaction } from 'sequelize';
import { sequelize } from '../../infrastructure/database/sequelize';
import { logger } from '../logger/logger';

/**
 * Standardized database transaction wrapper guaranteeing safe rollbacks, 
 * atomic execution, and preventing hanging transactions.
 */
export const withTransaction = async <T>(
  callback: (transaction: Transaction) => Promise<T>,
  existingTransaction?: Transaction
): Promise<T> => {
  if (existingTransaction) {
    return callback(existingTransaction);
  }

  const transaction = await sequelize.transaction();
  try {
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    logger.error({ error }, 'Transaction failed, triggering standardized rollback.');
    await transaction.rollback();
    throw error;
  }
};

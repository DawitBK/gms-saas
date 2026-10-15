import { AuditLog } from '../../infrastructure/database/models/auditLog.model';
import { logger } from '../../core/logger/logger';
import { Transaction } from 'sequelize';
import { getRequestId } from '../../core/utils/requestId';

/**
 * Universal Audit Trail Hook
 * Enforces tracking across system entity mutations with Trace ID correlation.
 */
export const logAudit = async (
  userId: number | null,
  action: string,
  entity: string,
  entityId: string | number,
  before: unknown = null,
  after: unknown = null,
  transaction?: Transaction
): Promise<void> => {
  // Prevent audit noise in test environment
  if (process.env.NODE_ENV === 'test') return;

  try {
    const requestId = getRequestId();

    await AuditLog.create(
      {
        user_id: userId,
        request_id: requestId, // Pervasive Trace ID injection
        action,
        entity,
        entity_id: entityId != null ? entityId.toString() : 'unknown',
        metadata: { before, after },
      },
      { transaction }
    );
    
    logger.debug({ 
      module: 'audit', 
      action, 
      entity, 
      requestId 
    }, 'Audit trace recorded');

  } catch (err) {
    logger.fatal(
      { err, entityId, action },
      'CRITICAL: Audit compliance gap detected. Trace correlation failed.'
    );
    
    // Systemic Fix: In PostgreSQL, if a query fails inside a transaction block, 
    // the ENTIRE transaction becomes poisoned. Swallowing the error here causes 
    // subsequent queries to fail with an ambiguous "current transaction is aborted" error.
    // If a transaction is active, we MUST rethrow to trigger a clean rollback.
    if (transaction) {
      throw err;
    }
  }
};

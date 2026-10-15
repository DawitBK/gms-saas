import { AsyncLocalStorage } from 'async_hooks';

/**
 * Enterprise Continuation Local Storage (CLS)
 * 
 * Provides a way to store and retrieve request-specific context (like Trace IDs)
 * throughout the entire asynchronous call chain without manual prop-drilling.
 */
export interface RequestContext {
  requestId: string;
  userId?: number;
  officeId?: number;
  roles?: string[];
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Retrieves the current Request ID from the storage context.
 */
export const getRequestId = (): string | undefined => {
  return requestContextStorage.getStore()?.requestId;
};


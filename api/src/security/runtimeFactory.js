import { targetConfigFromEnvironment, createManagedExecutor } from './managedTarget.js';

export const createManagedRuntime = ({ env, metadataDriver, driverFactory, authFactory } = {}) => {
  const target = targetConfigFromEnvironment(env);
  if (!driverFactory || !authFactory) throw new Error('managed driver factories are required');
  // Secure URI schemes configure TLS themselves; explicit encryption conflicts with the driver contract.
  const driverConfig = /^neo4j\+s:|^bolt\+s:/.test(target.uri) ? {} : { encrypted: false };
  const targetDriver = driverFactory(target.uri, authFactory(target.user, target.password), driverConfig);
  return Object.freeze({ metadataDriver, targetDriver, executor: createManagedExecutor({ driver: targetDriver, database: target.database, maxConcurrency: Number(env.WORKBENCH_MAX_CONCURRENCY || 2), timeoutMs: Number(env.WORKBENCH_QUERY_TIMEOUT_MS || 30000), maxResultBytes: Number(env.WORKBENCH_MAX_RESULT_BYTES || 16 * 1024 * 1024) }) });
};

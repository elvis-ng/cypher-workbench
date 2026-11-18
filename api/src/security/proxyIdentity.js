import { ManagedTargetError } from './managedTarget.js';

export const trustedProxyIdentity = (headers, configuredOrganization) => {
  if (!configuredOrganization || typeof configuredOrganization !== 'string' || !configuredOrganization.trim()) throw new ManagedTargetError('proxy organization is not configured');
  const email = headers?.['x-elvis-workbench-email'];
  const organization = headers?.['x-elvis-workbench-organization'];
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ManagedTargetError('trusted proxy email is missing or malformed');
  if (organization !== configuredOrganization) throw new ManagedTargetError('trusted proxy organization mismatch');
  return Object.freeze({ email, organization });
};

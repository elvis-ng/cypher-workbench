jest.mock('../persistence/graphql/csrfFetch', () => ({ csrfFetch: jest.fn() }));
import { csrfFetch } from '../persistence/graphql/csrfFetch';
import proxyAuth from './proxyAuth';

test('bootstraps managed session without token or redirect', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ email: 'operator@example.test', organization: 'org', managedTarget: true }) });
  await proxyAuth.bootstrap();
  expect(proxyAuth.isAuthenticated()).toBe(true);
  expect(proxyAuth.getIdToken()).toBeNull();
  expect(global.fetch).toHaveBeenCalledWith('/backoffice/cypher-workbench/session', { credentials: 'same-origin' });
});

test('accepts EULA through CSRF-protected request', async () => {
  csrfFetch.mockResolvedValue({ ok: true, json: async () => ({ accepted: true }) });
  await expect(proxyAuth.acceptEula()).resolves.toEqual({ accepted: true });
  expect(csrfFetch).toHaveBeenCalledWith('/backoffice/cypher-workbench/eula/accept', { method: 'POST' });
});

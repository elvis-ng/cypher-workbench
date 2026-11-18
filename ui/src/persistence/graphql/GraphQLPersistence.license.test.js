jest.mock('../../auth/authUtil', () => ({ getAuthMethod: () => 'proxy' }));

test('proxy license info uses public entitlement endpoint', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ product: 'workbench', version: '1', type: 'Enterprise' }) });
  const { getLicenseInfo } = require('./GraphQLPersistence');
  await expect(getLicenseInfo()).resolves.toEqual({
    success: true,
    licenseInfo: { product: 'workbench', version: '1', type: 'Enterprise' }
  });
  expect(global.fetch).toHaveBeenCalledWith('/backoffice/cypher-workbench/license', { credentials: 'same-origin' });
});

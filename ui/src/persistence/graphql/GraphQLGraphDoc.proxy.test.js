jest.mock('../../auth/authUtil', () => ({ getAuthMethod: () => 'proxy' }));
jest.mock('./GraphQLPersistence', () => ({ getClient: jest.fn(), handleError: jest.fn() }));

test('proxy unsupported mutations fail closed without network calls', () => {
  const { grabLock, updateUserRoles, deleteRemoteGraphDoc } = require('./GraphQLGraphDoc');
  const getClient = require('./GraphQLPersistence').getClient;
  const callbacks = [jest.fn(), jest.fn(), jest.fn()];
  grabLock('doc', callbacks[0]);
  updateUserRoles('doc', true, [], callbacks[1]);
  deleteRemoteGraphDoc('doc', callbacks[2]);
  callbacks.forEach(callback => expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false })));
  expect(getClient).not.toHaveBeenCalled();
});

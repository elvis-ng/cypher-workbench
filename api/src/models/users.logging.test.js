import { createUserSignUp } from './users';
import { runQuery } from '../util/run';

jest.mock('../util/run', () => ({ runQuery: jest.fn() }));
jest.mock('../util/encryption', () => ({ encryptV1: () => 'synthetic-ciphertext' }));
jest.mock('../license/license', () => ({}));
jest.mock('../security/localSessions', () => ({}));
jest.mock('./resultHelper', () => ({ processResult: value => value, getFirstRowValue: () => ({ properties: {} }) }));

test('given signup credentials when user creation runs then never logs credentials or personal data', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  runQuery.mockResolvedValue({});
  try {
    await createUserSignUp({ primaryOrganization: 'synthetic', email: 'person@example.test', password: 'synthetic-password', name: 'Synthetic Name' }, { email: 'admin@example.test' });
    const output = JSON.stringify(log.mock.calls);
    for (const protectedValue of ['synthetic-password', 'person@example.test', 'Synthetic Name', 'admin@example.test']) {
      expect(output).not.toContain(protectedValue);
    }
  } finally { log.mockRestore(); }
});

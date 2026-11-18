import { csrfFetch, resetCsrf } from './csrfFetch';

test('retries CSRF bootstrap after a failed bootstrap', async () => {
  resetCsrf();
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'retry-token', headerName: 'X-XSRF-TOKEN' }) })
    .mockResolvedValueOnce({ ok: true });

  await expect(csrfFetch('/graphql')).rejects.toThrow('CSRF bootstrap failed: 503');
  await expect(csrfFetch('/graphql')).resolves.toEqual({ ok: true });
  expect(global.fetch).toHaveBeenCalledTimes(3);
});

test('bootstraps CSRF and strips authorization on same-origin requests', async () => {
  resetCsrf();
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'encoded-token', headerName: 'X-XSRF-TOKEN' }) })
    .mockResolvedValueOnce({ ok: true });
  await csrfFetch('/backoffice/cypher-workbench/graphql', { method: 'POST', headers: { authorization: 'Bearer forbidden' } });
  const request = global.fetch.mock.calls[1];
  expect(request[0]).toBe('/backoffice/cypher-workbench/graphql');
  expect(request[1].credentials).toBe('same-origin');
  expect(request[1].headers.get('X-XSRF-TOKEN')).toBe('encoded-token');
  expect(request[1].headers.get('authorization')).toBeNull();
});

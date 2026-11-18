import { trustedProxyIdentity } from './proxyIdentity.js';

export const proxySessionHandler = organization => (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  try {
    const identity = trustedProxyIdentity(request.headers, organization);
    return response.json({ ...identity, managedTarget: true });
  } catch {
    return response.status(403).json({ error: 'Workbench administrator session required' });
  }
};

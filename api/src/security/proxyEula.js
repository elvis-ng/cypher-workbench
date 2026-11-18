import { trustedProxyIdentity } from './proxyIdentity.js';

export const createProxyEulaHandlers = ({ organization, metadata, version }) => {
  const handle = operation => async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    let identity;
    try { identity = trustedProxyIdentity(request.headers, organization); }
    catch { return response.status(403).json({ error: 'Workbench administrator session required' }); }
    try {
      if (typeof version !== 'string' || !version) throw new Error('EULA version unavailable');
      const context = { ...identity, headers: request.headers };
      return response.json(await operation(context));
    } catch { return response.status(503).json({ error: 'Workbench EULA unavailable' }); }
  };
  return {
    status: handle(async context => ({ accepted: (await metadata.getEulaAcceptance(context))?.version === version })),
    accept: handle(async context => {
      await metadata.acceptEula(context, version);
      return { accepted: true };
    }),
  };
};

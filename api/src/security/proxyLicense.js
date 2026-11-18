import { trustedProxyIdentity } from './proxyIdentity.js';

export const proxyLicenseHandler = ({ organization, getLicense }) => (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  try { trustedProxyIdentity(request.headers, organization); }
  catch { return response.status(403).json({ error: 'Workbench administrator session required' }); }
  try {
    const license = getLicense();
    if (!['Basic', 'Labs', 'Enterprise', 'EnterpriseTrial'].includes(license?.license_type)) {
      return response.status(503).json({ error: 'Workbench license entitlement unavailable' });
    }
    return response.json({ product: license.licensed_product, version: license.license_version, type: license.license_type });
  } catch { return response.status(503).json({ error: 'Workbench license unavailable' }); }
};

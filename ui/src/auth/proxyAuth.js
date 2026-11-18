import { csrfFetch } from '../persistence/graphql/csrfFetch';

const SESSION_URI = '/backoffice/cypher-workbench/session';
const EULA_STATUS_URI = '/backoffice/cypher-workbench/eula/status';
const EULA_ACCEPT_URI = '/backoffice/cypher-workbench/eula/accept';

class ProxyAuth {
  constructor() {
    this.type = 'proxy';
    this.session = null;
    this.sessionPromise = null;
  }

  async bootstrap() {
    if (!this.sessionPromise) {
      this.sessionPromise = fetch(SESSION_URI, { credentials: 'same-origin' })
        .then(response => {
          if (!response.ok) throw new Error(`Session bootstrap failed: ${response.status}`);
          return response.json();
        })
        .then(session => {
          if (!session.email || session.managedTarget !== true) {
            throw new Error('Managed Cypher Workbench session is not available');
          }
          this.session = session;
          return session;
        })
        .catch(error => {
          this.sessionPromise = null;
          throw error;
        });
    }
    return this.sessionPromise;
  }

  isAuthenticated = () => Boolean(this.session && this.session.email);
  getIdToken = () => null;
  getLoggedInUserInfo = () => ({ email: this.session ? this.session.email : '' });
  getCurrentUser = async () => {
    const session = await this.bootstrap();
    return {
      email: session.email,
      primaryOrganization: session.organization || '',
      authorizedOrganizations: session.organization ? [session.organization] : []
    };
  };
  getIdentityInfo = () => ({ email: this.session ? this.session.email : '', sub: '', org: this.session ? (this.session.organization || '') : '' });
  getNewTokenOrLogin = async () => this.bootstrap();

  acceptedEula = async () => {
    const response = await fetch(EULA_STATUS_URI, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`EULA status unavailable: ${response.status}`);
    const result = await response.json();
    return result.accepted === true;
  };

  acceptEula = async () => {
    const response = await csrfFetch(EULA_ACCEPT_URI, { method: 'POST' });
    if (!response.ok) throw new Error(`EULA acceptance failed: ${response.status}`);
    return response.json();
  };

  setAcceptedEula = accepted => { if (accepted) sessionStorage.setItem('accepted_eula', 'true'); };
  logout = () => { this.session = null; this.sessionPromise = null; };
}

export default new ProxyAuth();

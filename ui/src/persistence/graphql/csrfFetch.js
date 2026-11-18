const CSRF_URI = '/backoffice/cypher-workbench/csrf';

let csrfPromise;

const getCsrf = () => {
  if (!csrfPromise) {
    csrfPromise = fetch(CSRF_URI, { credentials: 'same-origin' })
      .then(response => {
        if (!response.ok) throw new Error(`CSRF bootstrap failed: ${response.status}`);
        return response.json();
      })
      .then(({ token, headerName }) => {
        if (!token || !headerName) throw new Error('Invalid CSRF bootstrap response');
        return { token, headerName };
      })
      .catch(error => {
        csrfPromise = null;
        throw error;
      });
  }
  return csrfPromise;
};

export const csrfFetch = async (uri, options = {}) => {
  const csrf = await getCsrf();
  const headers = new Headers(options.headers || {});
  headers.set(csrf.headerName, csrf.token);
  headers.delete('authorization');
  return fetch(uri, { ...options, headers, credentials: 'same-origin' });
};

export const resetCsrf = () => { csrfPromise = null; };

const INITIALIZE_TYPE = 'elvis-workbench:initialize';
const READY_TYPE = 'elvis-workbench:ready';
const ERROR_TYPE = 'elvis-workbench:error';
const INTERACTION_REQUIRED_TYPE = 'elvis-workbench:interaction-required';

export const createNativeHandshake = (windowRef = window) => {
  let initialized = false;
  let outcome = null;
  let pendingAttempt = null;

  const post = (type, attempt, error) => {
    if (!attempt) return;
    const message = { type, attempt };
    if (error) message.error = error;
    windowRef.parent.postMessage(message, windowRef.location.origin);
  };

  const onMessage = event => {
    const data = event && event.data;
    if (!data || data.type !== INITIALIZE_TYPE || typeof data.attempt !== 'string') return;
    if (event.origin !== windowRef.location.origin || event.source !== windowRef.parent) return;

    initialized = true;
    pendingAttempt = data.attempt;
    if (outcome) post(outcome.type, pendingAttempt, outcome.error);
  };

  return {
    start: () => windowRef.addEventListener('message', onMessage),
    stop: () => windowRef.removeEventListener('message', onMessage),
    complete: () => {
      outcome = { type: READY_TYPE };
      if (initialized) post(READY_TYPE, pendingAttempt);
    },
    interactionRequired: () => {
      outcome = { type: INTERACTION_REQUIRED_TYPE };
      if (initialized) post(INTERACTION_REQUIRED_TYPE, pendingAttempt);
    },
    fail: error => {
      const message = error && error.message ? error.message : String(error);
      outcome = { type: ERROR_TYPE, error: message };
      if (initialized) post(ERROR_TYPE, pendingAttempt, message);
    }
  };
};

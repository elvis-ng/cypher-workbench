import { isDebuggingEnabled, getUrlQueryString, printDebug } from "../App";

const history = require("history").createBrowserHistory;
const appHistory = history({
  basename: process.env.PUBLIC_URL || '/',
  forceRefresh: true
});

export const doRedirect = (redirect, message) => {
    var url = redirect;
    if (isDebuggingEnabled()) {
      url += getUrlQueryString();
    }
    message = (message) ? `${message}: redirect` : 'redirect';
    printDebug(`${message}: ${url}`);
    appHistory.replace(url);
  }

export default appHistory;
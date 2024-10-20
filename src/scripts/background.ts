import { ACTIONS } from '../shared/constants';

/**
 * This mechanism serves as a means to know when the extension's popup menu closes. Stream
 * is ended upon the Popup menu being closed.
 *
 * NOTE: the 'popup' port is opended in the useEffect of the Popup component
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'popup') return;
  port.onDisconnect.addListener(() => {
    // Perform any necessary cleanup here
    chrome.storage.sync.set({ streaming: false });
    console.log('Popup closed, streaming stopped');
  });
});

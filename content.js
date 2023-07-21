import {makeBackgroundRequest} from './BackgroundConnection.js';
import {runCustomEventServer} from './CustomEventConnection.js';

// Proxy all requests from the inject to the background script.
runCustomEventServer('debaiter', makeBackgroundRequest);

const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.type = 'module';
(document.head || document.documentElement).appendChild(script);

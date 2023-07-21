import {makeBackgroundRequest} from './BackgroundConnection.js';
import {runCustomEventServer} from './CustomEventConnection.js';

function unescapeHtml(str) {
  return new DOMParser().parseFromString(str, 'text/html').documentElement.textContent;
}

function formatTime(t) {
  let minutes = Math.floor(t / 60);
  let seconds = Math.floor(t % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatTranscript(timedtext) {
  return Array.from(new DOMParser().parseFromString(timedtext, 'text/xml').querySelectorAll('text'))
    .map(t => {
      let start = parseFloat(t.getAttribute('start'));
      let duration = parseFloat(t.getAttribute('dur'));
      return `${formatTime(start)} ${unescapeHtml(t.textContent)}`;
    })
    .join('\n');
}

runCustomEventServer('debaiter', (request, signal) => makeBackgroundRequest({
  title: request.title,
  transcript: formatTranscript(request.timedtext),
}, signal));

const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.type = 'module';
(document.head || document.documentElement).appendChild(script);

import DOMPurify from 'dompurify';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import el from './el.js';
import ContentScriptClient from './ContentScriptClient.js';
import './ReadableStreamPolyfill.js';

main();

async function main() {
  const dataStream = await getPageStateStream();
  const contentScriptClient = new ContentScriptClient('debaiter');

  let summaryContents;
  const outline = el('div', { id: 'summary-container', className: 'item style-scope ytd-watch-metadata' }, [
    //el('div', { className: 'bold style-scope yt-formatted-string' }, 'Summary'),
    el('div', 'Fetching summary...', x => summaryContents = x)
  ]);

  // Maintain the invariant that if #description is on the page, make sure its next sibling is the summary container
  mountAfter('#bottom-row #description', outline);

  preemptingForEach(dataStream, async (data, signal) => {
    const captionTrack = data.playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.[0];
    if (!captionTrack) {
      console.log('no caption track available to create summary')
      return;
    }
    const transcript = formatTimedText(await fetch(captionTrack.baseUrl, { signal })
      .then(r => r.text()));
    const eventStream = await contentScriptClient.fetch({
      title: data.playerResponse.videoDetails.title,
      transcript
    });
    const fragmentStream = eventStream.pipeThrough(new TransformStream({
      transform(event, controller) {
        if (event.message?.author.role !== 'assistant') return;
        controller.enqueue(createFragment(event));
      }
    }), { signal });
    try {
      summaryContents.classList.add('result-streaming');
      for await (let fragment of fragmentStream) {
        while (summaryContents.firstChild) {
          summaryContents.firstChild.remove();
        }
        summaryContents.appendChild(fragment);
      }
    } finally {
      summaryContents.classList.remove('result-streaming');
    }
  });
}

async function preemptingForEach(readable, f) {
  let aborter;
  for await (let x of readable) {
    aborter?.abort('preempted');
    aborter = new AbortController();
    f(x, aborter.signal).catch(console.error);
  }
}

// Implementation of RxJS switchMap but for ReadableStreams and using AbortSignal to
// cancel streams which are preempted.
async function switchMap(stream, mapFn) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  (async () => {
    let aborter;
    for await (let x of readable) {
      aborter?.abort('preempted')
      aborter = new AbortController();
      (async signal => {
        const abortedSymbol = Symbol('aborted');
        const aborted = new Promise(r => signal.addEventListener('abort', () => r(abortedSymbol)));
        const reader = mapFn(x, signal).getReader();
        while (true) {
          const result = Promise.race([aborted, reader.read()])
          if (result === abortedSymbol || result.done) break;
          writer.write(result.value);
        }
      })(aborter.signal);
    }
    writer.close();
  })();
  return readable;
}

function createFragment(event) {
  const markdown = event.message.content.parts[0];
  const fragment = parseSummary(markdown);
  addTimestampClickHandlers(fragment);
  return fragment;
}

async function getPageStateStream() {
  const ytdApp = await waitForElement('ytd-app');
  // Using the ytdApp.ready callback to wait for the element to be upgraded causes YouTube to hang.  Use this instead to wait for the upgrade from a normal element to a WebComponent.
  await new Promise(r => {
    if (ytdApp.getAttribute('disable-upgrade') == null) {
      r();
      return;
    }
    new MutationObserver((_, observer) => {
      if (ytdApp.getAttribute('disable-upgrade') == null) {
        r();
        observer.disconnect();
      }
    }).observe(ytdApp, { attributes: true })
  });

  return createReadable(async writer => {
    while (true) {
      try {
        ytdApp._createPropertyObserver('data', d => {
          console.log('NEW DATA', d);
          writer.write(d);
        });
        return;
      } catch (e) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
  });
}

function unescapeHtml(str) {
  return new DOMParser().parseFromString(str, 'text/html').documentElement.textContent;
}

function formatTime(t) {
  let minutes = Math.floor(t / 60);
  let seconds = Math.floor(t % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatTimedText(timedtext) {
  return Array.from(new DOMParser().parseFromString(timedtext, 'text/xml').querySelectorAll('text'))
    .map(t => {
      let start = parseFloat(t.getAttribute('start'));
      let duration = parseFloat(t.getAttribute('dur'));
      return `${formatTime(start)} ${unescapeHtml(t.textContent)}`;
    })
    .join('\n');
}

function createReadable(f) {
  let { readable, writable } = new TransformStream();
  let writer = writable.getWriter();
  f(writer);
  return readable;
}

async function waitForElement(selector) {
  const domChangeStream = createReadable(writer => {
    const observer = new MutationObserver(mutations => writer.write());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    writer.closed.finally(() => {
      observer.disconnect();
    });
  });
  for await (let _ of domChangeStream) {
    const selectResult = document.querySelector(selector);
    if (selectResult) return selectResult;
  }
}

function parseSummary(markdown) {
  let html = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkHtml)
    .processSync(markdown)
    .toString();
  const responseDocument = new DOMParser().parseFromString(html, 'text/html');
  const fragment = document.createDocumentFragment();
  while (responseDocument.body.firstChild) {
    fragment.appendChild(responseDocument.body.firstChild);
  }
  return DOMPurify.sanitize(fragment, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: ['h3', 'ul', 'li', 'p'],
    ALLOWED_ATTRS: [],
  });
}

function addTimestampClickHandlers(fragment) {
  for (let li of fragment.querySelectorAll('li')) {
    const match = li.textContent.match(/^\[(.*?)\](.*)$/);
    if (match == null) return;
    const [_, timestamp, rest] = match;
    const seconds = timestamp.split(':')
      .map(x => parseInt(x))
      .reduce((acc, value) => acc * 60 + value);
    let a = el('a', {
      onclick: event => {
        const video = document.querySelector('video');
        video.currentTime = seconds;
        video.play();
        window.scrollTo({ top: 0 });
      }
    }, timestamp);
    li.replaceWith(el('li', [
      a,
      rest
    ]));
  }
}

function mountAfter(selector, element) {
  const observer = new MutationObserver(mutations => {
    const target = document.querySelector(selector);
    if (target && target.nextSibling !== element) {
      target.after(element);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

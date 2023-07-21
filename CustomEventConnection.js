export class CustomEventClient {
  constructor(eventNamePrefix) {
    this.eventNamePrefix = eventNamePrefix;
    this.requestEventName = eventNamePrefix + '-client-to-server';
    this.responseHandlers = new Map();
    document.addEventListener(this.eventNamePrefix + '-server-to-client', e => {
      this.responseHandlers.get(e.detail.requestId)(e.detail);
    });
  }

  sendToServer(message) {
    document.dispatchEvent(new CustomEvent(this.requestEventName, {
      detail: message
    }));
  }

  async fetch(request) {
    const requestId = Math.floor(Math.random() * Math.pow(2, 32));
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Make sure we only send an abort message to the server if the reader of the response stream aborts.
    // If we abort e.g. in response to an 'error' message from the server, we shouldn't then send an 'abort' message back to the server, since the server will have already cleaned up.
    let writerAborted = false;
    writer.closed.finally(() => {
      if (!writerAborted) {
        this.sendToServer({ requestId, type: 'abort', payload: 'fetchSummary writer closed' });
      }
    });
    this.responseHandlers.set(requestId, message => {
      const { type, payload } = message;
      switch (type) {
        case 'close':
          writer.close();
          this.responseHandlers.delete(requestId);
          break;
        case 'error':
          writerAborted = true;
          writer.abort(payload)
          break;
        case 'response':
          writer.write(payload);
          break;
        default:
          console.error(`Unrecognized message.type ${type} from content script.`, message)
      }
    });
    this.sendToServer({ requestId, type: 'request', payload: request });
    return readable;
  }
}


export function runCustomEventServer(eventNamePrefix, requestHandler) {
  const requestEventName = eventNamePrefix + '-client-to-server';
  const responseEventName = eventNamePrefix + '-server-to-client';
  const abortControllers = new Map();
  document.addEventListener(requestEventName, async e => {
    const { requestId, type, payload } = e.detail;
    function sendResponse({ type, payload }) {
      document.dispatchEvent(new CustomEvent(responseEventName, {
        detail: { requestId, type, payload }
      }));
    }
    switch (type) {
      case 'abort':
        abortControllers.get(requestId)?.abort(payload);
        abortControllers.delete(requestId);
        break;
      case 'request':
        const aborter = new AbortController();
        abortControllers.set(requestId, aborter);
        try {
          for await (let message of await requestHandler(payload, aborter.signal)) {
            sendResponse({ type: 'response', payload: message });
          }
          sendResponse({ type: 'close' });
        } catch (e) {
          if (!aborter.signal.aborted) aborter.abort(e);
          sendResponse({ type: 'error', payload: e });
        }
        abortControllers.delete(requestId);
        break;
      default:
        console.error('unrecognized or missing request type in message from inject script', e);
    }
  });
}

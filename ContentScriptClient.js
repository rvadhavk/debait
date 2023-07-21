export default class CustomEventClient {
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

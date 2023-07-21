import './ReadableStreamPolyfill.js';

export class BackgroundClientConnection {
  constructor(signal) {
    if (signal?.aborted) throw signal.reason;
    const port = chrome.runtime.connect();
    // Forward request messages to the background script
    this.writable = new WritableStream({
      write(message, controller) {
        port.postMessage(message);
      }
    });
    // Make responses from the background script readable through this.readable
    const responseQueue = new TransformStream();
    this.readable = responseQueue.readable;
    const responseWriter = responseQueue.writable.getWriter();
    port.onMessage.addListener(message => responseWriter.write(message));

    // Currently, there's no way for the background script to signal an abort.
    // The background script is responsible for determining when the connection should be ended
    // and signals that by disconnecting the port.
    // Ideally, each side should be able to signal when it's done sending messages and should
    // be able to signal an abort (that it will stop listening to messages from the other side).
    // Using disconnects to signal abort from the client side and close from the background
    // side helps keep us from having to encapsulate messages in another layer.
    let backgroundDisconnected = false;
    port.onDisconnect.addListener(() => {
      responseWriter.close();
      backgroundDisconnected = true;
    });

    signal.addEventListener('abort', e => {
      if (!backgroundDisconnected) port.disconnect();
      responseWriter.abort(e);
    });
  }
}

async function take(n, readable) {
  const result = [];
  const reader = readable.getReader();
  try {
    for (let i = 0; i !== n; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      result.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return result;
}

export async function makeBackgroundRequest(request, signal) {
  const connection = new BackgroundClientConnection(signal);
  const { readable, writable } = connection;
  const writer = writable.getWriter();
  writer.write(request);
  writer.close();
  const [firstRead] = await take(1, readable);
  if (firstRead == null) {
    throw 'Port was disconnected before receiving any messages';
  }
  switch (firstRead.type) {
    case 'stream-start':
      break;
    case 'error':
      throw firstRead.payload;
    default:
      throw 'Unexpected message type from background: ' + firstRead.type;
  }
  return readable.pipeThrough(new TransformStream({
    transform(message, controller) {
      switch (message.type) {
        case 'error':
          controller.error(message.payload);
          break;
        case 'stream-message':
          controller.enqueue(message.payload);
          break;
        default:
          controller.error({
            error: `Invalid message type ${message.type} in message from background script.  Expected 'stream-message'.`,
            message
          });
      }
    }
  }), {signal});
}

export function runBackgroundScriptServer(requestHandler) {
  chrome.runtime.onConnect.addListener(async port => {
    const request = await new Promise(r => {
      port.onMessage.addListener(r);
    });
    const aborter = new AbortController();
    let clientDisconnected = false;
    port.onDisconnect.addListener(e => {
      clientDisconnected = true;
      aborter.abort('port disconnected');
    });
    try {
      const responseStream = await requestHandler(request, aborter.signal);
      port.postMessage({ type: 'stream-start' });
      for await (let message of responseStream) {
        port.postMessage({ type: 'stream-message', payload: message });
      }
    } catch (e) {
      if (!aborter.signal.aborted) aborter.abort(e);
      if (!clientDisconnected) port.postMessage({ type: 'error', payload: e });
      throw e; // gives us an error message in the console
    } finally {
      // Don't need to post a 'stream-end' message, implied by closing the port.
      if (!clientDisconnected) port.disconnect();
    }
  });
}

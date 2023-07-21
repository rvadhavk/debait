// Polyfill from https://bugs.chromium.org/p/chromium/issues/detail?id=929585#c10
ReadableStream.prototype[Symbol.asyncIterator] = async function*() {
  const reader = this.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock()
  }
}

export function sseParserStream() {
  return composeTransformStreams([
    new TextDecoderStream(),
    new TransformStream(new LineBreakTransformer()),
    new TransformStream(new EventLineGroupingTransformer()),
    new TransformStream(mapTransformer(lines => combineSseFields(lines.map(l => parseEventLine(l))))),
  ]);
}

class LineBreakTransformer {
  constructor() {
    this.container = '';
    this.previousChunkEndedWithCR = false; // Add a flag to track if previous chunk ended with \r
  }

  transform(chunk, controller) {
    // Check if chunk starts with \n and previous chunk ended with \r
    if (this.previousChunkEndedWithCR && chunk.startsWith('\n')) {
      // If so, remove the starting \n from the chunk
      chunk = chunk.slice(1);
    }

    this.container += chunk;
    const lines = this.container.split(/\r\n|\n|\r/);
    this.container = lines.pop();
    lines.forEach(line => controller.enqueue(line));
  }

  flush(controller) {
    controller.enqueue(this.container);
  }
}

class EventLineGroupingTransformer {
  start(controller) {
    this.currentChunk = [];
  }

  transform(element, controller) {
    if (element === '') {
      controller.enqueue(this.currentChunk);
      this.currentChunk = [];
    } else {
      this.currentChunk.push(element);
    }
  }

  flush(controller) {
    // Explicitly don't enqueue the last chunk, since the last message has to end
    // with a newline, which from the perspective of this transformer, is denoted
    // as a sequence of strings ending with the empty string as the last element.
  }
}

function mapTransformer(f) {
  return {
    transform(element, controller) {
      try {
        controller.enqueue(f(element));
      } catch (err) {
        controller.error('Unable to transform chunk', err);
      }
    }
  };
}

function parseEventLine(l) {
  const { comment, key, value } = l.match(/^:(?<comment>.*)|(?<key>[^:]+)(?:: ?(?<value>.*))?$/).groups;
  if (comment) return { comment };
  return { key, value: value ?? '' };

}

function composeTransformStreams(streams) {
  if (streams.length === 0) return new TransformStream();
  if (streams.length === 1) return streams[0];
  let end = streams[0].readable;
  for (let i = 1; i !== streams.length; ++i) {
    end = end.pipeThrough(streams[i]);
  }
  return {
    writable: streams[0].writable,
    readable: end
  }
}

function filterUndefined(obj) {
  const result = {};
  for (const key in obj) {
    if (obj[key] !== undefined) result[key] = obj[key];
  }
  return result;
}

function combineSseFields(fields) {
  return filterUndefined({
    id: fields.filter(f => f.key === 'id' && !f.value.includes('\0')).at(-1)?.value,
    type: fields.filter(f => f.key === 'event').at(-1)?.value,
    data: fields.filter(f => f.key === 'data').map(f => f.value).join('\n'),
    retry: fields.filter(f => f.key === 'retry' && /^\d+$/.test(f.value)).at(-1)?.value,
  });
}

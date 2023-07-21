import { runBackgroundScriptServer } from './BackgroundConnection.js';
import { sseParserStream } from './SSEParserStream.js';

runBackgroundScriptServer(requestHandler);

async function requestHandler(request, signal) {
  const response = await fetchSummary(request, signal)
  if (!response.headers.get('content-type').startsWith('text/event-stream')) {
    throw { application: await response.json() };
  }
  return response.body
    .pipeThrough(sseParserStream())
    .pipeThrough(new TransformStream({
      transform(event, controller) {
        try {
          controller.enqueue(JSON.parse(event.data));
        } catch (_) { }
      }
    }));
}

async function fetchOpenAIKey() {
  let response = await fetch('https://chat.openai.com/api/auth/session', { credentials: 'include' })
    .then(r => r.json());
  return response?.accessToken;
}

function authedRequest(key) {
  return {
    referrer: 'https://chat.openai.com/',
    headers: {
      Authorization: 'Bearer ' + key,
    }
  };
}

function completionRequest(payload) {
  return {
    url: 'https://chat.openai.com/backend-api/conversation',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json'
    },
    method: 'POST',
    body: JSON.stringify(payload)
  }
}

function fetchSummaryPayload({ title, transcript }) {
  return {
    action: 'next',
    history_and_training_disabled: true,
    parent_message_id: generateUUID(),
    model: 'text-davinci-002-render-sha',
    messages: [{
      author: { role: 'user' },
      content: {
        content_type: 'text',
        parts: [
          prompt({ title, transcript })
        ]
      }
    }]
  };
}

async function fetchSummary(transcript, signal) {
  let request = deepMerge(
    authedRequest(await fetchOpenAIKey()),
    completionRequest(fetchSummaryPayload(transcript)),
    { signal }
  );
  return fetch(request.url, request);
}

// Assumes each object is acyclic and that there are no merge conflicts
function deepMerge(...objects) {
  let output = {};
  for (let o of objects) {
    for (let key in o) {
      if (!output[key]) output[key] = o[key];
      else output[key] = deepMerge(output[key], o[key]);
    }
  }
  return output;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0,
      v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function prompt() {
  return prompt2(...arguments);
}

function prompt0({ title, transcript }) {
  return `I am going to give you the title and transcript of a youtube video.

Here's the title:
${title}

Here's the transcript:
${transcript}

Here are your instructions:
Respond with a concise summary (under 5 sentences) with enough detail so that the reader doesn't have to watch the video to get the main points.  Do not include any acknowledgment of these instructions, just go straight into the summary.
`;
}

function prompt1({ title, transcript }) {
  return `
Your output should use the following template:

### Summary

### Analogy

### Notes

- [Emoji] Bulletpoint

### Keywords

- Explanation

You have been tasked with creating a concise summary of a YouTube video using its transcription to supply college student notes to use himself. You are to act like an expert in the subject the transcription is written about.

Make a summary of the transcript. Use keywords from the transcript. Don't explain them. Keywords will be explained later.

Additionally make a short complex analogy to give context and/or analogy from day-to-day life from the transcript.

Create 10 bullet points (each with an appropriate emoji) that summarize the key points or important moments from the video's transcription.

In addition to the bullet points, extract the most important keywords and any complex words not known to the average reader aswell as any acronyms mentioned. For each keyword and complex word, provide an explanation and definition based on its occurrence in the transcription.

You are also a transcription AI and you have been provided with a text that may contain mentions of sponsorships or brand names. Your task write what you have been said to do while avoiding any mention of sponsorships or brand names.

Please ensure that the summary, bullet points, and explanations fit within the 330-word limit, while still offering a comprehensive and clear understanding of the video's content. Here are the title and transcript:
${title}
${transcript}
`;
}

function prompt2({ title, transcript }) {
  return `Your output should use the following template:

### Summary

### Notes

- [timestamp] Bulletpoint

You have been tasked with creating a concise summary of a YouTube video using its transcription to supply college student notes to use himself. You are to act like an expert in the subject the transcription is written about.

Make a summary of the transcript. Use keywords from the transcript. Don't explain them.

Create no more than 10 bullet points (each with a corresponding timestamp) that summarize the key points or important moments from the video's transcription.

You are also a transcription AI and you have been provided with a text that may contain mentions of sponsorships or brand names. Your task write what you have been said to do while avoiding any mention of sponsorships or brand names.

Please ensure that the summary, bullet points, and explanations fit within the 330-word limit, while still offering a comprehensive and clear understanding of the video's content. Here are the title and transcript:
${title}
${transcript}`;
}


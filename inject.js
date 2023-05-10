(async () => {
  function waitForElement(selector) {
    return new Promise(resolve => {
      let observerCallback = (mutations, observer) => {
        for (let mutation of mutations) {
          const selected = mutation.target.querySelector(selector);
          if (selected) {
            observer.disconnect();
            resolve(selected);
          }
        }
      }
      new MutationObserver(observerCallback).observe(document.documentElement, {childList: true, subtree: true});
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
  async function copyTranscript() {
    console.log('COPYING TRANSCRIPT');
    let timedtextUrl = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl;
    let timedtext = await fetch(timedtextUrl).then(r => r.text());

    let transcript = Array.from(new DOMParser().parseFromString(timedtext, 'text/xml').querySelectorAll('text'))
      .map(t => {
          let start = parseFloat(t.getAttribute('start'));
          let duration = parseFloat(t.getAttribute('dur'));
          return `${formatTime(start)} ${unescapeHtml(t.textContent)}`;
      })
      .join('\n');
    navigator.clipboard.writeText(transcript);
  }

  const topLevelButtons = await waitForElement('#top-row #actions #menu #top-level-buttons-computed');
  console.log('FOUND TOP LEVEL BUTTONS');

  let buttonRenderer = document.createElement('ytd-button-renderer');
  buttonRenderer.id = 'copy-transcript-renderer';
  buttonRenderer.style.marginLeft = '8px';
  buttonRenderer.setProperties({
    version: "modern",
    forceIconButton: false,
    forceIconOnly: false,
    forceModernIconButton: false,
    alignByText: false,
    onTap: copyTranscript,
    data: {
      style: "STYLE_DEFAULT",
      size: "SIZE_DEFAULT",
      isDisabled: false,
      text: {
        runs: [{text: "Copy Transcript"}]
      },
    }
  });
  topLevelButtons.appendChild(buttonRenderer);
})();

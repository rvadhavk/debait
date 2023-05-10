const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);

//const observerCallback = (mutationsList, observer) => {
//  for (const mutation of mutationsList) {
//    if (mutation.type !== 'childList') continue;
//    const actionsElement = mutation.target.querySelector('#actions');
//
//    if (!actionsElement) continue;
//
//    console.log('Element with ID #actions has been added:', actionsElement);
//    console.log('under', mutation.target);
//    observer.disconnect();
//    x = document.createElement('button'); x.innerText = 'yoyasdfasfas'; actionsElement.appendChild(x)
//    return;
//  }
//};
//
//const observerConfig = {
//  childList: true,
//  subtree: true
//};
//
//const observer = new MutationObserver(observerCallback);
//observer.observe(document.documentElement, observerConfig);

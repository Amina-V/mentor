import { ACTIONS, ERRORS } from '../shared/constants';

let ws: WebSocket;

// Variables for content extraction
let contentInterval: number;
const contentCaptureRate = 5000; // Capture content every 5 seconds (adjust as needed)

// Keep track of the latest content to avoid redundant processing
let latestContent = '';

chrome.runtime.onMessage.addListener((msg) => {
  const { action } = msg;
  const { CONNECT, DISCONNECT } = ACTIONS;
  if (action !== CONNECT && action !== DISCONNECT) return;

  chrome.storage.sync.get(['apiKey', 'streaming'], (result) => {
    const { apiKey, streaming } = result;
    if (action === CONNECT) {
      const err: keyof typeof ERRORS = 'STREAMING_IN_PROGRESS';
      streaming ? displayError(err) : startContentStreaming(apiKey);
    }
    if (action === DISCONNECT) {
      disconnect();
    }
  });
});

/**
 * Function to start streaming content from the page and sending it to the API.
 */
function startContentStreaming(apiKey: string): void {
  const wsURL = `wss://api.hume.ai/v0/stream/models?apikey=${apiKey}`;
  ws = connect(wsURL);

  // Begin capturing content from the page
  captureAndSendContent();
}

/**
 * Function which creates a new WebSocket connection and defines event handlers.
 */
function connect(webSocketURL: string): WebSocket {
  const socket = new WebSocket(webSocketURL);

  socket.addEventListener('open', () => {
    console.log('WebSocket connection established.');
    const streaming = true;
    chrome.storage.sync.set({ streaming });
    chrome.runtime.sendMessage({
      action: ACTIONS.STREAMING_STATE_UPDATED,
      streaming,
    });
  });

  // socket.addEventListener('message', (event) => {
  //   const data: MessageResponseBody = JSON.parse(event.data);

  //   // Extract top 5 expressions or results from the response
  //   const topFiveExpressions = extractTopFiveExpressions(data);

  //   // Update top five expressions in the popup menu
  //   chrome.runtime.sendMessage({
  //     action: ACTIONS.TOP_FIVE_UPDATED,
  //     topFiveExpressions,
  //   });
  // });

  socket.addEventListener('close', (event) => {
    chrome.storage.sync.get(['streaming'], ({ streaming }) => {
      if (streaming) {
        ws = connect(webSocketURL);
        console.log('WebSocket reconnecting...');
        return;
      }
      chrome.runtime.sendMessage({
        action: ACTIONS.STREAMING_STATE_UPDATED,
        streaming,
      });
      console.log('WebSocket connection closed:', event.reason);
    });
  });

  socket.addEventListener('error', (error) => {
    console.error('WebSocket error:', error);
  });

  return socket;
}

/**
 * Function to stop the WebSocket connection and content capture.
 */
function disconnect(): void {
  if (contentInterval) {
    clearInterval(contentInterval);
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close(1000, 'Streaming stopped');
  }
  chrome.storage.sync.set({ streaming: false });
}

/**
 * Function which captures content from the page at regular intervals and sends it to the API.
 */
function captureAndSendContent(): void {
  contentInterval = window.setInterval(() => {
    const content = extractContentFromPage();

    // Avoid sending duplicate content
    if (content && content !== latestContent) {
      latestContent = content;
      createAndSendMessage(content);
    }
  }, contentCaptureRate);
}

/**
 * Function to extract content from the page.
 * Customize this function based on the content you need.
 */
function extractContentFromPage(): string {
  // Example: Extract text from all paragraphs
  const paragraphs = document.querySelectorAll('p');
  let textContent = '';
  paragraphs.forEach((p) => {
    textContent += p.innerText + ' ';
  });
  return textContent.trim();
}

/**
 * Function to create and send a message through the WebSocket.
 */
function createAndSendMessage(content: string): void {
  if (ws.readyState !== WebSocket.OPEN) return;

  // Build the message according to the API's expected format
  const message = JSON.stringify({
    text: content,
    models: { language: { granularity: 'sentence' } },
    // Include a unique payload_id if necessary
  });

  ws.send(message);
}

/**
 * Function to display an error message to the user.
 */
function displayError(error: keyof typeof ERRORS): void {
  alert(`Hume Extension Error: ${ERRORS[error]}`);
}

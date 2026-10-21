const url = process.argv[2];
const ws = new WebSocket(url);
const expression = [
  'JSON.stringify({',
  "  text: document.body.innerText.replace(/\\n+/g, ' | ').slice(0, 600),",
  '  hasBridge: typeof window.wow,',
  "  hasSettings: document.body.innerText.includes('Provider'),",
  "  hasModelHint: document.body.innerText.includes('配置一个模型')",
  '})',
].join('\n');

ws.onopen = () => {
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
};
ws.onmessage = (message) => {
  console.log(message.data);
  ws.close();
  process.exit(0);
};
setTimeout(() => {
  console.log('timeout');
  process.exit(1);
}, 8000);

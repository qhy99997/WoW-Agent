import { writeFile } from 'node:fs/promises'

const [mode, arg] = process.argv.slice(2)
const endpoint = process.env.WOW_CDP ?? 'http://127.0.0.1:9222'

async function connect() {
  const targets = await fetch(`${endpoint}/json`).then((response) => response.json())
  const target = targets.find((entry) => entry.type === 'page')
  if (!target) throw new Error('No page target')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let nextId = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  return { ws, send, target }
}

const { ws, send, target } = await connect()

try {
  if (mode === 'eval') {
    const expression = arg ?? (await new Promise((resolve) => {
      let data = ''
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', (chunk) => (data += chunk))
      process.stdin.on('end', () => resolve(data))
    }))
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    })
    if (result.exceptionDetails) {
      console.error(JSON.stringify(result.exceptionDetails, null, 2))
      process.exitCode = 1
    } else {
      console.log(JSON.stringify(result.result?.value ?? result.result ?? null, null, 2))
    }
  } else if (mode === 'shot') {
    const result = await send('Page.captureScreenshot', { format: 'png' })
    const out = arg ?? 'wow-shot.png'
    await writeFile(out, Buffer.from(result.data, 'base64'))
    console.log(out)
  } else {
    console.log(JSON.stringify({ title: target.title, url: target.url }))
  }
} finally {
  ws.close()
}

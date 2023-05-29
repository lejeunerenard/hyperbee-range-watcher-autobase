import Autobase from 'autobase'
import Corestore from 'corestore'
import Hyperbee from 'hyperbee'
import RAM from 'random-access-memory'
import { RangeWatcher } from './index.js'

const peerStore1 = new Corestore(RAM)
const peerStore2 = new Corestore(RAM)

const input1 = peerStore1.get({ name: 'input' })
const input2 = peerStore2.get({ name: 'input' })
const output1 = peerStore1.get({ name: 'output' })
const output2 = peerStore2.get({ name: 'output' })

await Promise.all([input1, input2].map((c) => c.ready()))

function createBase (input, inputKeys, output, store) {
  return new Autobase({
    inputs: inputKeys.map((key) => store.get(key)),
    localInput: input,
    localOutput: output,
    autostart: true,
    eagerUpdate: true,
    valueEncoding: 'json',
    unwrap: true,
    view: (core) => new Hyperbee(core.unwrap(), {
      keyEncoding: 'utf-8',
      valueEncoding: 'json',
      extension: false
    }),
    apply: async (bee, batch) => {
      // // force apply to take a while to simulate potential race condition
      // await new Promise((resolve) => setTimeout(resolve, 1 * 1000))

      const b = bee.batch({ update: false })
      for (const node of batch) {
        const info = JSON.parse(node.value)
        if (info.type === 'put') {
          await b.put(info.key, info.value)
        } else if (info.type === 'del') {
          await b.del(info.key)
        }
      }
      await b.flush()
    }
  })
}

function replicate (a, b, opts) {
  const s1 = a.replicate(true, { keepAlive: false, ...opts })
  const s2 = b.replicate(false, { keepAlive: false, ...opts })
  s1.on('error', err => console.error(`replication stream error (initiator): ${err}`))
  s2.on('error', err => console.error(`replication stream error (responder): ${err}`))
  s1.pipe(s2).pipe(s1)
  return [s1, s2]
}

const peerBase1 = createBase(input1, [input1, input2], output1, peerStore1)
const peerBase2 = createBase(input2, [input1, input2], output2, peerStore2)

const watcher1 = new RangeWatcher(peerBase1.view, {}, null, async (node) => {
  console.log('watcher1 node', node)
})
const watcher2 = new RangeWatcher(peerBase2.view, { gte: 'f' }, null, async (node) => {
  console.log('watcher2 node', node)
})

for (let i = 0; i < 5; i++) {
  await peerBase1.append(JSON.stringify({
    type: 'put',
    key: 'beep' + i,
    value: i
  }))
}

replicate(peerStore1, peerStore2)

for (let i = 0; i < 2; i++) {
  await peerBase2.append(JSON.stringify({
    type: 'put',
    key: 'foo' + i,
    value: i
  }))
}

for (let i = 0; i < 2; i++) {
  await peerBase2.append(JSON.stringify({
    type: 'del',
    key: 'beep' + i
  }))
}

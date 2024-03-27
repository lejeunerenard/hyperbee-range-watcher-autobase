import Autobase from 'autobase'
import Corestore from 'corestore'
import Hyperbee from 'hyperbee'
import RAM from 'random-access-memory'
import { RangeWatcher } from './index.js'
import b4a from 'b4a'

const peerStore1 = new Corestore(RAM)
const peerStore2 = new Corestore(RAM)

function createBase (store, bootstrap) {
  return new Autobase(store, bootstrap, {
    valueEncoding: 'json',
    open: (store) => {
      const core = store.get('view', { valueEncoding: 'json' })
      return new Hyperbee(core, {
        keyEncoding: 'utf-8',
        valueEncoding: 'json',
        extension: false
      })
    },
    apply: async (batch, bee, base) => {
      const b = bee.batch({ update: false })
      for (const node of batch) {
        const info = node.value
        // Add writer support
        if ('add' in info) {
          const writerKey = b4a.from(info.add, 'hex')
          await base.addWriter(writerKey)
          continue
        }

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

const peerBase1 = createBase(peerStore1)
await peerBase1.ready()
const peerBase2 = createBase(peerStore2, peerBase1.key)
await peerBase2.ready()

const stream1 = peerBase1.replicate(true, { live: true })
const stream2 = peerBase2.replicate(false, { live: true })
stream1.pipe(stream2).pipe(stream1)

await peerBase1.append({
  add: b4a.toString(peerBase2.local.key, 'hex')
})

await peerBase1.update()
await peerBase2.update()

const watcher1 = new RangeWatcher(peerBase1.view, {}, 0, async (node) => {
  console.log('watcher1 node', node)
})
const watcher2 = new RangeWatcher(peerBase2.view, { gte: 'f' }, 0, async (node) => {
  console.log('watcher2 node', node)
})

for (let i = 0; i < 5; i++) {
  await peerBase1.append({
    type: 'put',
    key: 'beep' + i,
    value: i
  })
}

for (let i = 0; i < 2; i++) {
  await peerBase2.append({
    type: 'put',
    key: 'foo' + i,
    value: i
  })
}

for (let i = 0; i < 2; i++) {
  await peerBase2.append({
    type: 'del',
    key: 'beep' + i
  })
}

import test from 'tape'
import Hyperbee from 'hyperbee'
import Hypercore from 'hypercore'
import Corestore from 'corestore'
import Autobase from 'autobase'
import { replicateAndSync } from 'autobase-test-helpers'
import RAM from 'random-access-memory'
import b4a from 'b4a'
import { RangeWatcher } from '../index.js'

test('constructor', (t) => {
  t.test('takes latest = null|undefined', async (t) => {
    t.test('null', async (t) => {
      const core = new Hypercore(RAM)
      const bee = new Hyperbee(core, { valueEncoding: 'json' })
      await bee.ready()

      await bee.put('beep', 1)
      await bee.put('boop', 2)
      const setupVersion = bee.version

      const seen = new Map()
      const watcher = new RangeWatcher(bee, {}, null, (node) => {
        seen.set(b4a.toString(node.key), 1)
      })

      t.equal(watcher.latest.version, setupVersion, 'latest version = bee version')

      await watcher.update()

      t.deepEquals([...seen.keys()], [], 'didnt fire for existing keys')

      await bee.put('foo', 3)
      await watcher.update()

      t.deepEquals([...seen.keys()], ['foo'], 'still fires for new keys')
    })

    t.test('undefined', async (t) => {
      const core = new Hypercore(RAM)
      const bee = new Hyperbee(core, { valueEncoding: 'json' })
      await bee.ready()

      await bee.put('beep', 1)
      await bee.put('boop', 2)
      const setupVersion = bee.version

      const seen = new Map()
      const watcher = new RangeWatcher(bee, {}, undefined, (node) => {
        seen.set(b4a.toString(node.key), 1)
      })

      t.equal(watcher.latest.version, setupVersion, 'latest version = bee version')

      await watcher.update()

      t.deepEquals([...seen.keys()], [], 'didnt fire for existing keys')

      await bee.put('foo', 3)
      await watcher.update()

      t.deepEquals([...seen.keys()], ['foo'], 'still fires for new keys')
    })
  })

  t.test('doesnt fire for relinearizing autobase', async (t) => {
    const store1 = new Corestore(RAM.reusable())
    const store2 = new Corestore(RAM.reusable())

    const seen1 = new Map()
    const seen2 = new Map()

    const base1 = new Autobase(store1, null, { open, apply, valueEncoding: 'json' })
    await base1.ready()
    const base2 = new Autobase(store2, base1.key, { open, apply, valueEncoding: 'json' })
    await base2.ready()
    const bases = [base1, base2]

    const watcher1 = new RangeWatcher(base1.view, {}, null, (node) => {
      const key = b4a.toString(node.key)
      if (seen1.has(key)) {
        t.fail('double fired for key ' + key)
      }

      seen1.set(key, 1)
    })
    const watcher2 = new RangeWatcher(base2.view, {}, undefined, (node) => {
      const key = b4a.toString(node.key)
      if (seen2.has(key)) {
        t.fail('double fired for key ' + key)
      }
      seen2.set(key, 1)
    })

    await addWriter(base1, base2.local.key)
    await replicateAndSync(bases)

    t.deepEquals([...seen1.keys()], [], 'nothing triggered yet')
    t.deepEquals([...seen2.keys()], [], 'nothing triggered yet')

    for (let i = 0; i < 2; i++) {
      await base1.append({ type: 'put', key: 'base1:' + i, value: '' + i })
    }

    for (let i = 0; i < 2; i++) {
      await base2.append({ type: 'put', key: 'base2:' + i, value: '' + i })
    }

    // Probably not needed for local appends, but should do anyways
    await watcher1.update()
    await watcher2.update()

    t.deepEquals([...seen1.keys()], ['base1:0', 'base1:1'], 'base1 triggered its keys')
    t.deepEquals([...seen2.keys()], ['base2:0', 'base2:1'], 'base2 triggered its keys')

    await replicateAndSync(bases)

    t.deepEquals([...seen1.keys()], ['base1:0', 'base1:1', 'base2:0', 'base2:1'], 'all have triggered')
    t.deepEquals([...seen2.keys()], ['base2:0', 'base2:1', 'base1:0', 'base1:1'], 'all have triggered')
  })
})

test('update', (t) => {
  t.test('awaits 2nd run', async (t) => {
    const core = new Hypercore(RAM)
    const bee = new Hyperbee(core, { valueEncoding: 'json' })
    await bee.ready()

    const seen = new Map()
    const watcher = new RangeWatcher(bee, {}, undefined, (node) => {
      seen.set(b4a.toString(node.key), 1)
    })

    await bee.put('beep', 1)
    await bee.put('boop', 2)

    await watcher.update()

    t.deepEquals([...seen.keys()], ['beep', 'boop'])
  })
})

const open = (store) => {
  const core = store.get('view')
  return new Hyperbee(core, { extension: false })
}

const addWriter = (base, key) => base.append({ add: key })

const apply = async (batch, bee, base) => {
  const b = bee.batch({ update: false })

  for (const { value: node } of batch) {
    if ('add' in node) {
      await base.addWriter(b4a.from(node.add))
      continue
    }

    if (node.type === 'put') {
      await b.put(node.key, node.value)
    } else {
      await b.del(node.key)
    }
  }

  await b.flush()
}

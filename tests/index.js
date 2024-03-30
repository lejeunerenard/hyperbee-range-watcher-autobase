import test from 'tape'
import Hyperbee from 'hyperbee'
import Hypercore from 'hypercore'
import RAM from 'random-access-memory'
import b4a from 'b4a'
import { RangeWatcher } from '../index.js'

test('constructor', (t) => {
  t.test('takes latestDiff = 0', async (t) => {
    const core = new Hypercore(RAM)
    const bee = new Hyperbee(core, { valueEncoding: 'json' })
    await bee.ready()

    await bee.put('beep', 1)
    await bee.put('boop', 2)

    const seen = new Map()
    const watcher = new RangeWatcher(bee, {}, 0, (node) => {
      seen.set(b4a.toString(node.key), 1)
    })

    t.equal(watcher.latestDiff, 0, 'latestDiff = 0')

    await watcher.update()

    t.deepEquals([...seen.keys()], ['beep', 'boop'])
  })

  t.test('takes latestDiff = null|undefined', async (t) => {
    t.test('null', async (t) => {
      const core = new Hypercore(RAM)
      const bee = new Hyperbee(core, { valueEncoding: 'json' })
      await bee.ready()

      await bee.put('beep', 1)
      await bee.put('boop', 2)

      const seen = new Map()
      const watcher = new RangeWatcher(bee, {}, null, (node) => {
        seen.set(b4a.toString(node.key), 1)
      })

      t.equal(watcher.latestDiff, 3, 'latestDiff = null')

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

      const seen = new Map()
      const watcher = new RangeWatcher(bee, {}, undefined, (node) => {
        seen.set(b4a.toString(node.key), 1)
      })

      t.equal(watcher.latestDiff, 3, 'latestDiff = null')

      await watcher.update()

      t.deepEquals([...seen.keys()], [], 'didnt fire for existing keys')

      await bee.put('foo', 3)
      await watcher.update()

      t.deepEquals([...seen.keys()], ['foo'], 'still fires for new keys')
    })
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

# Hyperbee Range Watcher

This module allows you to watch for live changes to a hyperbee
running on autobase. Autobase currently doesn't support calling
`autobase.view.get(autobase.view.core.length)` as it will throw a `Linearization
could not be rebuilt after 32 attempts` error due to attempting rebuild the
`LinearizedCore` to find the missing block. But the default method to listen
for changes on a hyperbee is to use hyperbee's `.createHistoryStream({ live:
true })` which relies on `.get()` waiting until a block is found. This module
recreates an approximation of `.createHistoryStream()`'s functionality with
support for a key based range instead of a block index range.

Some known difference with `.createHistoryStream()`:

- `RangeWatcher` will repeat keys updates in cases where `Autobase` reorders the
input logs when linearizing.
- Some updates to keys will be skipped if the key is updated multiple times in a
single update batch of `Autobase`'s view. This is because in order to support a
key-based range for selectively 

## Usage

```js
import Hyperbee from 'hyperbee'
import { RangeWatcher } from '@lejeunerenard/hyperbee-range-watcher-autobase'

const base = new Autobase(store, bootstrapKey, {
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
      if (info.type === 'put') {
        await b.put(info.key, info.value)
      } else if (info.type === 'del') {
        await b.del(info.key)
      }
    }
    await b.flush()
  }
})

new RangeWatcher(base.view, { gte: 'b' }, null, async (node) => {
  console.log('hyperbee update node', node)
})

await base.append({
  type: 'put',
  key: 'bar',
  value: 'buzz'
})

await base.append({
  type: 'del',
  key: 'bar'
})

await base.append({
  type: 'put',
  key: 'foo'
})
```

## API

`const watcher = new RangeWatcher(bee, range, startingVersion = bee.version, callback)`

Creates a watcher that watches for changes on `bee` with `range` starting at
`startingVersion` calling `callback` with each change.

`range`: Supports the same options as `hyperbee`'s `db.createDiffStream`.

The `callback` receives a `node` object as its only argument. The `node` object
looks like this:

```
{
  type: 'put'   // either 'put' or 'del' depending if a key was update or deleted
  key: 'foo'    // The hyperbee `key`
  value: 'bar'  // The hyperbee `value` for the given `key`
}
```

`await watcher.update()`

Update `bee` and wait the current run checking for differences on the `range`.

### Example

`new RangeWatcher(bee, {}, null, ({ type, key, value }) => {
  if (type === 'put') {
    console.log('key', key, 'set to', value)
  } else { // type === 'del'
    console.log('key', key, 'was deleted and previously had the value', value)
  }
})`

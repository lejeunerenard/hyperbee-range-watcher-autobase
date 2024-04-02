import HyperBeeDiffStream from 'hyperbee-diff-stream'

export class RangeWatcher {
  constructor (bee, range, latest, cb) {
    this.bee = bee

    this.opened = false

    this.range = range
    this.latest = latest || this.bee.snapshot()
    this.cb = cb
    this.stream = null

    this._opening = this._ready()

    this._runBound = async () => {
      this._currentRun = this._run()
      return this._currentRun
    }
    this._runBound()
  }

  async _ready () {
    await this.bee.ready()
    this.opened = true
  }

  async _run () {
    if (this.opened === false) await this._opening

    const db = this.bee.snapshot()

    this.stream = new HyperBeeDiffStream(this.latest, db, { closeSnapshots: false, ...this.range })

    for await (const node of this.stream) {
      let key
      let value
      let type = 'put'
      // Diff stream
      if ('left' in node || 'right' in node) {
        if (node.left) {
          key = node.left.key
          value = node.left.value
        } else {
          key = node.right.key
          value = node.right.value
        }

        if (!node.left && node.right) {
          type = 'del'
        }
      }
      await this.cb({ type, key, value })
    }

    this.latest = db

    if (this.bee.version !== db.version) {
      await this._runBound()
    } else {
      // Setup hook to start again
      this.bee.core.once('append', this._runBound)
    }

    return this.stream
  }

  async update () {
    await this._ready()
    await this.bee.update()
    if (this.bee.version !== this.latest.version) {
      await this._currentRun
    }
  }
}

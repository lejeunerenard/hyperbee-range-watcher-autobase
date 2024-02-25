export class RangeWatcher {
  constructor (bee, range, latestDiff, cb) {
    this.bee = bee

    this.opened = false

    this.range = range
    this.latestDiff = latestDiff !== undefined ? latestDiff : this.bee.version
    this.cb = cb
    this.stream = null

    this._wasTruncated = false

    this._opening = this._ready()

    this._setLatestDiff = (ancestor) => {
      this._wasTruncated = true
      this.latestDiff = ancestor
    }

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

    this.bee.core.off('append', this._runBound)
      .off('truncate', this._setLatestDiff)

    // TODO Using snapshot only supported with fix to linearize.js's session on snapshotted cores on linearizedcoresession class
    const db = this.bee.snapshot()

    // // Show versions being diffed
    // console.log('this.latestDiff', this.latestDiff, 'vs db.version', db.version)

    this._wasTruncated = false
    this.stream = db.createDiffStream(this.latestDiff, this.range)

    // Setup truncate guard
    this.bee.core.once('truncate', this._setLatestDiff)

    for await (const node of this.stream) {
      if (this._wasTruncated) break

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

    if (!this._wasTruncated) {
      this.latestDiff = db.version // Update latest
    }

    if (this.bee.version !== db.version || this._wasTruncated) {
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
    if (this.bee.version !== this.latestDiff) {
      await this._currentRun
    }
  }
}

/**
 * computeGitGraphLanes: linear history rides one lane, forks open a lane,
 * merges converge into the carrying lane, and a parent cut off by the page
 * bound still occupies its lane so the cut keeps its curve.
 */
import { describe, expect, it } from 'vitest'
import { computeGitGraphLanes } from '../src/client/gitGraphLanes.ts'

/** Row helper: hash plus parents only — all the layout consumes. */
function entry(hash: string, parents: string[] = []): { hash: string; parents: string[] } {
  return { hash, parents }
}

describe('computeGitGraphLanes', () => {
  it('keeps linear history on lane 0 with straight edges', () => {
    const layout = computeGitGraphLanes([
      entry('c3', ['c2']),
      entry('c2', ['c1']),
      entry('c1'),
    ])
    expect(layout.laneCount).toBe(1)
    expect(layout.rows.map(row => row.lane)).toEqual([0, 0, 0])
    // The root row keeps its incoming edge: the line from c2 reaches it.
    expect(layout.rows.map(row => row.edges)).toEqual([
      [[0, 0]],
      [[0, 0]],
      [[0, 0]],
    ])
  })

  it('forks the second parent onto a new lane and converges at the merge', () => {
    const layout = computeGitGraphLanes([
      entry('merge', ['main-tip', 'side-tip']),
      entry('main-tip', ['base']),
      entry('side-tip', ['base']),
      entry('base'),
    ])
    // The merge sits on lane 0 (main-tip's lane); side-tip forks to lane 1.
    expect(layout.rows[0]?.lane).toBe(0)
    expect(layout.rows[0]?.edges).toEqual([[0, 0], [0, 1]])
    expect(layout.rows[1]?.lane).toBe(0)
    expect(layout.rows[2]?.lane).toBe(1)
    // side-tip's own continuation rides its lane; `base` is already carried
    // by lane 0, so the parent edge merges back into lane 0.
    expect(layout.rows[2]?.edges).toEqual([[1, 1], [1, 0]])
    expect(layout.laneCount).toBe(2)
  })

  it('reuses the freed lane of a consumed root line before opening a new one', () => {
    const layout = computeGitGraphLanes([
      entry('a', ['b']),
      entry('b'),
      // `c` is not a parent of anything above: it opens the first free lane,
      // which is lane 0 again after `b` freed it.
      entry('c'),
    ])
    expect(layout.rows.map(row => row.lane)).toEqual([0, 0, 0])
  })

  it('keeps a lane for a parent cut off by the page bound', () => {
    const layout = computeGitGraphLanes([
      entry('tip', ['missing-parent']),
    ])
    expect(layout.rows).toHaveLength(1)
    // The edge leaves the cut toward the bottom on the parent's lane.
    expect(layout.rows[0]?.edges).toEqual([[0, 0]])
    expect(layout.laneCount).toBe(1)
  })

  it('converges two children onto the commit lane they share', () => {
    // git lists children before parents, so both merges ride above `shared`.
    const layout = computeGitGraphLanes([
      entry('x', ['shared']),
      entry('y', ['shared']),
      entry('shared'),
    ])
    // x continues on lane 0; y forks to lane 1 and merges into shared's lane.
    expect(layout.rows.map(row => row.lane)).toEqual([0, 1, 0])
    expect(layout.rows.map(row => row.edges)).toEqual([
      [[0, 0]],
      [[1, 0]],
      [[0, 0]],
    ])
    expect(layout.laneCount).toBe(2)
  })
})

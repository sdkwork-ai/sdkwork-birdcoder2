/**
 * Lane layout for the git graph modal. The host log rows carry parent
 * topology (no ASCII graph); this module derives the classic gitk lane graph
 * from that topology: one node lane per row plus the edges leaving each row
 * toward the next one, so the SVG renderer stays a pure projection.
 */
import type { SdkworkGitLogEntry } from '@deepseek-ai/dsh-api-sdkwork-git-controller/types'

/** One laid-out row: the node's lane and the edges it sends to the next row. */
export interface GitGraphRow {
  /** Lane index the commit's node sits on. */
  readonly lane: number
  /** Edges [fromLane, toLane] leaving this row toward the next row (or off the cut). */
  readonly edges: readonly (readonly [number, number])[]
  /** Lane count after this row's edges are registered. */
  readonly laneCount: number
}

/** Complete lane layout of one log page. */
export interface GitGraphLayout {
  readonly rows: readonly GitGraphRow[]
  /** Maximum lane count the layout used. */
  readonly laneCount: number
}

/** Mutable accumulator behind one laid-out row (the wire face is readonly). */
interface GraphRowAccumulator {
  lane: number
  edges: Array<[number, number]>
  laneCount: number
}

/** Push one edge unless the same lane pair is already registered this row. */
function pushEdge(row: GraphRowAccumulator, from: number, to: number): void {
  if (!row.edges.some(([edgeFrom, edgeTo]) => edgeFrom === from && edgeTo === to)) {
    row.edges.push([from, to])
  }
}

/**
 * Compute the lane layout: each commit renders on the lane that carries it
 * (a free lane otherwise); the first parent continues on the node's lane,
 * further parents take the first free lane or merge into the lane already
 * carrying them. A parent not present in the page still occupies its lane,
 * so the cut rows keep their outgoing curves.
 * @param entries - log rows in git's listing order (newest first).
 * @returns the per-row lanes, edges, and the peak lane count.
 */
export function computeGitGraphLanes(
  entries: readonly Pick<SdkworkGitLogEntry, 'hash' | 'parents'>[],
): GitGraphLayout {
  const rows: GraphRowAccumulator[] = []
  // One slot per lane: the hash the lane currently carries downward, or null
  // when the lane is free.
  const activeLanes: Array<string | null> = []
  let laneCount = 0
  for (const entry of entries) {
    const row: GraphRowAccumulator = { lane: 0, edges: [], laneCount: 0 }
    // Incoming: every lane carrying this commit converges on the node lane.
    const carrying: number[] = []
    for (let lane = 0; lane < activeLanes.length; lane += 1) {
      if (activeLanes[lane] === entry.hash) carrying.push(lane)
    }
    let nodeLane: number
    if (carrying.length === 0) {
      const free = activeLanes.indexOf(null)
      if (free < 0) {
        nodeLane = activeLanes.length
        activeLanes.push(null)
      } else {
        nodeLane = free
      }
      laneCount = Math.max(laneCount, activeLanes.length)
    } else {
      nodeLane = carrying[0]
    }
    row.lane = nodeLane
    for (const lane of carrying) {
      pushEdge(row, lane, nodeLane)
      activeLanes[lane] = null
    }
    // Outgoing: first parent continues on the node's lane; further parents
    // take the first free lane or merge into the lane already carrying them.
    let first = true
    for (const parent of entry.parents) {
      const existing = activeLanes.indexOf(parent)
      if (existing >= 0) {
        pushEdge(row, nodeLane, existing)
        continue
      }
      if (first) {
        activeLanes[nodeLane] = parent
        pushEdge(row, nodeLane, nodeLane)
        first = false
        continue
      }
      const free = activeLanes.indexOf(null)
      const target = free >= 0 ? free : activeLanes.length
      if (free < 0) activeLanes.push(parent)
      else activeLanes[free] = parent
      laneCount = Math.max(laneCount, activeLanes.length)
      pushEdge(row, nodeLane, target)
    }
    row.laneCount = activeLanes.length
    laneCount = Math.max(laneCount, activeLanes.length)
    rows.push(row)
  }
  return { rows, laneCount }
}

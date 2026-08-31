import type { GraphNode } from "@/domain/graph/types";
import {
  DEFAULT_LAYOUT,
  type LayoutOptions,
  type Point,
} from "@/domain/graph/layout";

/** Room above a lane's nodes for the name of the story it is. */
export const LANE_LABEL_HEIGHT = 44;

/** The empty band between one story and the next. Wider than the gap
 *  between rows inside a story, because that is the whole job: saying
 *  where one graph ends and the next begins. */
export const LANE_GAP = 140;

export interface Lane {
  storyId: string;
  /** Where the lane's name is drawn; its nodes start below it. */
  top: number;
  height: number;
}

export interface LaneLayout {
  /** Where each node should be drawn, by node id. */
  positions: Map<string, Point>;
  lanes: Lane[];
}

/**
 * Every story stacked down one canvas, each in a lane of its own.
 *
 * Stories are drawn from the same coordinate origin — a new story's
 * START is at (100, 300) whichever story it is — so putting several on
 * one canvas without moving them would pile them all in the same place.
 * Each lane is therefore the story's own arrangement, translated: the
 * shape people made stays exactly the shape they made, only somewhere
 * else on the sheet.
 *
 * The positions this returns are for drawing and nothing else. Writing
 * one back would move the node inside its own story by however far its
 * lane happens to sit down the page, which is why the canvas that uses
 * this does not save positions at all.
 *
 * A story with no nodes still gets a lane. It is a story in the
 * workspace, and a view called "all" that silently omits it is lying
 * about a thing the reader is counting on it for.
 */
export function layoutLanes(
  storyIds: string[],
  nodes: GraphNode[],
  { nodeHeight }: LayoutOptions = DEFAULT_LAYOUT,
): LaneLayout {
  const byStory = new Map<string, GraphNode[]>(
    storyIds.map((storyId) => [storyId, []]),
  );
  for (const node of nodes) {
    byStory.get(node.storyId)?.push(node);
  }

  const positions = new Map<string, Point>();
  const lanes: Lane[] = [];
  let top = 0;

  for (const storyId of storyIds) {
    const own = byStory.get(storyId) ?? [];

    if (own.length === 0) {
      lanes.push({ storyId, top, height: LANE_LABEL_HEIGHT });
      top += LANE_LABEL_HEIGHT + LANE_GAP;
      continue;
    }

    const left = Math.min(...own.map((node) => node.positionX));
    const highest = Math.min(...own.map((node) => node.positionY));
    const lowest = Math.max(...own.map((node) => node.positionY));
    const contentTop = top + LANE_LABEL_HEIGHT;

    for (const node of own) {
      positions.set(node.id, {
        x: node.positionX - left,
        y: node.positionY - highest + contentTop,
      });
    }

    const height = LANE_LABEL_HEIGHT + (lowest - highest) + nodeHeight;
    lanes.push({ storyId, top, height });
    top += height + LANE_GAP;
  }

  return { positions, lanes };
}

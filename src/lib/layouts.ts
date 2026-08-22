import type { LayoutKey } from "../types";

// A layout is a tree of splits. Leaves reference a pane *slot* (index into the
// project's terminal list). Adding fully custom layouts later means generating
// these trees dynamically — the renderer is already generic.
export type LayoutNode =
  | { type: "leaf"; slot: number }
  | { type: "split"; dir: "row" | "col"; children: LayoutNode[] };

export interface LayoutInfo {
  key: LayoutKey;
  label: string;
  capacity: number;
  tree: LayoutNode;
}

const leaf = (slot: number): LayoutNode => ({ type: "leaf", slot });
const row = (...children: LayoutNode[]): LayoutNode => ({
  type: "split",
  dir: "row",
  children,
});
const col = (...children: LayoutNode[]): LayoutNode => ({
  type: "split",
  dir: "col",
  children,
});

export const LAYOUTS: Record<LayoutKey, LayoutInfo> = {
  one: { key: "one", label: "Single", capacity: 1, tree: leaf(0) },
  "two-v": {
    key: "two-v",
    label: "2 · vertical split",
    capacity: 2,
    tree: row(leaf(0), leaf(1)),
  },
  "two-h": {
    key: "two-h",
    label: "2 · horizontal split",
    capacity: 2,
    tree: col(leaf(0), leaf(1)),
  },
  three: {
    key: "three",
    label: "3 columns",
    capacity: 3,
    tree: row(leaf(0), leaf(1), leaf(2)),
  },
  "grid-4": {
    key: "grid-4",
    label: "4 · grid",
    capacity: 4,
    tree: col(row(leaf(0), leaf(1)), row(leaf(2), leaf(3))),
  },
  "grid-6": {
    key: "grid-6",
    label: "6 · grid",
    capacity: 6,
    tree: col(row(leaf(0), leaf(1), leaf(2)), row(leaf(3), leaf(4), leaf(5))),
  },
  all: {
    key: "all",
    label: "All terminals",
    capacity: Infinity,
    tree: leaf(0),
  },
};

export const LAYOUT_LIST = Object.values(LAYOUTS);

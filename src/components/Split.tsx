import { useRef, useState, useCallback, useEffect, ReactNode } from "react";
import type { LayoutNode } from "../lib/layouts";
import type { LayoutSizes } from "../types";

interface SplitProps {
  node: LayoutNode;
  renderLeaf: (slot: number) => ReactNode;
  /** Stable path identifying this node within the tree (e.g. "r", "r.0"). */
  path?: string;
  /** Persisted sizes keyed by split path. */
  sizes?: LayoutSizes;
  /** Called (already debounced by parent) when a split's ratios change. */
  onResize?: (path: string, sizes: number[]) => void;
}

/** Recursive resizable split view. Draggable gutters redistribute space between
 *  adjacent children. Ratios persist per split-path via `sizes` / `onResize`. */
export function Split({
  node,
  renderLeaf,
  path = "r",
  sizes,
  onResize,
}: SplitProps) {
  if (node.type === "leaf") {
    return <>{renderLeaf(node.slot)}</>;
  }
  return (
    <SplitContainer
      node={node}
      renderLeaf={renderLeaf}
      path={path}
      sizes={sizes}
      onResize={onResize}
    />
  );
}

function SplitContainer({
  node,
  renderLeaf,
  path,
  sizes,
  onResize,
}: {
  node: Extract<LayoutNode, { type: "split" }>;
  renderLeaf: (slot: number) => ReactNode;
  path: string;
  sizes?: LayoutSizes;
  onResize?: (path: string, sizes: number[]) => void;
}) {
  const n = node.children.length;
  const containerRef = useRef<HTMLDivElement>(null);

  const even = () => new Array(n).fill(100 / n);
  const persisted = sizes?.[path];
  const [local, setLocal] = useState<number[]>(
    persisted && persisted.length === n ? persisted : even(),
  );

  // Adopt persisted sizes when they arrive/change (e.g. project switch).
  useEffect(() => {
    const p = sizes?.[path];
    if (p && p.length === n) setLocal(p);
    else setLocal(even());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizes, path, n]);

  const onGutterDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const horizontal = node.dir === "row";
      const rect = container.getBoundingClientRect();
      const total = horizontal ? rect.width : rect.height;
      const startPos = horizontal ? e.clientX : e.clientY;
      const startSizes = [...local];

      const onMove = (ev: MouseEvent) => {
        const pos = horizontal ? ev.clientX : ev.clientY;
        const deltaPct = ((pos - startPos) / total) * 100;
        const min = 8;
        let a = startSizes[index] + deltaPct;
        let b = startSizes[index + 1] - deltaPct;
        if (a < min) {
          b -= min - a;
          a = min;
        }
        if (b < min) {
          a -= min - b;
          b = min;
        }
        const next = [...startSizes];
        next[index] = a;
        next[index + 1] = b;
        setLocal(next);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setLocal((cur) => {
          onResize?.(path, cur);
          return cur;
        });
      };
      document.body.style.cursor = horizontal ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [node.dir, local, onResize, path],
  );

  return (
    <div
      ref={containerRef}
      className="split"
      style={{ flexDirection: node.dir === "row" ? "row" : "column" }}
    >
      {node.children.map((child, i) => (
        <div key={i} style={{ display: "contents" }}>
          <div className="split-child" style={{ flexBasis: `${local[i]}%` }}>
            <Split
              node={child}
              renderLeaf={renderLeaf}
              path={`${path}.${i}`}
              sizes={sizes}
              onResize={onResize}
            />
          </div>
          {i < n - 1 && (
            <div
              className={`gutter ${node.dir === "row" ? "gutter-v" : "gutter-h"}`}
              onMouseDown={(e) => onGutterDown(i, e)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

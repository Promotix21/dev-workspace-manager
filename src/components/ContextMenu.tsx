import { useEffect } from "react";

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: (MenuItem | "sep")[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keep the menu on-screen.
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - items.length * 30 - 8),
  };

  return (
    <>
      <div className="menu-backdrop" onClick={onClose} onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }} />
      <div className="context-menu" style={style}>
        {items.map((it, i) =>
          it === "sep" ? (
            <div key={i} className="context-sep" />
          ) : (
            <button
              key={i}
              className={it.danger ? "danger" : ""}
              disabled={it.disabled}
              onClick={() => {
                it.onClick();
                onClose();
              }}
            >
              {it.label}
            </button>
          ),
        )}
      </div>
    </>
  );
}

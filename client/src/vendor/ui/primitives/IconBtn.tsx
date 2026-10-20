import React from "react";
import { Icon, type IconName } from "../icons";

export function IconBtn({
  icon,
  label,
  size = 30,
  active,
  onClick,
  danger,
  disabled,
  busy,
}: {
  icon: IconName;
  label: string;
  size?: number;
  active?: boolean;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Sets aria-busy (an action triggered by this button is in flight). */
  busy?: boolean;
}) {
  const I = Icon[icon];
  const [h, setH] = React.useState(false);
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy ? true : undefined}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: size,
        height: size,
        display: "inline-grid",
        placeItems: "center",
        borderRadius: 6,
        border: "1px solid transparent",
        background: h && !disabled ? "var(--bg-hover)" : active ? "var(--bg-hover)" : "transparent",
        color: danger && h ? "var(--crit)" : active || h ? "var(--text-primary)" : "var(--text-secondary)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : undefined,
        transition: "background .12s, color .12s",
      }}
    >
      <I size={Math.round(size * 0.52)} />
    </button>
  );
}

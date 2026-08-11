"use client";

/**
 * Thin React wrappers over the element CSS classes in globals.css.
 * Interactive elements keep their Uiverse source animations.
 */
import { useEffect, useRef, useState } from "react";

/* ── push button (Uiverse.io by ke1221) ── */
export function NeuButton({
  children,
  round = false,
  pressed = false,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  round?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      {...rest}
      data-pressed={pressed || undefined}
      className={`neu-btn ${round ? "neu-btn-round" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

/* ── glow CTA button (Uiverse.io by themrsami, button part) ── */
export function GlowButton({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`glow-btn ${className}`}>
      <span>{children}</span>
    </button>
  );
}

/* ── expanding delete button (Uiverse.io by vinodjangid07) ──
   touch devices: first tap arms it (expands), second tap confirms */
export function DeleteButton({
  label,
  onDelete,
  className = "",
}: {
  label: string;
  onDelete: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function handleClick() {
    const isHoverable = window.matchMedia("(hover: hover)").matches;
    if (isHoverable || armed) {
      setArmed(false);
      onDelete();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 2500);
  }

  return (
    <button
      type="button"
      aria-label={label}
      data-label={label}
      data-armed={armed || undefined}
      onClick={handleClick}
      className={`delete-btn ${className}`}
    >
      <svg viewBox="0 0 448 512" className="delete-svg">
        <path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"></path>
      </svg>
    </button>
  );
}

/* ── bursting heart (Uiverse.io by catraco) ──
   action mode: plays the celebration then fires onLike and resets */
export function HeartButton({
  onLike,
  size = 56,
  title,
}: {
  onLike: () => void;
  size?: number;
  title?: string;
}) {
  const [checked, setChecked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function handleChange() {
    if (checked) return;
    setChecked(true);
    timer.current = setTimeout(() => {
      onLike();
      setChecked(false);
    }, 550);
  }

  return (
    <div className="heart-container" title={title} style={{ width: size, height: size }}>
      <input
        type="checkbox"
        className="heart-checkbox"
        checked={checked}
        onChange={handleChange}
        aria-label={title}
      />
      <div className="svg-container">
        <svg viewBox="0 0 24 24" className="svg-outline" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Zm-3.585,18.4a2.973,2.973,0,0,1-3.83,0C4.947,16.006,2,11.87,2,8.967a4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,11,8.967a1,1,0,0,0,2,0,4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,22,8.967C22,11.87,19.053,16.006,13.915,20.313Z"></path>
        </svg>
        <svg viewBox="0 0 24 24" className="svg-filled" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Z"></path>
        </svg>
        <svg className="svg-celebrate" width="100" height="100" xmlns="http://www.w3.org/2000/svg">
          <polygon points="10,10 20,20"></polygon>
          <polygon points="10,50 20,50"></polygon>
          <polygon points="20,80 30,70"></polygon>
          <polygon points="90,10 80,20"></polygon>
          <polygon points="90,50 80,50"></polygon>
          <polygon points="80,80 70,70"></polygon>
        </svg>
      </div>
    </div>
  );
}

/* ── rich tooltip (Uiverse.io by themrsami, tooltip part) ── */
export function RichTooltip({
  trigger,
  title,
  children,
}: {
  trigger: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative inline-block">
      {trigger}
      <div className="rich-tooltip">
        <div className="rich-tooltip-panel">
          {title && (
            <h3 className="mb-1 text-sm font-semibold text-ink">{title}</h3>
          )}
          <div className="text-xs leading-relaxed text-ink-dim">{children}</div>
          <div className="rich-tooltip-arrow"></div>
        </div>
      </div>
    </div>
  );
}

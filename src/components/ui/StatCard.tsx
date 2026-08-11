"use client";

/**
 * Stat card with SVG line chart — Uiverse.io by code-town3, retokenized and
 * fed with the user's real library growth (12 weekly points). Structure,
 * glow filter, hover tooltips and legend follow the source element.
 */
import { useMemo } from "react";
import { DotsMenu } from "./index";
import type { Swipe } from "@/lib/types";

const W = 360;
const H = 120;
const X0 = 15;
const STEP = 30;
const POINTS = 12;

export default function LibraryStatCard({
  swipes,
  title,
  legendText,
  legendSuffix,
  menuItems,
}: {
  swipes: Swipe[];
  title: string;
  legendText: string;
  legendSuffix: string;
  menuItems?: { label: string; onClick: () => void; danger?: boolean }[];
}) {
  const { pts, labels, total, likedPct } = useMemo(() => {
    const watched = swipes
      .filter((s) => s.action !== "not_seen")
      .sort((a, b) => a.at - b.at);
    const now = Date.now();
    const week = 7 * 24 * 3600 * 1000;
    const counts: number[] = [];
    const labels: string[] = [];
    for (let i = POINTS - 1; i >= 0; i--) {
      const cutoff = now - i * week;
      counts.push(watched.filter((s) => s.at <= cutoff).length);
      const d = new Date(cutoff);
      labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
    }
    const max = Math.max(...counts, 1);
    const pts = counts.map((c, i) => ({
      x: X0 + i * STEP,
      y: 100 - (c / max) * 75,
      v: c,
    }));
    const liked = watched.filter((s) => s.action === "liked").length;
    return {
      pts,
      labels,
      total: watched.length,
      likedPct: watched.length > 0 ? Math.round((liked / watched.length) * 100) : 0,
    };
  }, [swipes]);

  const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `M${polyline.split(" ").join(" L")} L${pts[pts.length - 1].x},${H} L${X0},${H} Z`;

  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <div className="stat-card-title">{title}</div>
        {menuItems && menuItems.length > 0 && (
          <DotsMenu id="stat-menu" items={menuItems} />
        )}
      </div>
      <div className="stat-card-chart" dir="ltr">
        <svg className="linechart" viewBox={`0 0 ${W} ${H}`}>
          <defs>
            <linearGradient y2="1" x2="0" y1="0" x1="0" id="lineGradient">
              <stop stopColor="#ffd43b" offset="0%"></stop>
              <stop stopColor="#ff8800" offset="100%"></stop>
            </linearGradient>
            <linearGradient y2="1" x2="0" y1="0" x1="0" id="areaGradient">
              <stop stopOpacity="0.3" stopColor="#ffd43b" offset="0%"></stop>
              <stop stopOpacity="0" stopColor="#ff8800" offset="100%"></stop>
            </linearGradient>
            <filter height="140%" width="140%" y="-20%" x="-20%" id="glow">
              <feGaussianBlur result="coloredBlur" stdDeviation="3"></feGaussianBlur>
              <feMerge>
                <feMergeNode in="coloredBlur"></feMergeNode>
                <feMergeNode in="SourceGraphic"></feMergeNode>
              </feMerge>
            </filter>
          </defs>

          <path fill="url(#areaGradient)" d={area}></path>
          <polyline
            filter="url(#glow)"
            points={polyline}
            strokeWidth="4"
            stroke="url(#lineGradient)"
            fill="none"
          ></polyline>

          {pts.map((p, i) => {
            const tipW = 70;
            const tipX = Math.min(Math.max(p.x - tipW / 2, 2), W - tipW - 2);
            const tipY = p.y > 45 ? p.y - 40 : p.y + 12;
            return (
              <g className="dot-group" key={i}>
                <circle fill="#ffd43b" r="5" cy={p.y} cx={p.x}></circle>
                <g className="tooltip">
                  <rect rx="8" height="28" width={tipW} y={tipY} x={tipX}></rect>
                  <text textAnchor="middle" y={tipY + 19} x={tipX + tipW / 2}>
                    {labels[i]}: {p.v}
                  </text>
                </g>
              </g>
            );
          })}

          <g className="x-labels">
            {pts.map((p, i) =>
              i % 3 === 0 ? (
                <text key={i} textAnchor="middle" y="115" x={p.x}>
                  {labels[i]}
                </text>
              ) : null
            )}
          </g>
        </svg>
      </div>
      <div className="stat-card-legend">
        <div className="legend-item">
          <span>{legendText}</span>
        </div>
        <div className="legend-item">
          <span>
            <span className="legend-value">{total}</span>
            <span className="legend-change">♥ {likedPct}% {legendSuffix}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

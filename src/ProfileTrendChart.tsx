import type { Run } from "./types";
import { formatTime } from "./utils";

type Point = {
  label: string;
  matched: number;
  mismatched: number;
  sourceOnly: number;
  targetOnly: number;
  at: number;
};

/** Simple SVG trend chart — no chart library dependency. */
export function ProfileTrendChart({
  runs,
  profileLabel,
}: {
  runs: Run[];
  profileLabel: string;
}) {
  const points: Point[] = runs
    .filter((run) => run.profileId)
    .map((run) => {
      const stamp = run.completedAt || run.startedAt;
      return {
        label: formatTime(stamp) || String(run.id),
        matched: run.matchedCount ?? 0,
        mismatched: run.mismatchedCount ?? 0,
        sourceOnly: run.sourceOnlyCount ?? 0,
        targetOnly: run.targetOnlyCount ?? 0,
        at: stamp ? new Date(stamp).getTime() : run.id,
      };
    })
    .sort((a, b) => a.at - b.at)
    .slice(-30);

  if (points.length === 0) {
    return <p className="empty">No profile history to chart for this selection.</p>;
  }

  const width = 760;
  const height = 220;
  const pad = { top: 20, right: 16, bottom: 36, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxY = Math.max(
    1,
    ...points.flatMap((point) => [point.matched, point.mismatched, point.sourceOnly, point.targetOnly]),
  );

  const x = (index: number) =>
    pad.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const y = (value: number) => pad.top + innerH - (value / maxY) * innerH;

  function path(key: keyof Omit<Point, "label" | "at">): string {
    return points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point[key]).toFixed(1)}`)
      .join(" ");
  }

  return (
    <div className="chart-card">
      <div className="chart-head">
        <h3 className="section-title" style={{ margin: 0 }}>
          Trend by profile · {profileLabel}
        </h3>
        <div className="chart-legend">
          <span className="leg ok">Matched</span>
          <span className="leg bad">Mismatched</span>
          <span className="leg src">Source only</span>
          <span className="leg tgt">Target only</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart" role="img" aria-label="Profile metrics over time">
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const value = Math.round(maxY * (1 - fraction));
          const yy = pad.top + innerH * fraction;
          return (
            <g key={fraction}>
              <line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} className="grid" />
              <text x={pad.left - 8} y={yy + 4} className="axis" textAnchor="end">
                {value}
              </text>
            </g>
          );
        })}
        <path d={path("matched")} className="line ok" fill="none" />
        <path d={path("mismatched")} className="line bad" fill="none" />
        <path d={path("sourceOnly")} className="line src" fill="none" />
        <path d={path("targetOnly")} className="line tgt" fill="none" />
        {points.map((point, index) => (
          <g key={`${point.at}-${index}`}>
            <circle cx={x(index)} cy={y(point.mismatched)} r={3.5} className="dot bad" />
            {(index === 0 || index === points.length - 1 || points.length <= 8) && (
              <text x={x(index)} y={height - 10} className="axis" textAnchor="middle">
                {shortLabel(point.label)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function shortLabel(value: string): string {
  if (value.length <= 12) {
    return value;
  }
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  return value.slice(0, 10);
}

"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatKrwShort, formatPercent } from "@/lib/format";

const AXIS = { fontSize: 12, fill: "#8b95a1" } as const;
const GRID = "#f2f4f6";

function ChartLegend({ items }: { items: Array<[string, string]> }) {
  return (
    <ul className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
      {items.map(([label, color]) => (
        <li key={label} className="flex items-center gap-1.5 text-[13px] text-grey-600">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </li>
      ))}
    </ul>
  );
}

function TooltipCard({
  label,
  items,
}: {
  label?: string;
  items: Array<{ name: string; color: string; text: string }>;
}) {
  return (
    <div className="rounded-xl bg-white px-3.5 py-3 shadow-float ring-1 ring-grey-100">
      <p className="text-[12px] font-semibold text-grey-500">{label}</p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item.name} className="flex items-center gap-2 text-[13px]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-grey-600">{item.name}</span>
            <span className="tnum ml-auto font-semibold text-grey-900">{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 고른 지표 하나를 그린다. 금액은 막대, 비율은 선. */
export function MetricChart({
  data,
  name,
  unit,
}: {
  data: Array<{ label: string; value: number | null }>;
  name: string;
  unit: "krw" | "percent";
}) {
  const format = (value: number) =>
    unit === "krw" ? formatKrwShort(value) : formatPercent(value);
  const color = unit === "krw" ? "#3182f6" : "#f04452";

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={unit === "krw" ? 64 : 52}
            tickFormatter={(value: number) =>
              unit === "krw" ? formatKrwShort(value) : `${value}%`
            }
          />
          <Tooltip
            cursor={
              unit === "krw"
                ? { fill: "rgba(49,130,246,0.06)" }
                : { stroke: "#d1d6db", strokeWidth: 1 }
            }
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipCard
                  label={String(label)}
                  items={payload.map((entry) => ({
                    name: String(entry.name),
                    color: String(entry.color),
                    text: typeof entry.value === "number" ? format(entry.value) : "—",
                  }))}
                />
              ) : null
            }
          />
          {unit === "krw" ? (
            <Bar
              dataKey="value"
              name={name}
              fill={color}
              radius={[6, 6, 0, 0]}
              maxBarSize={44}
            />
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              name={name}
              stroke={color}
              strokeWidth={2.5}
              connectNulls
              dot={{ r: 3, strokeWidth: 0, fill: color }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 비교 화면에서 회사마다 한 줄씩 그린다. */
export function MultiLineChart({
  data,
  series,
  unit,
}: {
  data: Array<Record<string, string | number | null>>;
  series: Array<{ key: string; name: string; color: string }>;
  unit: "krw" | "percent";
}) {
  const format = (value: number) =>
    unit === "krw" ? formatKrwShort(value) : formatPercent(value);

  return (
    <div>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              width={unit === "krw" ? 64 : 52}
              tickFormatter={(value: number) =>
                unit === "krw" ? formatKrwShort(value) : `${value}%`
              }
            />
            <Tooltip
              cursor={{ stroke: "#d1d6db", strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipCard
                    label={String(label)}
                    items={payload.map((entry) => ({
                      name: String(entry.name),
                      color: String(entry.color),
                      text: typeof entry.value === "number" ? format(entry.value) : "—",
                    }))}
                  />
                ) : null
              }
            />
            {series.map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.name}
                stroke={item.color}
                strokeWidth={2.5}
                connectNulls
                dot={{ r: 3, strokeWidth: 0, fill: item.color }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend items={series.map((item) => [item.name, item.color])} />
    </div>
  );
}

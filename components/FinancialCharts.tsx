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

export type PerformancePoint = {
  year: string;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
};

export type RatioPoint = {
  year: string;
  operatingMargin: number | null;
  netMargin: number | null;
  roe: number | null;
};

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

export function PerformanceChart({ data }: { data: PerformancePoint[] }) {
  return (
    <div>
      <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(value: number) => formatKrwShort(value)}
          />
          <Tooltip
            cursor={{ fill: "rgba(49,130,246,0.06)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipCard
                  label={String(label)}
                  items={payload.map((entry) => ({
                    name: String(entry.name),
                    color: String(entry.color),
                    text:
                      typeof entry.value === "number"
                        ? formatKrwShort(entry.value)
                        : "—",
                  }))}
                />
              ) : null
            }
          />
          <Bar
            dataKey="revenue"
            name="매출액"
            fill="#3182f6"
            radius={[6, 6, 0, 0]}
            maxBarSize={44}
          />
          <Line
            type="monotone"
            dataKey="operatingIncome"
            name="영업이익"
            stroke="#f04452"
            strokeWidth={2.5}
            dot={{ r: 3, strokeWidth: 0, fill: "#f04452" }}
          />
          <Line
            type="monotone"
            dataKey="netIncome"
            name="당기순이익"
            stroke="#b0b8c1"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={{ r: 3, strokeWidth: 0, fill: "#b0b8c1" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      <ChartLegend
        items={[
          ["매출액", "#3182f6"],
          ["영업이익", "#f04452"],
          ["당기순이익", "#b0b8c1"],
        ]}
      />
    </div>
  );
}

export function RatioChart({ data }: { data: RatioPoint[] }) {
  return (
    <div>
      <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(value: number) => `${value}%`}
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
                    text:
                      typeof entry.value === "number"
                        ? formatPercent(entry.value)
                        : "—",
                  }))}
                />
              ) : null
            }
          />
          <Line
            type="monotone"
            dataKey="operatingMargin"
            name="영업이익률"
            stroke="#3182f6"
            strokeWidth={2.5}
            dot={{ r: 3, strokeWidth: 0, fill: "#3182f6" }}
          />
          <Line
            type="monotone"
            dataKey="netMargin"
            name="순이익률"
            stroke="#f04452"
            strokeWidth={2.5}
            dot={{ r: 3, strokeWidth: 0, fill: "#f04452" }}
          />
          <Line
            type="monotone"
            dataKey="roe"
            name="ROE"
            stroke="#15803d"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={{ r: 3, strokeWidth: 0, fill: "#15803d" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      <ChartLegend
        items={[
          ["영업이익률", "#3182f6"],
          ["순이익률", "#f04452"],
          ["ROE", "#15803d"],
        ]}
      />
    </div>
  );
}

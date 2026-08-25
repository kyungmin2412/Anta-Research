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

/**
 * 기간이 많으면 축 라벨이 겹친다. 다섯 개쯤만 남기고 건너뛴다.
 * 지표 차트는 한 줄에 둘씩 놓여 폭이 좁으므로 일찍부터 솎아낸다.
 */
function tickInterval(count: number): number {
  return count > 6 ? Math.ceil(count / 5) - 1 : 0;
}

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

export type MetricPoint = {
  label: string;
  value: number | null;
  qoq?: number | null;
  yoy?: number | null;
};

/**
 * 고른 지표 하나를 그린다. 금액은 막대, 비율은 선.
 * 증감률을 켜면 오른쪽 축에 따로 겹쳐 그린다. 단위가 달라 축을 나눠야 한다.
 */
export function MetricChart({
  data,
  name,
  unit,
  growth = [],
  growthUnit = "%",
}: {
  data: MetricPoint[];
  name: string;
  unit: "krw" | "percent";
  growth?: Array<{ key: "qoq" | "yoy"; name: string; color: string }>;
  growthUnit?: string;
}) {
  const format = (value: number) =>
    unit === "krw" ? formatKrwShort(value) : formatPercent(value);
  const color = unit === "krw" ? "#3182f6" : "#f04452";
  const growthKeys = new Set(growth.map((item) => item.key as string));

  return (
    <div>
      <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            interval={tickInterval(data.length)}
          />
          <YAxis
            yAxisId="value"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={unit === "krw" ? 64 : 52}
            tickFormatter={(value: number) =>
              unit === "krw" ? formatKrwShort(value) : `${value}%`
            }
          />
          {growth.length > 0 && (
            <YAxis
              yAxisId="growth"
              orientation="right"
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(value: number) => `${value}${growthUnit}`}
            />
          )}
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
                    text:
                      typeof entry.value !== "number"
                        ? "—"
                        : growthKeys.has(String(entry.dataKey))
                          ? `${entry.value > 0 ? "+" : ""}${entry.value.toFixed(1)}${growthUnit}`
                          : format(entry.value),
                  }))}
                />
              ) : null
            }
          />
          {unit === "krw" ? (
            <Bar
              yAxisId="value"
              dataKey="value"
              name={name}
              fill={color}
              radius={[6, 6, 0, 0]}
              maxBarSize={44}
            />
          ) : (
            <Line
              yAxisId="value"
              type="monotone"
              dataKey="value"
              name={name}
              stroke={color}
              strokeWidth={2.5}
              connectNulls
              dot={{ r: 3, strokeWidth: 0, fill: color }}
            />
          )}
          {growth.map((item) => (
            <Line
              key={item.key}
              yAxisId="growth"
              type="monotone"
              dataKey={item.key}
              name={item.name}
              stroke={item.color}
              strokeWidth={2}
              strokeDasharray="4 4"
              connectNulls
              dot={{ r: 2.5, strokeWidth: 0, fill: item.color }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      {growth.length > 0 && (
        <ChartLegend
          items={[
            [name, color],
            ...growth.map((item) => [item.name, item.color] as [string, string]),
          ]}
        />
      )}
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
            <XAxis
              dataKey="label"
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              interval={tickInterval(data.length)}
            />
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

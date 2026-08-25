import Link from "next/link";
import type { Granularity } from "@/lib/finance";
import { GROWTH_COLOR, type GrowthMode } from "@/lib/growth";
import {
  METRIC_GROUPS,
  METRICS,
  metricsParam,
  type MetricKey,
} from "@/lib/metrics";

/**
 * 볼 지표를 고르는 칩 묶음.
 *
 * 고른 목록을 URL에 담아 두면 그대로 공유할 수 있고, 뒤로 가기도 자연스럽다.
 */
const GROWTH_OPTIONS: Array<{ value: GrowthMode; label: string }> = [
  { value: "off", label: "안 보기" },
  { value: "qoq", label: "QoQ" },
  { value: "yoy", label: "YoY" },
  { value: "both", label: "둘 다" },
];

export default function MetricPicker({
  selected,
  hrefFor,
  growthMode,
  growthHref,
  granularity,
}: {
  selected: MetricKey[];
  hrefFor: (keys: MetricKey[]) => string;
  growthMode: GrowthMode;
  growthHref: (mode: GrowthMode) => string;
  granularity: Granularity;
}) {
  // 연간은 직전 기간이 곧 전년이라 QoQ와 YoY가 같아진다. 켜고 끄기만 남긴다.
  const growthOptions =
    granularity === "annual"
      ? [
          { value: "off" as GrowthMode, label: "안 보기" },
          { value: "yoy" as GrowthMode, label: "전년 대비" },
        ]
      : GROWTH_OPTIONS;
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-bold text-grey-900">볼 지표 고르기</p>
        <p className="text-[13px] text-grey-500">
          {selected.length}개 선택 · 누르면 켜고 꺼집니다
        </p>
      </div>

      <div className="mt-4 space-y-3.5">
        {METRIC_GROUPS.map((group) => (
          <div key={group}>
            <p className="text-[12px] font-semibold text-grey-400">{group}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {METRICS.filter((metric) => metric.group === group).map((metric) => {
                const on = selected.includes(metric.key);
                const next = on
                  ? selected.filter((key) => key !== metric.key)
                  : [...selected, metric.key];
                return (
                  <Link
                    key={metric.key}
                    href={hrefFor(next)}
                    scroll={false}
                    title={metric.hint}
                    aria-pressed={on}
                    className={`rounded-full px-3.5 py-2 text-[14px] font-semibold transition-colors ${
                      on
                        ? "bg-blue-500 text-white hover:bg-blue-600"
                        : "bg-grey-100 text-grey-600 hover:bg-grey-200"
                    }`}
                  >
                    {metric.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-grey-100 pt-4">
        <p className="text-[12px] font-semibold text-grey-400">증감률</p>
        <div className="inline-flex rounded-xl bg-grey-100 p-1">
          {growthOptions.map((option) => {
            const on = option.value === growthMode;
            return (
              <Link
                key={option.value}
                href={growthHref(option.value)}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  on
                    ? "bg-white text-grey-900 shadow-card"
                    : "text-grey-500 hover:text-grey-700"
                }`}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
        {growthMode !== "off" && (
          <span className="flex items-center gap-3 text-[12px] text-grey-500">
            {(granularity === "annual"
              ? ([["yoy", "전년 대비"]] as const)
              : growthMode === "both"
                ? ([
                    ["qoq", "직전 분기 대비"],
                    ["yoy", "전년 동기 대비"],
                  ] as const)
                : growthMode === "qoq"
                  ? ([["qoq", "직전 분기 대비"]] as const)
                  : ([["yoy", "전년 동기 대비"]] as const)
            ).map(([kind, text]) => (
              <span key={kind} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: GROWTH_COLOR[kind] }}
                />
                {text}
              </span>
            ))}
          </span>
        )}
        {selected.length > 0 && (
          <Link
            href={hrefFor([])}
            scroll={false}
            className="ml-auto text-[13px] font-semibold text-grey-500 hover:text-grey-700"
          >
            지표 전부 끄기
          </Link>
        )}
      </div>
    </div>
  );
}

export { metricsParam };

import Link from "next/link";
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
export default function MetricPicker({
  selected,
  hrefFor,
}: {
  selected: MetricKey[];
  hrefFor: (keys: MetricKey[]) => string;
}) {
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

      {selected.length > 0 && (
        <Link
          href={hrefFor([])}
          scroll={false}
          className="mt-4 inline-block text-[13px] font-semibold text-grey-500 hover:text-grey-700"
        >
          전부 끄기
        </Link>
      )}
    </div>
  );
}

export { metricsParam };

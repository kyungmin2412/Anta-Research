import type { ReactNode } from "react";
import Link from "next/link";

/** 토스식 세그먼티드 컨트롤. 선택지가 URL을 바꾸므로 링크로 만든다. */
export function SegmentedTabs({
  options,
  active,
}: {
  options: Array<{ label: string; href: string; value: string }>;
  active: string;
}) {
  return (
    <div className="inline-flex rounded-xl bg-grey-100 p-1">
      {options.map((option) => {
        const selected = option.value === active;
        return (
          <Link
            key={option.value}
            href={option.href}
            scroll={false}
            aria-current={selected ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-[14px] font-semibold transition-colors ${
              selected
                ? "bg-white text-grey-900 shadow-card"
                : "text-grey-500 hover:text-grey-700"
            }`}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}

export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-end justify-between gap-4 px-1">
        <div>
          <h2 className="text-[19px] font-bold text-grey-900">{title}</h2>
          {description && (
            <p className="mt-1 text-[13px] text-grey-500">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "up" | "down";
}) {
  const valueColor =
    tone === "up" ? "text-red-500" : tone === "down" ? "text-blue-500" : "text-grey-900";
  return (
    <div className="card p-5">
      <p className="text-[13px] font-medium break-keep text-grey-500">{label}</p>
      <p className={`tnum mt-2 text-[19px] font-bold break-keep sm:text-[22px] ${valueColor}`}>
        {value}
      </p>
      {sub && <p className="tnum mt-1 text-[13px] break-keep text-grey-500">{sub}</p>}
    </div>
  );
}

export function DeltaBadge({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span
      className={`tnum inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${
        up ? "bg-red-100 text-red-500" : "bg-blue-100 text-blue-600"
      }`}
    >
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="card px-5 py-10 text-center text-[14px] text-grey-500">{message}</div>
  );
}

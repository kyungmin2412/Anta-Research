function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-grey-100 ${className}`} />;
}

export default function Loading() {
  return (
    <div className="pt-12">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-5 h-6 w-24" />
      <Skeleton className="mt-4 h-10 w-56" />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="card p-5">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="mt-3 h-6 w-24" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
        ))}
      </div>

      <div className="card mt-10 p-5">
        <Skeleton className="h-[280px] w-full" />
      </div>
    </div>
  );
}

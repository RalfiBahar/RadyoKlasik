import { BASE_PATH } from "@/lib/basePath";

// The listener website's logo, with an optional caption under it.
export default function Logo({ caption, className = "h-10" }: { caption?: string; className?: string }) {
  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${BASE_PATH}/logo.svg`} alt="Radyo Klasik" className={`${className} w-auto`} />
      {caption && (
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{caption}</div>
      )}
    </div>
  );
}

import clsx from "clsx";

export default function LoadingSpinner({ fullScreen, size = "md", className }) {
  const sizes = { sm: "w-4 h-4", md: "w-8 h-8", lg: "w-12 h-12" };
  const spinner = (
    <div className={clsx("animate-spin rounded-full border-2 border-dark-600 border-t-primary-500", sizes[size], className)} />
  );
  if (fullScreen) return (
    <div className="fixed inset-0 bg-dark-950 flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 animate-spin rounded-full border-2 border-dark-600 border-t-primary-500" />
        <p className="text-dark-400 text-sm">Đang tải...</p>
      </div>
    </div>
  );
  return spinner;
}

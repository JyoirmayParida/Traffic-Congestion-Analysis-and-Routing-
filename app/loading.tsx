export default function Loading() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center space-y-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
        <p className="text-sm font-medium text-slate-600">Loading traffic data...</p>
      </div>
    </div>
  );
}

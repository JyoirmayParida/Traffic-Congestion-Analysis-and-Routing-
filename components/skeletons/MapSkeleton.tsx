import { Loader2 } from 'lucide-react';

export default function MapSkeleton() {
  return (
    <div className="w-full h-full bg-slate-100 animate-pulse flex items-center justify-center border-b md:border-b-0 border-slate-200">
      <div className="flex flex-col items-center space-y-4 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-sm font-medium">Loading map data from edge cache...</p>
      </div>
    </div>
  );
}

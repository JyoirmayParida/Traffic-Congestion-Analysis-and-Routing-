import { Navigation } from 'lucide-react';

export default function PanelSkeleton() {
  return (
    <div className="w-full h-full bg-white flex flex-col p-6 border-l border-slate-200">
      <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
        <Navigation className="w-5 h-5 mr-2 text-indigo-600" />
        Route Planner
      </h2>
      
      <div className="space-y-3 mb-6 animate-pulse">
        <div className="h-12 bg-slate-100 rounded-lg w-full" />
        <div className="h-12 bg-slate-100 rounded-lg w-full" />
      </div>

      <div className="flex gap-3 animate-pulse">
        <div className="h-10 w-20 bg-slate-100 rounded-lg" />
        <div className="h-10 flex-1 bg-slate-100 rounded-lg" />
      </div>

      <div className="mt-8 flex-1 flex items-center justify-center text-slate-400 text-sm">
        Select a source and destination on the map to find the optimal route.
      </div>
    </div>
  );
}

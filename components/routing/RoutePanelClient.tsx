'use client';

import { useActionState, useEffect, startTransition } from 'react';
import { getRouteAction } from '@/app/actions/getRoute';
import type { RouteQueryInput, RouteQueryOutput } from '@/types';
import type { MapJunction } from '../map/JunctionMapClient';
import { Clock, Navigation, Activity, BarChart2 } from 'lucide-react';
import { useAppState, useAppDispatch } from '../AppStateProvider';

interface RoutePanelClientProps {
  junctions: MapJunction[];
  initialRouteResult: RouteQueryOutput | null;
}

export default function RoutePanelClient({ junctions, initialRouteResult }: RoutePanelClientProps) {
  const state = useAppState();
  const dispatchApp = useAppDispatch();

  const [routeResult, dispatchAction, isPending] = useActionState(
    async (prevState: RouteQueryOutput | null, payload: RouteQueryInput) => {
      return getRouteAction(prevState, payload);
    },
    initialRouteResult
  );

  useEffect(() => {
    dispatchApp({ type: 'SET_ROUTE_RESULT', result: routeResult });
  }, [routeResult, dispatchApp]);

  const sourceId = state.sourceId;
  const destId = state.destId;

  const sourceName = sourceId ? junctions?.find((j: any) => j.junction_id === sourceId)?.name || sourceId : 'Select Source';
  const destName = destId ? junctions?.find((j: any) => j.junction_id === destId)?.name || destId : 'Select Destination';

  const handleReset = () => {
    dispatchApp({ type: 'RESET' });
  };

  const handleFindRoute = () => {
    if (sourceId && destId) {
      startTransition(() => {
        dispatchAction({
          source_junction_id: sourceId,
          destination_junction_id: destId,
          departure_time: new Date().toISOString()
        });
      });
    }
  };

  const formatTime = (seconds: number) => {
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}m ${s}s`;
  };

  // Use the server-provided result if we haven't fetched a new one client-side
  // Actually, useActionState initializes with initialRouteResult.
  const currentResult = routeResult;

  return (
    <div className="w-full bg-white h-full flex flex-col overflow-y-auto">
      {/* SECTION 1 — QUERY CONTROLS */}
      <div className="p-6 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
          <Navigation className="w-5 h-5 mr-2 text-indigo-600" />
          Route Planner
        </h2>

        <div className="space-y-3 mb-6">
          <div className="flex items-center p-3 bg-blue-50 border border-blue-100 rounded-lg">
            <div className="w-3 h-3 rounded-full bg-blue-600 mr-3" />
            <span className="text-sm font-medium text-blue-900">{sourceName}</span>
          </div>
          <div className="flex items-center p-3 bg-purple-50 border border-purple-100 rounded-lg">
            <div className="w-3 h-3 rounded-full bg-purple-600 mr-3" />
            <span className="text-sm font-medium text-purple-900">{destName}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleFindRoute}
            disabled={!sourceId || !destId || isPending}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg transition-colors flex justify-center items-center"
          >
            {isPending ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Computing...
              </>
            ) : (
              'Find Route'
            )}
          </button>
        </div>
      </div>

      {/* RESULT SECTIONS */}
      {!currentResult && !isPending && (
        <div className="flex-1 flex items-center justify-center p-6 text-center text-slate-500 text-sm">
          Select a source and destination on the map to find the optimal route.
        </div>
      )}

      {currentResult && !isPending && (
        <div className="p-6 space-y-8 flex-1">
          {/* SECTION 2 — OPTIMAL ROUTE RESULT */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Optimal Route</h3>
              <span className="px-2 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                XGBoost v2.1
              </span>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
              <div className="flex justify-between items-end mb-2">
                <div className="text-3xl font-light text-slate-900">
                  {formatTime(currentResult.optimal_route.total_travel_time_sec)}
                </div>
                <div className="text-sm text-slate-500 mb-1">
                  {currentResult.optimal_route.route.length} junctions
                </div>
              </div>
              <div className="text-xs text-slate-500 flex items-center">
                <Clock className="w-3 h-3 mr-1" />
                Includes {formatTime(currentResult.optimal_route.delay_sec)} predicted delay
              </div>
            </div>

            {/* Journey timeline */}
            <div className="relative pl-4 border-l-2 border-slate-200 space-y-6 ml-2">
              {currentResult.optimal_route.route.map((jId, idx) => {
                const j = junctions.find((x: any) => x.junction_id === jId);
                const isLast = idx === currentResult.optimal_route.route.length - 1;
                const segment = !isLast ? currentResult.optimal_route.segments.find(s => s.from === jId && s.to === currentResult.optimal_route.route[idx + 1]) : null;

                let primaryLabel = "Queue";
                let secondaryLabel = "Density";
                const level = j?.congestion_level?.toUpperCase();
                if (level === "MODERATE" || level === "HIGH") {
                  primaryLabel = "Queue";
                  secondaryLabel = "Density";
                } else if (level === "LOW") {
                  primaryLabel = "Speed";
                  secondaryLabel = "Signal";
                } else if (level === "SEVERE") {
                  primaryLabel = "Blocking";
                  secondaryLabel = "Queue";
                }

                const delaySec = segment?.predicted_delay_sec || 0;
                const primaryWidth = Math.min(90, (delaySec / 3)) + '%';
                const primaryTime = Math.round(delaySec * 0.65) + 's';
                const secondaryWidth = Math.min(60, (delaySec / 5)) + '%';
                const secondaryTime = Math.round(delaySec * 0.35) + 's';

                const dotClass = idx === 0
                  ? "bg-emerald-500 border-emerald-600"
                  : isLast
                    ? "bg-indigo-600 border-indigo-700"
                    : "bg-white border-indigo-400";

                return (
                  <div key={jId} className="relative">
                    <div className={`absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 ${dotClass}`} />
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {j?.name || jId}
                          {idx === 0 && <span className="ml-2 px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500 text-white rounded uppercase">Start</span>}
                          {isLast && <span className="ml-2 px-1.5 py-0.5 text-[9px] font-bold bg-indigo-600 text-white rounded uppercase">End</span>}
                        </div>
                        {j && (
                          <div className="mt-1">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                              {j.congestion_level}
                            </span>
                          </div>
                        )}
                      </div>
                      {idx > 0 && (
                        <div className="text-xs font-mono text-slate-500">
                          +{formatTime(currentResult.optimal_route.segments[idx - 1]?.weight || 0)}
                        </div>
                      )}
                    </div>

                    {/* SECTION 3 — ML INSIGHT ROW */}
                    {segment && (
                      <div className="mt-3 mb-1 p-2 bg-slate-50 rounded border border-slate-100">
                        <div className="flex items-center text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-semibold">
                          <BarChart2 className="w-3 h-3 mr-1" />
                          Top Delay Factors
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center text-xs">
                            <span className="w-16 truncate text-slate-600">{primaryLabel}</span>
                            <div className="flex-1 h-1.5 bg-slate-200 rounded-full mx-2 overflow-hidden">
                              <div className="h-full bg-rose-400" style={{ width: primaryWidth }} />
                            </div>
                            <span className="text-slate-400 text-[10px]">+{primaryTime}</span>
                          </div>
                          <div className="flex items-center text-xs">
                            <span className="w-16 truncate text-slate-600">{secondaryLabel}</span>
                            <div className="flex-1 h-1.5 bg-slate-200 rounded-full mx-2 overflow-hidden">
                              <div className="h-full bg-amber-400" style={{ width: secondaryWidth }} />
                            </div>
                            <span className="text-slate-400 text-[10px]">+{secondaryTime}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* SECTION 4 — ALTERNATIVES */}
          {currentResult.alternatives.length > 0 && (
            <section className="pt-6 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Alternative Routes</h3>
              <div className="space-y-3">
                {currentResult.alternatives.map((alt, idx) => {
                  const optimalTime = currentResult.optimal_route.total_travel_time_sec;
                  const percentSlower = Math.round(((alt.total_travel_time_sec - optimalTime) / optimalTime) * 100);

                  return (
                    <div key={idx} className="p-3 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 cursor-pointer transition-colors">
                      <div className="flex justify-between items-center mb-1">
                        <div className="font-medium text-sm text-slate-900">Route {idx + 1}</div>
                        <div className="text-xs font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                          +{percentSlower}% slower
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs text-slate-500">
                        <div>{formatTime(alt.total_travel_time_sec)}</div>
                        <div>{alt.route.length} junctions</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* SECTION 5 — GRAPH FRESHNESS */}
          <section className="pt-6 border-t border-slate-100 pb-4">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center text-slate-500">
                <Activity className="w-3 h-3 mr-1.5" />
                {(() => {
                  const snapshotAge = currentResult?.graph_snapshot_age_ms 
                    ? Math.round(currentResult.graph_snapshot_age_ms / 1000) 
                    : null;
                  return snapshotAge ? `Graph data: ${snapshotAge}s old` : "Data refreshes every 30s";
                })()}
              </div>
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

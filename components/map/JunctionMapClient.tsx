'use client';

import React, { useMemo, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline, ZoomControl, Marker } from 'react-leaflet';
import L from 'leaflet';
import type { Junction, Edge, RouteQueryOutput, CongestionLevel } from '@/types';
import { useAppState, useAppDispatch } from '../AppStateProvider';

const CONGESTION_COLORS: Record<CongestionLevel, string> = {
  LOW: '#22c55e',
  MODERATE: '#f59e0b',
  HIGH: '#ef4444',
  SEVERE: '#7f1d1d',
};

export type MapJunction = Junction & {
  junction_id?: string;
  lat?: number;
  lng?: number;
  city: string;
  congestion_level: CongestionLevel;
  current_delay_sec: number;
};

interface Props {
  junctions: MapJunction[];
  edges: Edge[];
  initialRoute: RouteQueryOutput | null;
  sourceId?: string | null;
  destId?: string | null;
  onJunctionClick?: (id: string) => void;
}

export default function JunctionMapClient({ junctions, edges, initialRoute, onJunctionClick }: Props) {
  const { sourceId, destId } = useAppState();
  const dispatch = useAppDispatch();

  // Helper setters to match requested destructuring style
  const setSourceId = (id: string | null) => {
    if (id) dispatch({ type: 'SELECT_SOURCE', id });
    else dispatch({ type: 'RESET' });
  };
  
  const setDestId = (id: string | null) => {
    if (id) dispatch({ type: 'SELECT_DEST', id });
    else if (sourceId) dispatch({ type: 'SELECT_SOURCE', id: sourceId });
  };

  const handleJunctionClick = (junction_id: string) => {
    if (onJunctionClick) onJunctionClick(junction_id);

    if (!sourceId) {
      setSourceId(junction_id);
    } else if (!destId && junction_id !== sourceId) {
      setDestId(junction_id);
    } else if (junction_id === sourceId) {
      setSourceId(null);
    } else if (junction_id === destId) {
      setDestId(null);
    } else {
      setSourceId(junction_id);
    }
  };

  const routeResult = initialRoute;
  const [selectedAltIdx, setSelectedAltIdx] = useState<number | null>(null);

  // Helper getters for currently selected routes
  const activeRoute = selectedAltIdx !== null && routeResult?.alternatives ? routeResult.alternatives[selectedAltIdx] : routeResult?.optimal_route;
  
  // Custom marker icons
  const createDivIcon = (label: string, bgColor: string) => {
    return new L.DivIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: ${bgColor}; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); font-size: 14px;">${label}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  };

  const mapOverlays = useMemo(() => {
    const overlays: React.ReactNode[] = [];

    // 1. Draw base edges
    edges.forEach((edge) => {
      const source = junctions.find((j: any) => j.junction_id === edge.source_id);
      const dest = junctions.find((j: any) => j.junction_id === edge.destination_id);
      if (!source || !dest) return;

      const destCongestion = dest.congestion_level || 'LOW';
      const color = CONGESTION_COLORS[destCongestion as CongestionLevel];

      const isOptimal = routeResult?.optimal_route?.segments.some(
        (s: any) => s.from === edge.source_id && s.to === edge.destination_id
      );
      const isAlternative = routeResult?.alternatives?.some(
        (alt: any) => alt.segments.some((s: any) => s.from === edge.source_id && s.to === edge.destination_id)
      );

      // Skip drawing base edge if it is part of ANY route (so we don't overlap base with highlighted routes)
      if (isOptimal || isAlternative) return;

      overlays.push(
        <Polyline
          key={`base-${edge.id}`}
          positions={[[source.lat || 0, source.lng || 0], [dest.lat || 0, dest.lng || 0]]}
          pathOptions={{
            color,
            weight: 2,
          }}
        />
      );
    });

    if (!routeResult || !activeRoute) return overlays;

    // 2. Draw non-selected alternative routes
    routeResult.alternatives?.forEach((alt: any, idx: number) => {
      if (selectedAltIdx === idx) return; // This is the active one, draw it as "optimal"

      const positions = alt.route.map((jId: string) => {
        const j = junctions.find((x: any) => x.junction_id === jId);
        return [j?.lat || 0, j?.lng || 0] as [number, number];
      });

      // White outline
      overlays.push(
        <Polyline
          key={`alt-outline-${idx}`}
          positions={positions}
          pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.5 }}
        />
      );

      // Light blue inner
      overlays.push(
        <Polyline
          key={`alt-${idx}`}
          positions={positions}
          pathOptions={{ color: '#93c5fd', weight: 5, opacity: 0.75 }}
          eventHandlers={{
            click: () => setSelectedAltIdx(idx),
          }}
        />
      );

      const midIndex = Math.floor(positions.length / 2);
      if (positions[midIndex]) {
        const midPos = positions[midIndex];
        const totalTime = Math.round(alt.total_travel_time_sec);
        const m = Math.floor(totalTime / 60);
        const s = totalTime % 60;
        
        const optimalTime = routeResult.optimal_route?.total_travel_time_sec || 1;
        const percentSlower = Math.round(((alt.total_travel_time_sec - optimalTime) / optimalTime) * 100);

        overlays.push(
          <CircleMarker key={`alt-label-${idx}`} center={midPos} radius={0} pathOptions={{ opacity: 0, fillOpacity: 0 }}>
            <Tooltip permanent direction="top" className="font-semibold text-sm bg-white border border-slate-200 shadow-md rounded-lg px-2 py-1" opacity={0.9}>
              {m}m {s}s &middot; +{percentSlower}%
            </Tooltip>
          </CircleMarker>
        );
      }
    });

    // 3. Draw active/highlighted route (either true optimal or selected alternative)
    if (activeRoute) {
      const positions = activeRoute.route.map((jId: string) => {
        const j = junctions.find((x: any) => x.junction_id === jId);
        return [j?.lat || 0, j?.lng || 0] as [number, number];
      });

      // White outline (rendered first so it's underneath)
      overlays.push(
        <Polyline
          key="optimal-outline"
          positions={positions}
          pathOptions={{ color: '#ffffff', weight: 11, opacity: 0.6 }}
        />
      );

      // Dark blue inner
      overlays.push(
        <Polyline
          key="optimal"
          positions={positions}
          className="animated-route-path"
          pathOptions={{ color: '#1d4ed8', weight: 7, opacity: 1.0 }}
        />
      );

      // Midpoint label
      const midIndex = Math.floor(positions.length / 2);
      if (positions[midIndex]) {
        const midPos = positions[midIndex];
        const totalTime = Math.round(activeRoute.total_travel_time_sec);
        const m = Math.floor(totalTime / 60);
        const s = totalTime % 60;
        overlays.push(
          <CircleMarker key="optimal-label" center={midPos} radius={0} pathOptions={{ opacity: 0, fillOpacity: 0 }}>
            <Tooltip permanent direction="top" className="font-semibold text-sm text-slate-800 bg-white border border-slate-200 shadow-md rounded-lg px-2 py-1" opacity={1}>
              {m}m {s}s
            </Tooltip>
          </CircleMarker>
        );
      }
    }

    return overlays;
  }, [junctions, edges, routeResult, activeRoute, selectedAltIdx]);

  return (
    <div className="w-full h-full min-h-[500px] relative">
      <style>{`
        .animated-route-path {
          animation: routeDash 1s linear infinite;
        }
        @keyframes routeDash {
          to {
            stroke-dashoffset: -15;
          }
        }
      `}</style>
      <MapContainer
        center={[20.2961, 85.8245]} // Center on Bhubaneswar
        zoom={13}
        style={{ height: '100%', width: '100%', zIndex: 0 }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomControl position="topright" />

        {mapOverlays}

        {junctions.map((j: any) => {
          const isSource = j.junction_id === sourceId;
          const isDest = j.junction_id === destId;
          const baseColor = CONGESTION_COLORS[j.congestion_level as CongestionLevel] || CONGESTION_COLORS.LOW;

          let color = baseColor;
          let fillColor = baseColor;
          let weight = 1;
          const delayRadius = 10 + Math.min(20, ((j.current_delay_sec || 0) / 30));
          let radius = delayRadius;

          if (isSource) {
            return (
              <Marker
                key={j.junction_id}
                position={[j.lat || 0, j.lng || 0]}
                icon={createDivIcon('A', '#10b981')} // emerald-500
                eventHandlers={{
                  click: () => handleJunctionClick(j.junction_id),
                }}
              >
                <Tooltip>
                  <div className="font-sans">
                    <div className="font-bold text-sm text-slate-900">{j.name}</div>
                    <div className="mt-1">
                      <span className="inline-block px-2 py-1 text-[10px] font-bold text-white rounded" style={{ backgroundColor: baseColor }}>
                        {j.congestion_level}
                      </span>
                    </div>
                  </div>
                </Tooltip>
              </Marker>
            );
          }

          if (isDest) {
            return (
              <Marker
                key={j.junction_id}
                position={[j.lat || 0, j.lng || 0]}
                icon={createDivIcon('B', '#4f46e5')} // indigo-600
                eventHandlers={{
                  click: () => handleJunctionClick(j.junction_id),
                }}
              >
                <Tooltip>
                  <div className="font-sans">
                    <div className="font-bold text-sm text-slate-900">{j.name}</div>
                    <div className="mt-1">
                      <span className="inline-block px-2 py-1 text-[10px] font-bold text-white rounded" style={{ backgroundColor: baseColor }}>
                        {j.congestion_level}
                      </span>
                    </div>
                  </div>
                </Tooltip>
              </Marker>
            );
          }

          return (
            <React.Fragment key={j.junction_id}>
              {/* Heatmap Glow */}
              <CircleMarker
                center={[j.lat || 0, j.lng || 0]}
                radius={delayRadius + 8}
                pathOptions={{
                  fillColor: baseColor,
                  fillOpacity: 0.15,
                  stroke: false,
                }}
              />

              <CircleMarker
                center={[j.lat || 0, j.lng || 0]}
                radius={radius}
                pathOptions={{
                  fillColor,
                  fillOpacity: 1,
                  color,
                  weight,
                }}
                eventHandlers={{
                  click: () => handleJunctionClick(j.junction_id),
                }}
              >
                <Tooltip>
                  <div className="font-sans">
                    <div className="font-bold text-sm text-slate-900">{j.name}</div>
                    <div className="mt-1">
                      <span
                        className="inline-block px-2 py-1 text-[10px] font-bold text-white rounded"
                        style={{ backgroundColor: baseColor }}
                      >
                        {j.congestion_level}
                      </span>
                    </div>
                  </div>
                </Tooltip>
              </CircleMarker>
            </React.Fragment>
          );
        })}
      </MapContainer>

      <div className="absolute bottom-4 left-4 z-[1000] bg-white p-3 rounded-lg shadow-md border border-slate-200">
        <h4 className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">Congestion</h4>
        <div className="space-y-1.5">
          {Object.entries(CONGESTION_COLORS).map(([level, color]) => (
            <div key={level} className="flex items-center text-xs text-slate-600">
              <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: color }} />
              {level}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

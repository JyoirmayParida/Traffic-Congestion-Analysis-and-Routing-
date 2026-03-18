'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Car, Route, Gauge, Zap, Clock, Signal, Sun, CloudRain, ChevronRight, ChevronLeft, RefreshCw, X } from 'lucide-react';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Junction, TrafficSnapshot, CongestionLevel, FeatureVector } from '@/types';
import { predictCongestionDelayAction } from '@/app/actions/predict';
import { useAppDispatch } from '../AppStateProvider';

interface Props {
  junction: Junction | null;
  snapshot: TrafficSnapshot | null;
  onSimulateResult: (delay: number, level: CongestionLevel) => void;
}

const MAX_EXPECTED = {
  vehicle_count: 500,
  queue_length: 800,
  traffic_density: 300,
  avg_speed: 60,
  waiting_time: 600,
  green_signal_ratio: 1.0,
};

const CONGESTION_COLORS: Record<CongestionLevel, string> = {
  LOW: 'bg-emerald-500',
  MODERATE: 'bg-amber-500',
  HIGH: 'bg-rose-500',
  SEVERE: 'bg-red-900',
};

const CONGESTION_TEXT_COLORS: Record<CongestionLevel, string> = {
  LOW: 'text-emerald-500',
  MODERATE: 'text-amber-500',
  HIGH: 'text-rose-500',
  SEVERE: 'text-red-900',
};

// Simple hook for debouncing
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 500;
    
    // Use a local variable to capture the current displayValue at the start of the effect
    let currentDisplayValue = displayValue;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // easeOutQuart
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(Math.floor(currentDisplayValue + (value - currentDisplayValue) * easeProgress));
      
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
      }
    };

    const animationId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(animationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span>{displayValue}</span>;
}

export default function FeatureInspector({ junction, snapshot: initialSnapshot, onSimulateResult }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [snapshot, setSnapshot] = useState<TrafficSnapshot | null>(initialSnapshot);
  const [simulatedFeatures, setSimulatedFeatures] = useState<FeatureVector | null>(null);
  const [predictedDelay, setPredictedDelay] = useState<number | null>(null);
  const [predictedLevel, setPredictedLevel] = useState<CongestionLevel | null>(null);

  const debouncedFeatures = useDebounce(simulatedFeatures, 400);

  const [liveDelay, setLiveDelay] = useState<number>(0);
  const [liveLevel, setLiveLevel] = useState<CongestionLevel>('LOW');

  // Firestore subscription
  useEffect(() => {
    if (!junction) {
      return;
    }

    const q = query(
      collection(db, 'snapshots'),
      where('junction_id', '==', junction.id),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        const data = doc.data() as TrafficSnapshot;
        setSnapshot(data);
        
        // Predict for live data
        predictCongestionDelayAction(data.features).then(result => {
          setLiveDelay(result.delay_sec);
          setLiveLevel(result.level);
        });
      } else {
        // Fallback mock if no data in DB
        const mockFeatures: FeatureVector = [150, 200, 50, 45, 120, 0.8, false, false];
        setSnapshot({
          id: `snap-${junction.id}`,
          junction_id: junction.id,
          timestamp: new Date().toISOString(),
          features: mockFeatures
        });
        predictCongestionDelayAction(mockFeatures).then(result => {
          setLiveDelay(result.delay_sec);
          setLiveLevel(result.level);
        });
      }
    }, (error) => {
      console.error('Firestore Error: ', error);
    });

    return () => unsubscribe();
  }, [junction]);

  // Run prediction when debounced features change
  useEffect(() => {
    if (isSimulating && debouncedFeatures) {
      predictCongestionDelayAction(debouncedFeatures).then(result => {
        setPredictedDelay(result.delay_sec);
        setPredictedLevel(result.level);
        onSimulateResult(result.delay_sec, result.level);
      });
    }
  }, [debouncedFeatures, isSimulating, onSimulateResult]);

  const [isSimulateExpanded, setIsSimulateExpanded] = useState(false);
  const dispatch = useAppDispatch();

  if (!junction || !snapshot) {
    return null;
  }

  const activeFeatures = isSimulating && simulatedFeatures ? simulatedFeatures : snapshot.features;

  const [
    vehicle_count,
    queue_length,
    traffic_density,
    avg_speed,
    waiting_time,
    green_signal_ratio,
    monsoon_active,
    peak_hour
  ] = activeFeatures;

  const handleReset = () => {
    setIsSimulating(false);
    setSimulatedFeatures([...snapshot.features] as FeatureVector);
    setPredictedDelay(null);
    setPredictedLevel(null);
  };

  const updateFeature = (index: number, value: number | boolean) => {
    if (!isSimulating) {
      setIsSimulating(true);
    }
    setSimulatedFeatures(prev => {
      const baseFeatures = prev || (snapshot ? [...snapshot.features] : null);
      if (!baseFeatures) return prev;
      const next = [...baseFeatures] as FeatureVector;
      (next as any)[index] = value;
      return next;
    });
  };

  // Mock SHAP values based on current features
  const shapValues = [
    { name: 'Traffic Density', value: (traffic_density / MAX_EXPECTED.traffic_density) * 40 },
    { name: 'Vehicle Count', value: (vehicle_count / MAX_EXPECTED.vehicle_count) * 30 },
    { name: 'Waiting Time', value: (waiting_time / MAX_EXPECTED.waiting_time) * 20 },
  ].sort((a, b) => b.value - a.value);

  const displayDelay = isSimulating && predictedDelay !== null ? predictedDelay : liveDelay;
  const displayLevel = isSimulating && predictedLevel !== null ? predictedLevel : liveLevel;

  return (
    <div className={`fixed right-0 top-0 h-full bg-white shadow-2xl border-l border-slate-200 transition-all duration-300 z-[2000] flex ${isOpen ? 'w-full md:w-[400px]' : 'w-0'}`}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -left-10 top-1/2 -translate-y-1/2 bg-white p-2 rounded-l-xl shadow-md border-y border-l border-slate-200"
      >
        {isOpen ? <ChevronRight className="w-5 h-5 text-slate-600" /> : <ChevronLeft className="w-5 h-5 text-slate-600" />}
      </button>

      <div className="flex-1 flex flex-col h-full overflow-hidden w-full md:w-[400px]">
        {/* HEADER */}
        <div className="p-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold text-slate-900 truncate pr-4">{junction.name}</h2>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider rounded border border-indigo-100">
                Tier 1
              </span>
              <button 
                onClick={() => dispatch({ type: 'INSPECT_JUNCTION', id: null })}
                className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-500">{junction.id} • {(junction as any).city || 'Bhubaneswar'}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* PREDICTED DELAY BOX */}
          <div className="bg-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500 rounded-full blur-[60px] opacity-20 -mr-10 -mt-10" />
            
            <div className="flex justify-between items-start mb-6 relative z-10">
              <div>
                <div className="text-sm text-slate-400 font-medium mb-1 uppercase tracking-wider">Predicted Delay</div>
                <div className="text-5xl font-light tracking-tight">
                  <AnimatedNumber value={displayDelay} /><span className="text-2xl text-slate-500 ml-1">s</span>
                </div>
              </div>
              <div className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${CONGESTION_COLORS[displayLevel as CongestionLevel]} text-white shadow-sm`}>
                {displayLevel}
              </div>
            </div>

            <div className="space-y-3 relative z-10">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Top Contributing Factors</div>
              {shapValues.map((shap, i) => (
                <div key={i} className="flex items-center text-xs">
                  <span className="w-24 truncate text-slate-300">{shap.name}</span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full mx-3 overflow-hidden">
                    <motion.div 
                      className="h-full bg-indigo-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, shap.value)}%` }}
                      transition={{ type: 'spring', stiffness: 50, damping: 15 }}
                    />
                  </div>
                  <span className="text-slate-400 w-8 text-right">+{Math.round(shap.value)}s</span>
                </div>
              ))}
            </div>
          </div>

          {/* FEATURE GRID */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Live Features</h3>
              {isSimulating && (
                <span className="flex items-center text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse" />
                  Simulation Mode
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <FeatureCard 
                icon={<Car className="w-4 h-4" />} 
                label="Vehicle Count" 
                value={vehicle_count} 
                unit="" 
                max={MAX_EXPECTED.vehicle_count} 
              />
              <FeatureCard 
                icon={<Route className="w-4 h-4" />} 
                label="Queue Length" 
                value={queue_length} 
                unit="m" 
                max={MAX_EXPECTED.queue_length} 
              />
              <FeatureCard 
                icon={<Gauge className="w-4 h-4" />} 
                label="Traffic Density" 
                value={traffic_density} 
                unit="veh/km" 
                max={MAX_EXPECTED.traffic_density} 
              />
              <FeatureCard 
                icon={<Zap className="w-4 h-4" />} 
                label="Average Speed" 
                value={avg_speed} 
                unit="km/h" 
                max={MAX_EXPECTED.avg_speed} 
              />
              <FeatureCard 
                icon={<Clock className="w-4 h-4" />} 
                label="Waiting Time" 
                value={waiting_time} 
                unit="s" 
                max={MAX_EXPECTED.waiting_time} 
              />
              <FeatureCard 
                icon={<Signal className="w-4 h-4" />} 
                label="Green Signal" 
                value={green_signal_ratio} 
                unit=" ratio" 
                max={MAX_EXPECTED.green_signal_ratio} 
              />
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-between">
                <div className="flex items-center text-slate-500 mb-2">
                  <Sun className="w-4 h-4 mr-2" />
                  <span className="text-xs font-medium">Peak Hour</span>
                </div>
                <div className={`text-xs font-bold px-2 py-1 rounded w-fit ${peak_hour ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>
                  {peak_hour ? 'ACTIVE' : 'INACTIVE'}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col justify-between">
                <div className="flex items-center text-slate-500 mb-2">
                  <CloudRain className="w-4 h-4 mr-2" />
                  <span className="text-xs font-medium">Monsoon</span>
                </div>
                <div className={`text-xs font-bold px-2 py-1 rounded w-fit ${monsoon_active ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                  {monsoon_active ? 'ACTIVE' : 'INACTIVE'}
                </div>
              </div>
            </div>
          </div>

          {/* SIMULATE PANEL */}
          <div className="pt-2 border-t border-slate-100">
            <button 
              onClick={() => setIsSimulateExpanded(!isSimulateExpanded)}
              className="w-full flex items-center justify-between py-4 group"
            >
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider group-hover:text-indigo-600 transition-colors">Simulation Controls</h3>
              <div className="flex items-center">
                {isSimulating && (
                  <span className="mr-3 flex items-center text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse" />
                    Active
                  </span>
                )}
                <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isSimulateExpanded ? 'rotate-90' : ''}`} />
              </div>
            </button>

            <AnimatePresence>
              {isSimulateExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pb-6 pt-2 space-y-5">
                    {isSimulating && (
                      <div className="flex justify-end mb-2">
                        <button 
                          onClick={handleReset}
                          className="flex items-center text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors bg-slate-100 px-3 py-1.5 rounded-lg"
                        >
                          <RefreshCw className="w-3 h-3 mr-1.5" />
                          Reset to Live Data
                        </button>
                      </div>
                    )}
                    <SliderControl label="Vehicle Count" value={vehicle_count} max={MAX_EXPECTED.vehicle_count} onChange={(v) => updateFeature(0, v)} />
                    <SliderControl label="Queue Length (m)" value={queue_length} max={MAX_EXPECTED.queue_length} onChange={(v) => updateFeature(1, v)} />
                    <SliderControl label="Traffic Density" value={traffic_density} max={MAX_EXPECTED.traffic_density} onChange={(v) => updateFeature(2, v)} />
                    <SliderControl label="Average Speed (km/h)" value={avg_speed} max={MAX_EXPECTED.avg_speed} onChange={(v) => updateFeature(3, v)} />
                    <SliderControl label="Waiting Time (s)" value={waiting_time} max={MAX_EXPECTED.waiting_time} onChange={(v) => updateFeature(4, v)} />
                    <SliderControl label="Green Signal Ratio" value={green_signal_ratio} max={MAX_EXPECTED.green_signal_ratio} step={0.1} onChange={(v) => updateFeature(5, v)} />
                    
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs font-medium text-slate-700">Peak Hour</span>
                      <button 
                        onClick={() => updateFeature(7, !peak_hour)}
                        className={`w-10 h-5 rounded-full relative transition-colors ${peak_hour ? 'bg-indigo-500' : 'bg-slate-300'}`}
                      >
                        <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-transform ${peak_hour ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-700">Monsoon Active</span>
                      <button 
                        onClick={() => updateFeature(6, !monsoon_active)}
                        className={`w-10 h-5 rounded-full relative transition-colors ${monsoon_active ? 'bg-indigo-500' : 'bg-slate-300'}`}
                      >
                        <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-transform ${monsoon_active ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, label, value, unit, max }: { icon: React.ReactNode, label: string, value: number, unit: string, max: number }) {
  const percentage = Math.min(100, (value / max) * 100);
  
  // Tint background based on severity
  let bgClass = 'bg-slate-50';
  if (percentage > 80) bgClass = 'bg-rose-50 border-rose-100';
  else if (percentage > 60) bgClass = 'bg-amber-50 border-amber-100';

  return (
    <div className={`border border-slate-100 rounded-xl p-3 flex flex-col justify-between transition-colors ${bgClass}`}>
      <div className="flex items-center text-slate-500 mb-2">
        {icon}
        <span className="text-xs font-medium ml-2 truncate">{label}</span>
      </div>
      <div>
        <div className="text-lg font-semibold text-slate-900 mb-1">
          <AnimatedNumber value={typeof value === 'number' && !Number.isInteger(value) ? Number(value.toFixed(1)) : value} />
          <span className="text-xs text-slate-500 font-normal ml-1">{unit}</span>
        </div>
        <div className="h-1 w-full bg-slate-200 rounded-full overflow-hidden">
          <motion.div 
            className={`h-full ${percentage > 80 ? 'bg-rose-500' : percentage > 60 ? 'bg-amber-500' : 'bg-indigo-500'}`}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ type: 'spring', stiffness: 50, damping: 15 }}
          />
        </div>
      </div>
    </div>
  );
}

function SliderControl({ label, value, max, step = 1, onChange }: { label: string, value: number, max: number, step?: number, onChange: (val: number) => void }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <label className="text-xs font-medium text-slate-700">{label}</label>
        <span className="text-xs text-slate-500 font-mono">{typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(1) : value}</span>
      </div>
      <input 
        type="range" 
        min={0} 
        max={max} 
        step={step}
        value={value} 
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
      />
    </div>
  );
}

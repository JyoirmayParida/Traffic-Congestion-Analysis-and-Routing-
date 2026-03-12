'use client';

import { useAppState, useAppDispatch } from '@/components/AppStateProvider';
import { Map, Moon, Sun } from 'lucide-react';

export default function AppHeader() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 z-20">
      <div className="flex items-center gap-3">
        <div className="bg-indigo-600 p-2 rounded-lg">
          <Map className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight hidden sm:block">
          Traffic Routing
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <select
          value={state.city}
          onChange={(e) => dispatch({ type: 'SET_CITY', city: e.target.value })}
          className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 outline-none cursor-pointer"
        >
          <option value="Delhi">Delhi</option>
          <option value="Mumbai">Mumbai</option>
          <option value="Bengaluru">Bengaluru</option>
        </select>

        <button className="p-2.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
          <Moon className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

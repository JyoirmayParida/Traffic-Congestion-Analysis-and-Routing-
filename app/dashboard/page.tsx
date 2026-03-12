import { Metadata } from 'next';
import JunctionMapServer from '@/components/map/JunctionMapServer';

export const metadata: Metadata = {
  title: 'Dashboard | Traffic Routing',
  description: 'Real-time traffic congestion analysis and routing dashboard.',
};

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Traffic Routing Dashboard</h1>
        <p className="text-slate-600 mt-2">Monitor congestion and find optimal routes.</p>
      </header>
      <JunctionMapServer city="Delhi" />
    </div>
  );
}

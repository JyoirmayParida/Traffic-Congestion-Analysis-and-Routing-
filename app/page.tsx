import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-slate-50">
      <div className="max-w-3xl text-center space-y-8">
        <h1 className="text-5xl font-bold tracking-tight text-slate-900">
          Traffic Congestion Analysis & Routing
        </h1>
        <p className="text-xl text-slate-600">
          ML-Augmented routing system for Indian urban 4-way junctions.
          Optimizing for minimum travel time using real-time traffic data and XGBoost predictions.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-md bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Open Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}

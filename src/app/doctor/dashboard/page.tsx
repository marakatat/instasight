import Link from "next/link";

export default function DoctorDashboard() {
  return (
    <main className="min-h-screen p-8 bg-gray-100">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Doctor Dashboard</h1>
        
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <h2 className="text-xl font-semibold mb-4">Recent Patient Sessions</h2>
          <div className="divide-y">
            <Link 
              href="/doctor/sessions/demo"
              className="flex items-center justify-between py-4 hover:bg-gray-50 transition-colors px-4 -mx-4 rounded-lg"
            >
              <div>
                <p className="font-bold text-blue-900">Demo Patient</p>
                <p className="text-sm text-gray-500">Right Arm Raise • Completed Today, 14:30</p>
              </div>
              <div className="text-right">
                <span className="inline-block bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full font-bold">Review Required</span>
                <p className="text-sm text-blue-600 mt-1">View Session &rarr;</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

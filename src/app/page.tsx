import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-extrabold text-blue-900 tracking-tight text-center w-full mb-12">
          Telerehabilitation Hackathon Demo
        </h1>
      </div>

      <div className="grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-2 gap-8">
        <Link
          href="/patient/session/demo123"
          className="group rounded-2xl border border-transparent px-5 py-8 transition-colors hover:border-gray-300 hover:bg-gray-100 bg-white shadow-lg"
        >
          <h2 className="mb-3 text-2xl font-semibold">
            Patient Portal{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className="m-0 max-w-[30ch] text-sm opacity-75 mx-auto">
            Test the live MediaPipe camera tracking and exercise feedback.
          </p>
        </Link>

        <Link
          href="/doctor/dashboard"
          className="group rounded-2xl border border-transparent px-5 py-8 transition-colors hover:border-gray-300 hover:bg-gray-100 bg-white shadow-lg opacity-50 cursor-not-allowed"
          // We can remove the cursor-not-allowed when we build the doctor dashboard
        >
          <h2 className="mb-3 text-2xl font-semibold">
            Doctor Dashboard{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className="m-0 max-w-[30ch] text-sm opacity-75 mx-auto">
            (Coming soon) View patient session history and AI analysis.
          </p>
        </Link>
      </div>
    </main>
  );
}

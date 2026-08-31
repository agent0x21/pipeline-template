export default function Home() {
  const steps = [
    { name: "Checkout repository", status: "✓", time: "1s" },
    { name: "Install dependencies", status: "✓", time: "8s" },
    { name: "Run tests", status: "✓", time: "12s" },
    { name: "Deploy to production", status: "●", time: "running" },
  ];

  return (
    <main className="min-h-screen bg-[#0d1117] px-6 py-16 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 flex items-center justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#30363d] bg-[#161b22] px-3 py-1 text-sm text-gray-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
              GitHub Actions
            </div>

            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              Ship it. 🚀
            </h1>

            <p className="mt-4 max-w-xl text-lg text-gray-400">
              Your code is making its way through the CI/CD pipeline. Hopefully
              nothing turns red.
            </p>
          </div>

          <div className="hidden text-7xl md:block">⚙️</div>
        </div>

        <section className="overflow-hidden rounded-xl border border-[#30363d] bg-[#161b22] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#30363d] px-6 py-4">
            <div>
              <p className="font-semibold">deploy.yml</p>
              <p className="mt-1 font-mono text-xs text-gray-500">
                push → main
              </p>
            </div>

            <span className="rounded-full bg-green-400/10 px-3 py-1 text-sm font-medium text-green-400">
              In progress
            </span>
          </div>

          <div className="divide-y divide-[#30363d]">
            {steps.map((step) => (
              <div
                key={step.name}
                className="flex items-center justify-between px-6 py-5 transition hover:bg-white/3"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      step.status === "✓"
                        ? "bg-green-400/10 text-green-400"
                        : "animate-pulse bg-yellow-400/10 text-yellow-400"
                    }`}
                  >
                    {step.status}
                  </div>

                  <span className="font-mono text-sm">{step.name}</span>
                </div>

                <span className="font-mono text-xs text-gray-500">
                  {step.time}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
            <p className="text-sm text-gray-500">Tests</p>
            <p className="mt-2 text-2xl font-bold text-green-400">42 passed</p>
          </div>

          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
            <p className="text-sm text-gray-500">Build time</p>
            <p className="mt-2 text-2xl font-bold">21.4s</p>
          </div>

          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
            <p className="text-sm text-gray-500">Developer mood</p>
            <p className="mt-2 text-2xl font-bold">😎 stable</p>
          </div>
        </div>

        <p className="mt-10 text-center font-mono text-sm text-gray-600">
          $ git push origin main
          <span className="ml-2 animate-pulse">▌</span>
        </p>
      </div>
    </main>
  );
}

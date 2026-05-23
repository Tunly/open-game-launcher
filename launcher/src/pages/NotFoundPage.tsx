import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-4xl place-items-center px-4 py-10">
      <div className="border border-white/10 bg-white/[0.05] p-8 text-center">
        <p className="text-sm font-bold uppercase text-sky-200">404</p>
        <h1 className="mt-2 text-4xl font-black text-white">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          This launcher route does not exist yet.
        </p>
        <Link
          className="mt-6 inline-flex bg-sky-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-sky-300"
          to="/"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

import { ArrowLeft, Home, Radio, SearchX } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="neo-dots grid min-h-[calc(100vh-160px)] place-items-center">
      <div className="grid w-full max-w-[1120px] gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="border-4 border-black bg-[#fff9ed] shadow-[7px_7px_0_#171411]">
          <div className="border-b-4 border-black bg-[#171411] px-4 py-3 text-[#fbf4e7]">
            <span className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#000]">
              Route Missing
            </span>
            <h1 className="neo-title mt-3 text-6xl leading-none md:text-8xl">404</h1>
            <p className="neo-copy mt-3 max-w-2xl text-[11px] font-black uppercase leading-5 text-[#8cf5e4]">
              This launcher lane is not registered in the current route table.
            </p>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-3">
            {[
              ["Status", "Missing"],
              ["Route", "Unknown"],
              ["Fallback", "Library"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]"
              >
                <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                  {label}
                </p>
                <p className="neo-title mt-3 text-2xl leading-none text-[#171411]">{value}</p>
              </div>
            ))}
          </div>

          <div className="border-t-4 border-black bg-[#efe6d4] p-4">
            <h2 className="neo-title text-4xl leading-none text-[#171411]">Page Not Found</h2>
            <p className="neo-copy mt-2 max-w-2xl text-[11px] font-black uppercase leading-5 text-[#5b403f]">
              Return to a known launcher surface and keep the library board in control.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                className="neo-copy inline-flex h-11 items-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 text-[10px] font-black uppercase text-white shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#087d6d]"
                to="/library"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Library
              </Link>
              <Link
                className="neo-copy inline-flex h-11 items-center gap-2 border-[3px] border-black bg-[#fff9ed] px-4 text-[10px] font-black uppercase text-[#171411] shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
                to="/home"
              >
                <Home className="h-4 w-4" />
                Open Play Desk
              </Link>
            </div>
          </div>
        </div>

        <div className="hero-art relative min-h-[300px] overflow-hidden border-4 border-black p-4 shadow-[7px_7px_0_#171411]">
          <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,249,237,0.16)_1px,transparent_1px)] bg-[length:8px_8px]" />
          <div className="relative flex h-full min-h-[268px] flex-col justify-between">
            <span className="neo-copy w-fit border-2 border-black bg-[#8cf5e4] px-3 py-1 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
              Route Scanner
            </span>
            <div>
              <div className="mb-3 grid h-16 w-16 place-items-center border-[3px] border-black bg-[#087d6d] text-white shadow-[3px_3px_0_#000]">
                <SearchX className="h-9 w-9" />
              </div>
              <h2 className="neo-title text-4xl leading-none text-[#fff9ed] [text-shadow:3px_3px_0_#171411]">
                Signal Lost
              </h2>
              <p className="neo-copy mt-2 max-w-[280px] text-[10px] font-black uppercase leading-5 text-[#f5eedf]">
                The requested screen is outside the current launcher manifest.
              </p>
            </div>
            <div className="neo-copy flex items-center gap-2 border-2 border-black bg-[#171411]/90 px-3 py-2 text-[9px] font-black uppercase text-[#f5eedf]">
              <Radio className="h-4 w-4 text-[#8cf5e4]" />
              Manifest scan complete
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

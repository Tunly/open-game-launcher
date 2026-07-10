import { useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Code2,
  ExternalLink,
  Send,
  ShieldCheck,
  Store,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";

const pipelineItems: { icon: LucideIcon; label: string; value: string }[] = [
  { icon: ShieldCheck, label: "Review Gate", value: "RLS locked" },
  { icon: Store, label: "Store Slot", value: "Draft only" },
  { icon: UploadCloud, label: "Build Upload", value: "After approval" },
];

const fieldClass =
  "neo-copy mt-2 w-full border-[3px] border-black bg-[#fff9ed] px-3 py-2 text-[12px] font-black text-[#171411] outline-none shadow-[2px_2px_0_#171411] placeholder:text-[#655f58] focus:bg-[#f6edd8]";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function DeveloperPortalPage() {
  const [studioName, setStudioName] = useState("");
  const [website, setWebsite] = useState("");
  const [desc, setDesc] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setError("");
      setIsSubmitting(true);
      const { submitDeveloperApplication } = await import("../lib/supabase/store");
      await submitDeveloperApplication(
        studioName.trim(),
        website.trim() || null,
        desc.trim() || null,
      );
      setSubmitted(true);
    } catch (submitError: unknown) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="neo-dots space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#171411]">
          <div className="border-b-4 border-black bg-[#171411] px-4 py-3 text-[#fbf4e7]">
            <span className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[3px_3px_0_#000]">
              Publisher Intake
            </span>
            <h1 className="neo-title mt-3 text-5xl leading-none md:text-7xl">Developer Portal</h1>
            <p className="neo-copy mt-3 max-w-2xl text-[11px] leading-5 font-black text-[#8cf5e4] uppercase">
              Apply for store publishing access, submit studio metadata, and unlock build tools
              after review.
            </p>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-3">
            {pipelineItems.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="neo-copy text-[9px] font-black tracking-[0.12em] text-[#5b403f] uppercase">
                    {label}
                  </p>
                  <Icon className="h-5 w-5 text-[#b7102a]" />
                </div>
                <p className="neo-title mt-3 text-2xl leading-none text-[#171411]">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-art relative min-h-[250px] overflow-hidden border-4 border-black p-4 shadow-[6px_6px_0_#171411]">
          <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,249,237,0.16)_1px,transparent_1px)] bg-[length:8px_8px]" />
          <div className="relative flex h-full min-h-[218px] flex-col justify-between">
            <span className="neo-copy w-fit border-2 border-black bg-[#8cf5e4] px-3 py-1 text-[9px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#171411]">
              Build Bay
            </span>
            <div>
              <div className="mb-3 grid h-16 w-16 place-items-center border-[3px] border-black bg-[#087d6d] text-white shadow-[3px_3px_0_#000]">
                <Code2 className="h-9 w-9" />
              </div>
              <h2 className="neo-title text-4xl leading-none text-[#fff9ed] [text-shadow:3px_3px_0_#171411]">
                Ship Desk
              </h2>
              <p className="neo-copy mt-2 max-w-[280px] text-[10px] leading-5 font-black text-[#f5eedf] uppercase">
                Approved teams can stage builds, manage products, and answer store reviews.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,680px)_minmax(260px,1fr)]">
        {submitted ? (
          <div className="border-4 border-black bg-[#f5eedf] shadow-[6px_6px_0_#171411]">
            <div className="flex items-center gap-3 border-b-4 border-black bg-[#087d6d] px-4 py-3 text-white">
              <CheckCircle2 className="h-7 w-7" />
              <div>
                <p className="neo-copy text-[10px] font-black tracking-[0.12em] uppercase">
                  Application queued
                </p>
                <h2 className="neo-title text-4xl leading-none">Review Pending</h2>
              </div>
            </div>
            <div className="p-4">
              <p className="neo-copy text-[11px] leading-5 font-black text-[#5b403f] uppercase">
                We will review your application and notify you when publishing tools are unlocked.
              </p>
              <a
                href="https://supabase.com/dashboard/project/awebfvfyqzwapcgixdfj"
                target="_blank"
                rel="noreferrer"
                className="neo-copy mt-4 inline-flex h-10 items-center gap-2 border-[3px] border-black bg-[#fff9ed] px-4 text-[10px] font-black text-[#171411] uppercase shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
              >
                <ExternalLink className="h-4 w-4" />
                Supabase Dashboard
              </a>
            </div>
          </div>
        ) : (
          <form
            className="border-4 border-black bg-[#f5eedf] shadow-[6px_6px_0_#171411]"
            onSubmit={handleSubmit}
          >
            <div className="border-b-4 border-black bg-[#efe6d4] px-4 py-3">
              <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#b7102a] uppercase">
                Application Form
              </p>
              <h2 className="neo-title text-4xl leading-none text-[#171411]">Studio Access</h2>
            </div>

            <div className="space-y-4 p-4">
              {error ? (
                <div className="neo-copy border-[3px] border-black bg-[#f5d6d9] p-3 text-[10px] leading-5 font-black text-[#77101f] uppercase shadow-[3px_3px_0_#171411]">
                  {error}
                </div>
              ) : null}

              <label className="block">
                <span className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#5b403f] uppercase">
                  Studio Name
                </span>
                <input
                  aria-label="Studio Name"
                  className={fieldClass}
                  value={studioName}
                  onChange={(event) => setStudioName(event.target.value)}
                  placeholder="Redline Studio"
                  required
                />
              </label>

              <label className="block">
                <span className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#5b403f] uppercase">
                  Website
                </span>
                <input
                  aria-label="Website"
                  className={fieldClass}
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  placeholder="https://studio.example"
                  type="url"
                />
              </label>

              <label className="block">
                <span className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#5b403f] uppercase">
                  Description
                </span>
                <textarea
                  aria-label="Description"
                  className={`${fieldClass} min-h-[128px] resize-y`}
                  value={desc}
                  onChange={(event) => setDesc(event.target.value)}
                  placeholder="Tell us about your games, platforms, and release plan."
                />
              </label>

              <button
                className="neo-copy inline-flex h-11 w-full items-center justify-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 text-[10px] font-black text-white uppercase shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#087d6d] disabled:cursor-not-allowed disabled:bg-[#655f58]"
                disabled={isSubmitting || !studioName.trim()}
                type="submit"
              >
                <Send className="h-4 w-4" />
                {isSubmitting ? "Submitting" : "Submit Application"}
              </button>
            </div>
          </form>
        )}

        <aside className="border-4 border-black bg-[#171411] p-4 text-[#f5eedf] shadow-[6px_6px_0_#171411]">
          <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#8cf5e4] uppercase">
            Access Contract
          </p>
          <h2 className="neo-title mt-2 text-4xl leading-none">Approval Rules</h2>
          <div className="mt-4 space-y-3">
            {[
              "Application is stored under the signed-in user.",
              "Product publishing stays locked until approval.",
              "Build storage access follows product developer ownership.",
            ].map((item, index) => (
              <div
                key={item}
                className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 border-2 border-[#f5eedf] bg-[#24201c] p-3"
              >
                <span className="neo-title text-3xl leading-none text-[#8cf5e4]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="neo-copy text-[10px] leading-5 font-black uppercase">{item}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

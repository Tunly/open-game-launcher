/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Code2, Send, ExternalLink } from "lucide-react";

export function DeveloperPortalPage() {
  const [studioName, setStudioName] = useState("");
  const [website, setWebsite] = useState("");
  const [desc, setDesc] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    try {
      setError("");
      const { submitDeveloperApplication } = await import("../lib/supabase/store");
      await submitDeveloperApplication(studioName, website || null, desc || null);
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <section className="flex flex-col gap-6 bg-[#fbf4e7] p-6">
      <div className="flex items-center gap-3">
        <Code2 className="h-8 w-8" />
        <h1 className="text-xl font-black uppercase">Developer Portal</h1>
      </div>
      {submitted ? (
        <div className="border-4 border-black bg-[#d1fae5] p-6 text-center shadow-[6px_6px_0_#171411]">
          <h2 className="text-lg font-black">Application Submitted!</h2>
          <p className="mt-2 text-sm">We will review your application and notify you.</p>
          <a
            href="https://supabase.com/dashboard/project/awebfvfyqzwapcgixdfj"
            target="_blank"
            className="mt-4 inline-flex items-center gap-1 border-2 border-black bg-white px-4 py-2 text-sm font-bold shadow-[2px_2px_0_#171411]"
          >
            <ExternalLink className="h-4 w-4" /> Supabase Dashboard
          </a>
        </div>
      ) : (
        <div className="max-w-lg border-4 border-black bg-white p-6 shadow-[6px_6px_0_#171411]">
          {error && (
            <div className="mb-4 border-2 border-red-600 bg-red-100 p-2 text-sm font-bold text-red-800">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-4">
            <div>
              <span className="text-sm font-bold uppercase">Studio Name</span>
              <input
                aria-label="Studio Name"
                className="mt-1 w-full border-2 border-black px-3 py-2 text-sm font-bold"
                value={studioName}
                onChange={(e) => setStudioName(e.target.value)}
                placeholder="Your Studio"
              />
            </div>
            <div>
              <span className="text-sm font-bold uppercase">Website</span>
              <input
                aria-label="Website"
                className="mt-1 w-full border-2 border-black px-3 py-2 text-sm"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://your-site.com"
              />
            </div>
            <div>
              <span className="text-sm font-bold uppercase">Description</span>
              <textarea
                aria-label="Description"
                className="mt-1 w-full border-2 border-black px-3 py-2 text-sm"
                rows={4}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Tell us about your games..."
              />
            </div>
            <button
              onClick={handleSubmit}
              className="border-2 border-black bg-[#1a70c3] px-4 py-2 font-bold text-white shadow-[2px_2px_0_#171411]"
            >
              <Send className="mr-1 inline h-4 w-4" /> Submit Application
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

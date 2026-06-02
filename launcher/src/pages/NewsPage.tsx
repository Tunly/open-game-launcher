import { useEffect, useState } from "react";
import { Newspaper } from "lucide-react";
import { listPublishedNews } from "../lib/supabase/news";
import type { NewsItem } from "../lib/types/news";

export function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { listPublishedNews().then(d => { setItems(d); setLoading(false); }); }, []);

  if (loading) return <div className="flex h-full items-center justify-center bg-[#fbf4e7]"><div className="border-4 border-black bg-[#f4ead8] px-5 py-3 font-black uppercase shadow-[6px_6px_0_#171411]">Loading News...</div></div>;

  return (
    <section className="flex flex-col gap-6 bg-[#fbf4e7] p-6">
      <div className="flex items-center gap-3">
        <Newspaper className="h-8 w-8" />
        <h1 className="text-xl font-black uppercase">News Feed</h1>
      </div>
      <div className="flex flex-col gap-4">
        {items.map(item => (
          <div key={item.id} className="border-4 border-black bg-white p-4 shadow-[4px_4px_0_#171411]">
            <h2 className="font-black text-lg">{item.title}</h2>
            <p className="text-sm text-gray-500">{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : ""}</p>
            <p className="mt-2 text-sm">{item.excerpt || item.body.slice(0, 200)}</p>
            <div className="mt-2 flex gap-2">
              {item.tags.map(tag => <span key={tag} className="border border-black bg-[#8cf5e4] px-2 text-xs font-bold">{tag}</span>)}
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-gray-500">No news articles yet. Check back soon!</p>}
      </div>
    </section>
  );
}

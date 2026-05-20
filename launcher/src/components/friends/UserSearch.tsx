export function UserSearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-300">Search users</span>
      <input
        className="mt-2 h-11 w-full border border-white/10 bg-white/[0.05] px-3 text-white outline-none focus:border-sky-300"
        placeholder="username"
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
    </label>
  );
}

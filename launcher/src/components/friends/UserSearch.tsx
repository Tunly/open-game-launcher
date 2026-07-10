export function UserSearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="neo-copy text-[11px] font-black tracking-[0.12em] text-[#5b403f] uppercase">
        Search users
      </span>
      <input
        className="mt-2 h-11 w-full border-2 border-black bg-[#f6edd8] px-3 text-[#171411] shadow-[2px_2px_0_#171411] outline-none focus:bg-[#fff9ed]"
        placeholder="username"
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
    </label>
  );
}

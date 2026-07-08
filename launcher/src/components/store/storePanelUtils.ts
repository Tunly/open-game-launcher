export function storeStagingCheckClass(status: "pass" | "warning" | "blocked") {
  switch (status) {
    case "pass":
      return "bg-[#8cf5e4] text-[#171411]";
    case "blocked":
      return "bg-[#b7102a] text-white";
    default:
      return "bg-[#fff9ed] text-[#171411]";
  }
}

export default {
  "launcher/**/*.{js,jsx,ts,tsx,css,md,json}": () => [
    "pnpm --dir launcher format:check",
    "pnpm --dir launcher lint",
  ],
};

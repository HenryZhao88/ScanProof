// The @tailwindcss/vite plugin silently emits zero utilities under Vite 8.1.x
// (preflight and the theme come through, the scanner never runs). The PostCSS
// integration is the stable path and produces identical output.
export default {
  plugins: { "@tailwindcss/postcss": {} },
};

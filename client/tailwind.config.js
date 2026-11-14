/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#006B3C', // Zen Green primary
          hover: '#0B7A46',   // Zen Green accent / hover
          subtle: '#EAF6EF',  // Zen Green tint
          surface: '#F5F7F6', // Neutral light surface
        },
      },
    },
  },
  plugins: [],
}


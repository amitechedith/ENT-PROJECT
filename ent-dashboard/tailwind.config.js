/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#007ad9", // PrimeNG blue
          light: "#63a4ff",
          dark: "#004ba0"
        }
      },
      borderRadius: {
        'xl': '1rem'
      },
      boxShadow: {
        'soft': '0 4px 12px rgba(0,0,0,0.08)'
      }
    }
  },
  plugins: []
}

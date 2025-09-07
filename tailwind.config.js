import defaultTheme from 'tailwindcss/defaultTheme'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
}

import defaultTheme from 'tailwindcss/defaultTheme'
import colors from 'tailwindcss/colors'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        // Gris des textes secondaires un peu plus foncé : contraste 4,5:1 même sur les fonds gris clair (RGAA 3.2)
        gray: { ...colors.gray, 500: '#5f6673' },
      },
    },
  },
  plugins: [],
}

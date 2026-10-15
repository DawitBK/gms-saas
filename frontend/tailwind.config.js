module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}",
    "./shared/**/*.{js,ts,jsx,tsx,mdx}",
    "./providers/**/*.{js,ts,jsx,tsx,mdx}",
    "./state/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'rgb(var(--brand-primary) / <alpha-value>)',
          secondary: 'rgb(var(--brand-secondary) / <alpha-value>)',
          accent: 'rgb(var(--brand-accent) / <alpha-value>)',
        },
        surface: {
          background: 'rgb(var(--surface-background) / <alpha-value>)',
          card: 'rgb(var(--surface-card) / <alpha-value>)',
          overlay: 'rgb(var(--surface-overlay) / <alpha-value>)',
          border: 'rgb(var(--surface-border) / <alpha-value>)',
        },
        content: {
          base: 'rgb(var(--content-base) / <alpha-value>)',
          muted: 'rgb(var(--content-muted) / <alpha-value>)',
          dimmed: 'rgb(var(--content-dimmed) / <alpha-value>)',
        }
      },
      borderRadius: {
        'xl-enterprise': '1.25rem',
        '2xl-enterprise': '1.5rem',
        '3xl-enterprise': '2rem',
      },
      backdropBlur: {
        'enterprise': '12px',
      }
    }
  },
  plugins: [
    require('tailwindcss-animate'),
  ]
};

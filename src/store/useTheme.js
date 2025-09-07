import { create } from 'zustand'

export const useTheme = create((set) => ({
    theme: 'light',
    init() {
        const saved = localStorage.getItem('theme')
        const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
        const t = saved || (prefersDark ? 'dark' : 'light')
        document.documentElement.classList.toggle('dark', t === 'dark')
        set({ theme: t })
    },
    toggle() {
        const next = !document.documentElement.classList.contains('dark')
        document.documentElement.classList.toggle('dark', next)
        localStorage.setItem('theme', next ? 'dark' : 'light')
        set({ theme: next ? 'dark' : 'light' })
    },
}))

import { defineStore } from 'pinia'

/**
 * 黑夜/白天模式：初始状态由 index.html 的预渲染脚本决定（防闪烁），
 * 这里只负责切换 + 持久化。localStorage 键：df33-theme（'dark' | 'light'）。
 */
export const useThemeStore = defineStore('theme', {
  state: () => ({
    dark: document.documentElement.classList.contains('dark'),
  }),
  actions: {
    toggle() {
      this.dark = !this.dark
      document.documentElement.classList.toggle('dark', this.dark)
      localStorage.setItem('df33-theme', this.dark ? 'dark' : 'light')
    },
  },
})

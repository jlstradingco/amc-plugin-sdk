import DefaultTheme from 'vitepress/theme'
import './custom.css'
import HomePage from './HomePage.vue'
import type { Theme } from 'vitepress'

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ app, router }) {
    app.component('HomePage', HomePage)

    // Force dark class — appearance:false disables the toggle but also
    // stops VitePress from adding .dark automatically
    if (typeof document !== 'undefined') {
      document.documentElement.classList.add('dark')
    }
    if (router) {
      router.onAfterRouteChanged = () => {
        document.documentElement.classList.add('dark')
      }
    }
  }
}

export default theme

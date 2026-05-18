import DefaultTheme from 'vitepress/theme'
import './custom.css'
import HomePage from './HomePage.vue'
import type { Theme } from 'vitepress'

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('HomePage', HomePage)
  }
}

export default theme

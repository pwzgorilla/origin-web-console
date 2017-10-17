// The Vue build version to load with the `import` command
// (runtime-only or standalone) has been set in webpack.base.conf with an alias.
import Vue from 'vue'
import App from './App'
import router from './router'
import store from './store'
import ElementUI from 'element-ui'
import lodash from '@/utils/lodash'
import * as filters from '@/filters'
import directives from '@/directives'
import 'element-ui/lib/theme-default/index.css'
// import './styles/theme/index.css'
import 'font-awesome/css/font-awesome.min.css'
import './styles/fonts.css'
import './styles/fonts-eams.css'
import './styles/index.css' // 全局自定义的css样式
import './styles/element-ui.css' // 覆盖 Element-UI 的样式
// import NProgress from 'nprogress' // Progress 进度条
// import 'nprogress/nprogress.css'// Progress 进度条 样式
// import { getToken } from '@/utils/auth'
// import * as permiType from '@/store/permissions/mutations_types'
// import * as userType from '@/store/user/mutations_types'
// import './mock' // Mock 测试, 生产环境需注释

Vue.config.productionTip = false

Vue.use(ElementUI)
Vue.use(lodash)

// 注册全局 Filters
Object.keys(filters).forEach(key => {
  Vue.filter(key, filters[key])
})

// 注册全局 Directive
Object.keys(directives).forEach(key => {
  Vue.directive(key, directives[key])
})

/* eslint-disable no-new */
new Vue({
  el: '#app',
  router,
  store,
  template: '<App/>',
  components: { App }
})

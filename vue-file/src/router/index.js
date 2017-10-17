import Vue from 'vue'
import Router from 'vue-router'
import Layout from '@/views/layout/Layout'

const OctCreate = () => import('../views/eams/octopus/Create')
const SqdCreate = () => import('../views/eams/squid/Create')
const OctList = () => import('../views/eams/octopus/List')
const SqdList = () => import('../views/eams/squid/List')
const MinihostCreate = () => import('../views/minihost/Create')
const MinihostList = () => import('../views/minihost/list/List')
const MiniclusterCreate = () => import('../views/minihost/cluster/Create')
const MiniclusterList = () => import('../views/minihost/cluster/List')

Vue.use(Router)

export const constantRouterMap = [
  {
    path: '/',
    redirect: '/eams',
    name: '首页',
    component: Layout,
    hidden: true
  },
  {
    path: '/eams',
    name: 'EAMS',
    redirect: '/eams/oct-up',
    icon: 'fa fa-cubes',
    component: Layout,
    hasDropdown: true,
    children: [
      { path: 'oct-up', component: OctCreate, name: 'octopus创建', meta: { role: ['get-apps'] }, hidden: true },
      { path: 'squid-up', component: SqdCreate, name: 'squid创建', meta: { role: ['get-apps'] }, hidden: true },
      { path: 'oct-list', component: OctList, name: 'octopus', icon: 'iconfont icon-octopus-menu', meta: { role: ['get-apps'] } },
      { path: 'squid-list', component: SqdList, name: 'squid', icon: 'iconfont icon-squid-menu', meta: { role: ['get-apps'] } }
    ]
  },
  {
    path: '/mh',
    name: '迷你主机',
    redirect: '/mh/mh-up',
    icon: 'iconfont icon-minihost-menu',
    component: Layout,
    hasDropdown: true,
    children: [
      { path: 'mh-up', component: MinihostCreate, name: '胶囊主机创建', meta: { role: ['get-apps'] }, hidden: true },
      { path: 'mh-list', component: MinihostList, name: '迷你主机列表', meta: { role: ['get-apps'] } },
      { path: 'mc-up', component: MiniclusterCreate, name: '迷你主机列', meta: { role: ['get-apps'] } },
      { path: 'mh-cluster-list', component: MiniclusterList, name: '迷你主列', meta: { role: ['get-apps'] } }
    ]
  }
]

const router = new Router({
  mode: 'history',
  base: '/ui/',
  scrollBehavior: () => ({ y: 0 }),
  routes: constantRouterMap
})

export default router

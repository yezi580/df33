import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'lobby', component: () => import('./views/LobbyView.vue') },
  { path: '/task/:taskId', name: 'task', component: () => import('./views/TaskRoomsView.vue') },
  { path: '/room/:roomId', name: 'room', component: () => import('./views/RoomView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})

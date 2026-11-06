import { defineStore } from 'pinia'
import { ref } from 'vue'
import { socket } from '../lib/socket'
import { fetchTasks } from '../lib/api'

/** 大厅：赛季任务列表（REST）+ 全站房间实时列表（Socket） */
export const useLobbyStore = defineStore('lobby', {
  state: () => ({
    tasks: [],
    tasksLoaded: false,
    tasksError: '',
    rooms: [], // 实时房间摘要列表
    subscribed: false,
    mode: '第一阶段', // 当前阶段 tab（跨页面保留，返回大厅时恢复）
    subCat: '主线', // 当前细分任务链（无「全部」选项，默认第一阶段——主线）
  }),
  getters: {
    roomsByTask: (s) => (taskId) => s.rooms.filter((r) => r.taskId === taskId),
    taskById: (s) => (taskId) => s.tasks.find((t) => t.id === taskId),
    statsOf:
      (s) =>
      (taskId) => {
        const list = s.rooms.filter((r) => r.taskId === taskId)
        return {
          roomCount: list.length,
          playerCount: list.reduce((n, r) => n + r.memberCount, 0),
          voiceCount: list.reduce((n, r) => n + r.voiceCount, 0),
        }
      },
    onlineStats: (s) => ({
      roomCount: s.rooms.length,
      playerCount: s.rooms.reduce((n, r) => n + r.memberCount, 0),
      voiceCount: s.rooms.reduce((n, r) => n + r.voiceCount, 0),
    }),
  },
  actions: {
    async loadTasks(force = false) {
      if (this.tasksLoaded && !force) return
      try {
        this.tasksError = ''
        this.tasks = await fetchTasks()
        this.tasksLoaded = true
      } catch (e) {
        this.tasksError = e.message
      }
    },
    subscribe() {
      if (this.subscribed) return
      socket.on('rooms:update', (list) => {
        this.rooms = list
      })
      socket.emit('lobby:join')
      this.subscribed = true
    },
    unsubscribe() {
      socket.emit('lobby:leave')
      socket.off('rooms:update')
      this.subscribed = false
    },
  },
})

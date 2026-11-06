<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Edit, Moon, Sunny } from '@element-plus/icons-vue'
import { useUserStore } from './stores/user'
import { useLobbyStore } from './stores/lobby'
import { useRoomStore } from './stores/room'
import { useThemeStore } from './stores/theme'
import NicknameDialog from './components/NicknameDialog.vue'
import AuthDialog from './components/AuthDialog.vue'

const router = useRouter()
const user = useUserStore()
const lobby = useLobbyStore()
const roomStore = useRoomStore()
const theme = useThemeStore()
const showProfile = ref(false)

onMounted(() => {
  user.ensureConnected()
  user.init() // 恢复登录态（cookie 会话）；游客不受影响
  lobby.subscribe()
  lobby.loadTasks()
})

const stats = computed(() => lobby.onlineStats)

// 点击左上角品牌回大厅：在房间内先确认（确认后跳转，由 RoomView 卸载时统一退出房间）
async function goHome() {
  if (roomStore.roomId) {
    try {
      await ElMessageBox.confirm('返回组队大厅将退出当前房间并断开语音，确定退出吗？', '退出房间', {
        type: 'warning',
        confirmButtonText: '退出房间',
        cancelButtonText: '留在房间',
      })
    } catch {
      return
    }
  }
  router.push('/')
}

// 登出：在房间内先确认退出（否则重连会打断房间状态），再清会话换回游客身份
async function confirmLogout() {
  if (roomStore.roomId) {
    try {
      await ElMessageBox.confirm('登出将退出当前房间并断开语音，确定登出吗？', '登出', {
        type: 'warning',
        confirmButtonText: '登出',
        cancelButtonText: '取消',
      })
    } catch {
      return
    }
    roomStore.leaveRoom()
    router.push('/')
  }
  await user.logout()
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand" @click="goHome">
        <span class="brand-badge">DF33</span>
        <div class="brand-text">
          <h1>三角洲赛季任务组队大厅</h1>
          <p>赛季任务 · 组队开黑 · 实时语音</p>
        </div>
      </div>
      <div class="header-right">
        <div class="online-chip" :title="`${stats.roomCount} 支队伍 · ${stats.playerCount} 人在线 · ${stats.voiceCount} 人语音中`">
          <span class="dot" :class="{ live: stats.playerCount > 0 }"></span>
          {{ stats.roomCount }} 队 · {{ stats.playerCount }} 人在线
        </div>
        <button
          class="theme-toggle"
          :title="theme.dark ? '切换到白天模式' : '切换到黑夜模式'"
          @click="theme.toggle()"
        >
          <el-icon :size="16">
            <Sunny v-if="theme.dark" />
            <Moon v-else />
          </el-icon>
        </button>
        <el-button v-if="!user.loggedIn" type="primary" @click="user.authVisible = true">
          登录 / 注册
        </el-button>
        <template v-else>
          <button class="logout-link" @click="confirmLogout">登出</button>
          <el-button class="user-chip" @click="showProfile = true">
            <span class="avatar-dot" :style="{ background: user.color || '#8a99a8' }">{{
              user.nickname.slice(0, 1) || '?'
            }}</span>
            <span class="user-name">{{ user.nickname || '未设置代号' }}</span>
            <el-icon><Edit /></el-icon>
          </el-button>
        </template>
      </div>
    </header>

    <main class="app-main">
      <router-view />
    </main>

    <NicknameDialog v-model="showProfile" />
    <AuthDialog v-model="user.authVisible" />
  </div>
</template>

<style scoped>
.app-shell {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px 48px;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 0 14px;
  border-bottom: 1px solid var(--dsh-border);
  margin-bottom: 20px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
}

.brand-badge {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 0.5px;
  color: #201503;
  background: linear-gradient(135deg, #ffc164, var(--dsh-accent));
  clip-path: polygon(0 0, 100% 0, 100% 72%, 72% 100%, 0 100%);
}

.brand-text h1 {
  margin: 0;
  font-size: 19px;
  letter-spacing: 3px;
}

.brand-text p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--dsh-dim);
  letter-spacing: 2px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.online-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--dsh-dim);
  border: 1px solid var(--dsh-border);
  padding: 6px 12px;
  background: var(--dsh-panel);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsh-dim);
}

.theme-toggle {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--dsh-border);
  border-radius: 6px;
  background: var(--dsh-panel);
  color: var(--dsh-dim);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.theme-toggle:hover {
  color: var(--dsh-accent);
  border-color: var(--dsh-accent-dim);
}

.dot.live {
  background: var(--dsh-voice);
  box-shadow: 0 0 8px var(--dsh-voice);
  animation: speaking-pulse 1.2s infinite alternate;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logout-link {
  padding: 0 2px;
  font-size: 13px;
  color: var(--dsh-dim);
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.15s;
}

.logout-link:hover {
  color: var(--dsh-danger);
}

.avatar-dot {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 700;
  color: #10161d;
}

.user-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

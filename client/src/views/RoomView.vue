<script setup>
import { computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting, Mic, Headset } from '@element-plus/icons-vue'
import { useLobbyStore } from '../stores/lobby'
import { useRoomStore } from '../stores/room'
import { useVoiceStore } from '../stores/voice'
import { useUserStore } from '../stores/user'
import { socket } from '../lib/socket'
import MemberTile from '../components/MemberTile.vue'
import ChatPanel from '../components/ChatPanel.vue'

const route = useRoute()
const router = useRouter()
const lobby = useLobbyStore()
const roomStore = useRoomStore()
const voice = useVoiceStore()
const user = useUserStore()

const roomIdParam = computed(() => route.params.roomId)
const joinedThis = computed(() => roomStore.roomId === roomIdParam.value && Boolean(roomStore.room))

const task = computed(() => roomStore.task ?? lobby.taskById(roomStore.room?.taskId))

async function tryJoin() {
  const res = await roomStore.joinRoom(roomIdParam.value)
  if (res.ok) return
  if (res.code === 'NEED_LOGIN') {
    // 游客直接打开房间分享链接：弹登录框，成功后自动续做进房
    user.onNeedLogin(tryJoin)
    return
  }
  ElMessage.error(res.error)
  router.replace('/')
}

onMounted(() => {
  lobby.loadTasks()
  if (!joinedThis.value) tryJoin()
})

// 服务重启/断线会清空本地房间状态：重连成功后自动重新加入（房间已不在则提示并回大厅），
// 避免页面永远停在骨架屏。服务端对已在房间的重复 join 幂等，并发调用无害。
const rejoinOnConnect = () => {
  if (!joinedThis.value) tryJoin()
}
socket.on('connect', rejoinOnConnect)

// 离开房间页（关页/刷新由 socket disconnect 兜底）→ 退出房间与语音
onBeforeUnmount(() => {
  socket.off('connect', rejoinOnConnect)
  if (roomStore.roomId) roomStore.leaveRoom()
})

watch(
  () => voice.error,
  (e) => {
    if (e) {
      ElMessage.error(e)
      voice.error = ''
    }
  }
)

async function confirmClose() {
  try {
    await ElMessageBox.confirm('确定解散队伍吗？所有队员将被请出房间。', '解散队伍', {
      type: 'warning',
      confirmButtonText: '解散',
      cancelButtonText: '取消',
    })
    roomStore.closeRoom()
  } catch {
    /* 取消 */
  }
}

function leave() {
  roomStore.leaveRoom()
  router.push('/')
}

async function kick(member) {
  try {
    await ElMessageBox.confirm(`确定将「${member.nickname}」移出队伍吗？`, '移出队员', {
      type: 'warning',
      confirmButtonText: '移出',
      cancelButtonText: '取消',
    })
    roomStore.kick(member.id)
  } catch {
    /* 取消 */
  }
}

async function onPref(key, value) {
  const applied = await voice.setPref(key, value)
  if (!applied && voice.joined) {
    ElMessage.info('已保存，重新加入语音后生效')
  }
}
</script>

<template>
  <div v-if="joinedThis && roomStore.room" class="room-view">
    <!-- 房间头：队伍信息 + 关联任务 -->
    <header class="room-head tactical-card">
      <div class="room-info">
        <div class="line-1">
          <h2>{{ roomStore.room.name }}</h2>
        </div>
        <p class="meta">
          房主 {{ roomStore.room.hostName }} · {{ roomStore.room.memberCount }}/{{
            roomStore.room.maxSize
          }}
          人 · 🎧 {{ roomStore.room.voiceCount }} 人语音中
        </p>
        <p v-if="roomStore.room.note" class="note">💬 {{ roomStore.room.note }}</p>
      </div>
      <div v-if="task" class="task-banner">
        <span class="label">本局任务</span>
        <div class="task-name" :title="task.name">{{ task.name }}</div>
        <div class="task-desc">{{ task.description }}</div>
        <div v-if="task.reward" class="task-reward">🏆 {{ task.reward }}</div>
      </div>
    </header>

    <!-- 主体：成员 + 聊天 -->
    <main class="room-main">
      <section class="members-panel tactical-card">
        <div class="section-title">
          队员
          <span class="count">{{ roomStore.members.length }}/{{ roomStore.room.maxSize }}</span>
          <span v-if="voice.joined && voice.peerCount === 0" class="voice-hint">
            语音已就绪，等队友加入语音…
          </span>
        </div>
        <div class="members-grid">
          <MemberTile
            v-for="m in roomStore.members"
            :key="m.id"
            :member="m"
            :me-id="roomStore.me"
            :level="m.id === roomStore.me ? (voice.levels.self ?? 0) : (voice.levels[m.id] ?? 0)"
            :volume="voice.peerVolumes[m.id] ?? 1"
            :can-kick="roomStore.isHost"
            @kick="kick"
            @volume="(v) => voice.setPeerVolume(m.id, v)"
          />
        </div>
      </section>

      <section class="chat-wrap tactical-card">
        <ChatPanel :messages="roomStore.chat" :me-id="roomStore.me" @send="roomStore.sendChat" />
      </section>
    </main>

    <!-- 控制条 -->
    <footer class="control-bar tactical-card">
      <div class="voice-zone">
        <el-button
          v-if="!voice.joined"
          type="success"
          size="large"
          :loading="voice.connecting"
          @click="voice.join()"
        >
          🎧 加入语音
        </el-button>
        <template v-else>
          <el-button type="danger" size="large" @click="voice.leave()">退出语音</el-button>
          <el-button
            size="large"
            :type="voice.muted ? 'warning' : 'primary'"
            @click="voice.toggleMute()"
          >
            {{ voice.muted ? '已静音（点击恢复）' : '静音麦克风' }}
          </el-button>
        </template>

        <!-- 音量条 + 齿轮：在语音区内居中 -->
        <div class="voice-tools">
          <div v-if="voice.joined" class="vol-strip">
            <div class="vol-item mic" title="说话音量（队友听到你的音量）">
              <span class="pref-ic mic"><el-icon :size="12"><Mic /></el-icon></span>
              <el-slider
                class="vol-slider"
                :model-value="voice.prefs.micVolume"
                :min="0"
                :max="2"
                :step="0.05"
                :show-tooltip="false"
                @update:model-value="voice.setMicVolume"
              />
              <span class="vol-pct">{{ Math.round(voice.prefs.micVolume * 100) }}%</span>
            </div>
            <div class="vol-item listen" title="收听音量（你听到队友的总音量）">
              <span class="pref-ic listen"><el-icon :size="12"><Headset /></el-icon></span>
              <el-slider
                class="vol-slider"
                :model-value="voice.prefs.listenVolume"
                :min="0"
                :max="1"
                :step="0.05"
                :show-tooltip="false"
                @update:model-value="voice.setListenVolume"
              />
              <span class="vol-pct">{{ Math.round(voice.prefs.listenVolume * 100) }}%</span>
            </div>
          </div>

        <el-popover
          placement="top-end"
          :width="320"
          trigger="click"
          popper-class="voice-prefs-pop"
          :show-after="0"
          :hide-after="0"
        >
          <template #reference>
            <button class="pref-trigger" title="语音设置" aria-label="语音设置">
              <el-icon :size="18"><Setting /></el-icon>
            </button>
          </template>
          <div class="voice-prefs">
            <div class="pref-row">
              <div class="pref-text">
                <b>噪声抑制</b>
                <span>杂音大时开；觉得人声发闷可以关掉试试</span>
              </div>
              <el-switch
                :model-value="voice.prefs.noiseSuppression"
                @change="(v) => onPref('noiseSuppression', v)"
              />
            </div>
            <div class="pref-row">
              <div class="pref-text">
                <b>自动增益</b>
                <span>自动拉高说话音量；忽大忽小时可关闭</span>
              </div>
              <el-switch
                :model-value="voice.prefs.autoGainControl"
                @change="(v) => onPref('autoGainControl', v)"
              />
            </div>
            <div class="pref-row">
              <div class="pref-text">
                <b>回声消除</b>
                <span>外放扬声器时必开；全程戴耳机可关闭</span>
              </div>
              <el-switch
                :model-value="voice.prefs.echoCancellation"
                @change="(v) => onPref('echoCancellation', v)"
              />
            </div>
          </div>
        </el-popover>
        </div>
      </div>

      <div class="action-zone">
        <template v-if="roomStore.isHost">
          <el-button size="large" type="danger" plain @click="confirmClose">解散</el-button>
        </template>
        <el-button size="large" type="danger" @click="leave">退出房间</el-button>
      </div>
    </footer>
  </div>

  <div v-else class="entering">
    <el-skeleton :rows="4" animated />
  </div>
</template>

<style scoped>
.room-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: calc(100vh - 130px);
  min-height: 560px;
}

.entering {
  padding: 40px;
}

/* ---- 头部：房间信息在上，任务卡片铺满下方 ---- */
.room-head {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px;
}

.room-info {
  min-width: 0;
}

.line-1 {
  display: flex;
  align-items: center;
  gap: 10px;
}

.line-1 h2 {
  margin: 0;
  font-size: 19px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--dsh-dim);
}

.note {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--dsh-text);
}

.task-banner {
  padding: 10px 14px;
  background: var(--dsh-bg-soft);
  border-left: 3px solid var(--dsh-accent);
}

.task-banner .label {
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--dsh-accent);
}

.task-name {
  font-size: 14px;
  font-weight: 700;
  margin: 4px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-desc {
  font-size: 12px;
  color: var(--dsh-dim);
  line-height: 1.5;
  max-height: 54px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.task-reward {
  margin-top: 4px;
  font-size: 12px;
  color: var(--dsh-accent);
}

/* ---- 主体 ---- */
.room-main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 14px;
}

.members-panel {
  padding: 16px;
  overflow-y: auto;
}

.members-panel .section-title {
  margin-bottom: 14px;
}

.count {
  color: var(--dsh-dim);
  font-weight: 400;
  font-size: 13px;
}

.voice-hint {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--dsh-voice);
}

.members-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  gap: 12px;
  align-content: start;
}

.chat-wrap {
  min-height: 0;
  overflow: hidden;
}

/* ---- 控制条：与上方「队员/聊天」同构栅格，两侧内容分别对齐两个面板 ---- */
.control-bar {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 14px;
  align-items: center;
  padding: 12px 20px;
}

.voice-zone {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 音量条 + 齿轮：与队员面板右缘对齐 */
.voice-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

/* 音量条：紧贴齿轮的紧凑调节条 */
.vol-strip {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 2px;
}

.vol-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.vol-item .vol-slider {
  width: 84px;
  --el-slider-height: 3px;
  --el-slider-button-size: 12px;
  --el-slider-main-bg-color: var(--dsh-accent);
  --el-slider-button-border-color: var(--dsh-accent);
}

/* 拖动跟手：去掉滑杆各部件的过渡动画 */
.vol-slider :deep(.el-slider__bar),
.vol-slider :deep(.el-slider__button-wrapper),
.vol-slider :deep(.el-slider__button) {
  transition: none;
}

.vol-item.listen .vol-slider {
  --el-slider-main-bg-color: var(--dsh-voice);
  --el-slider-button-border-color: var(--dsh-voice);
}

.vol-pct {
  width: 34px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--dsh-dim);
  text-align: right;
}

.vol-item.mic .vol-pct {
  color: var(--dsh-accent);
}

.vol-item.listen .vol-pct {
  color: var(--dsh-voice);
}

/* 语音设置触发钮：贴合控制条的方形图标钮，悬停齿轮转动 */
.pref-trigger {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  background: var(--dsh-panel);
  border: 1px solid var(--dsh-border);
  border-radius: 6px;
  color: var(--dsh-dim);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.pref-trigger:hover {
  color: var(--dsh-accent);
  border-color: var(--dsh-accent-dim);
  background: rgba(255, 176, 46, 0.06);
}

.pref-trigger :deep(.el-icon) {
  transition: transform 0.35s ease;
}

.pref-trigger:hover :deep(.el-icon) {
  transform: rotate(60deg);
}

.voice-prefs {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pref-section {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--dsh-dim);
}

.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pref-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}

.pref-text b {
  font-size: 13px;
}

.pref-text span {
  font-size: 12px;
  color: var(--dsh-dim);
}

.pref-ic {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pref-ic.mic {
  color: var(--dsh-accent);
  background: rgba(255, 176, 46, 0.1);
  border: 1px solid var(--dsh-accent-dim);
}

.pref-ic.listen {
  color: var(--dsh-voice);
  background: rgba(61, 220, 151, 0.1);
  border: 1px solid var(--dsh-voice-dim, #2c6e57);
}

.action-zone {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
</style>

<style>
/* 语音设置弹层（挂在 body 下，需全局样式）：收起动画提速，消除延迟感 */
.voice-prefs-pop.el-popper {
  --el-transition-duration: 0.1s;
}

.voice-prefs-pop.el-zoom-in-top-enter-active,
.voice-prefs-pop.el-zoom-in-top-leave-active,
.voice-prefs-pop.el-fade-in-linear-enter-active,
.voice-prefs-pop.el-fade-in-linear-leave-active {
  transition-duration: 0.1s !important;
}
</style>

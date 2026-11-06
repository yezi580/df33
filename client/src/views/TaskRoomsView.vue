<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Back, Plus } from '@element-plus/icons-vue'
import { useLobbyStore } from '../stores/lobby'
import { useRoomStore } from '../stores/room'
import { useUserStore } from '../stores/user'
import RoomCard from '../components/RoomCard.vue'
import CreateRoomDialog from '../components/CreateRoomDialog.vue'

const route = useRoute()
const router = useRouter()
const lobby = useLobbyStore()
const roomStore = useRoomStore()
const user = useUserStore()

const showCreate = ref(false)
const joiningId = ref('')

const taskId = computed(() => route.params.taskId)
const task = computed(() => lobby.taskById(taskId.value))
const modeClass = computed(() => ({ 命运契约: 'fate' })[task.value?.mode] ?? 'phase')
const rooms = computed(() =>
  [...lobby.roomsByTask(taskId.value)].sort((a, b) => b.createdAt - a.createdAt)
)

onMounted(() => {
  lobby.loadTasks()
  lobby.subscribe()
})

async function join(room) {
  joiningId.value = room.id
  try {
    const res = await roomStore.joinRoom(room.id)
    if (res.ok) router.push(`/room/${room.id}`)
    else if (res.code === 'NEED_LOGIN') {
      // 服务端兜底（覆盖本地登录态误判/会话过期）：弹登录框，成功后自动续做加入
      user.onNeedLogin(() => join(room))
    } else ElMessage.error(res.error)
  } finally {
    joiningId.value = ''
  }
}
</script>

<template>
  <div class="task-rooms">
    <div class="top-bar">
      <el-button :icon="Back" @click="router.push('/')">返回大厅</el-button>
      <el-button type="primary" :icon="Plus" @click="user.requireLogin(() => (showCreate = true))">
        创建队伍
      </el-button>
    </div>

    <section v-if="task" class="task-info tactical-card">
      <div class="tags">
        <span class="mode-tag" :class="modeClass">{{ task.mode }}</span>
        <span class="cat-tag">{{ task.category }}</span>
      </div>
      <h2>{{ task.name }}</h2>
      <p style="white-space: pre-line">{{ task.description }}</p>
      <p v-if="task.reward" class="reward">🏆 {{ task.reward }}</p>
    </section>

    <div class="section-title" style="margin: 20px 0 14px">
      正在招募（{{ rooms.length }}）
    </div>

    <el-empty v-if="!rooms.length" description="还没有队伍在做这个任务，创建第一个吧" />

    <div v-else class="room-grid">
      <RoomCard
        v-for="r in rooms"
        :key="r.id"
        :room="r"
        :joining="joiningId === r.id"
        @join="join"
      />
    </div>

    <CreateRoomDialog v-model="showCreate" :task-id="taskId" />
  </div>
</template>

<style scoped>
.top-bar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}

.task-info {
  padding: 20px 24px;
}

.tags {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.mode-tag,
.cat-tag {
  font-size: 12px;
  padding: 2px 10px;
  letter-spacing: 1px;
}

.mode-tag {
  color: #85d16b;
  border: 1px solid #4e7a3d;
}

.mode-tag.phase {
  color: var(--dsh-accent);
  border-color: var(--dsh-accent-dim);
}

.mode-tag.fate {
  color: #c589e6;
  border-color: #7d4a9e;
}

.cat-tag {
  color: var(--dsh-dim);
  border: 1px solid var(--dsh-border);
}

.task-info h2 {
  margin: 0 0 8px;
  font-size: 20px;
}

.task-info p {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--dsh-dim);
  line-height: 1.7;
}

.reward {
  color: var(--dsh-accent) !important;
}

.room-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}
</style>

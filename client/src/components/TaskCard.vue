<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLobbyStore } from '../stores/lobby'

const props = defineProps({ task: { type: Object, required: true } })
const lobby = useLobbyStore()
const router = useRouter()

const stats = computed(() => lobby.statsOf(props.task.id))

const modeClass = computed(() => ({ 命运契约: 'fate' })[props.task.mode] ?? 'phase')

// 整卡可点进组队；按钮复用同一入口（.stop 防冒泡重复触发）
function enter() {
  router.push(`/task/${props.task.id}`)
}
</script>

<template>
  <div
    class="task-card tactical-card tactical-card--hover"
    role="button"
    tabindex="0"
    @click="enter"
    @keydown.enter="enter"
  >
    <div class="tags">
      <span class="mode-tag" :class="modeClass">{{ task.mode }}</span>
      <span class="cat-tag">{{ task.category }}</span>
    </div>
    <h3 class="name" :title="task.name">{{ task.name }}</h3>
    <p class="desc">{{ task.description }}</p>
    <p v-if="task.reward" class="reward">🏆 {{ task.reward }}</p>
    <div class="foot">
      <div class="stats">
        <span>🎯 {{ stats.roomCount }} 队</span>
        <span>👥 {{ stats.playerCount }} 人</span>
        <span>🎧 {{ stats.voiceCount }}</span>
      </div>
      <el-button type="primary" size="small" @click.stop="enter">进入组队</el-button>
    </div>
  </div>
</template>

<style scoped>
.task-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 16px 14px;
  cursor: pointer;
}

.tags {
  display: flex;
  gap: 8px;
}

.mode-tag,
.cat-tag {
  font-size: 12px;
  padding: 2px 10px;
  letter-spacing: 1px;
}

.mode-tag.phase {
  color: var(--dsh-accent);
  border: 1px solid var(--dsh-accent-dim);
  background: rgba(255, 176, 46, 0.08);
}

.mode-tag.fate {
  color: #c589e6;
  border: 1px solid #7d4a9e;
  background: rgba(154, 111, 224, 0.1);
}

.mode-tag.common {
  color: #85d16b;
  border: 1px solid #4e7a3d;
  background: rgba(103, 194, 58, 0.08);
}

.cat-tag {
  color: var(--dsh-dim);
  border: 1px solid var(--dsh-border);
}

.name {
  margin: 0;
  font-size: 16px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}

.desc {
  margin: 0;
  font-size: 13px;
  color: var(--dsh-dim);
  line-height: 1.6;
  min-height: 42px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.reward {
  margin: 0;
  font-size: 12px;
  color: var(--dsh-accent);
  opacity: 0.85;
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px dashed var(--dsh-border);
}

.stats {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: var(--dsh-dim);
}
</style>

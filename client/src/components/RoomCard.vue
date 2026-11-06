<script setup>
import { computed } from 'vue'

const props = defineProps({
  room: { type: Object, required: true },
  joining: Boolean,
})
const emit = defineEmits(['join'])

const isFull = computed(() => props.room.memberCount >= props.room.maxSize)

const statusText = computed(() => (isFull.value ? '已满员' : '招募中'))
const statusType = computed(() => (isFull.value ? 'info' : 'success'))
</script>

<template>
  <div class="room-card tactical-card tactical-card--hover">
    <div class="row-1">
      <span class="name" :title="room.name">{{ room.name }}</span>
      <el-tag :type="statusType" size="small" effect="dark">{{ statusText }}</el-tag>
    </div>
    <p v-if="room.note" class="note" :title="room.note">💬 {{ room.note }}</p>
    <div class="row-2">
      <span class="host">房主 {{ room.hostName }}</span>
      <span class="voice">🎧 {{ room.voiceCount }} 人语音</span>
    </div>
    <div class="row-3">
      <div class="slots">
        <div class="bar">
          <div class="bar-fill" :style="{ width: `${(room.memberCount / room.maxSize) * 100}%` }"></div>
        </div>
        <span class="slot-text">{{ room.memberCount }}/{{ room.maxSize }} 人</span>
      </div>
      <el-button
        type="primary"
        size="small"
        :disabled="isFull"
        :loading="joining"
        @click="emit('join', room)"
      >
        {{ isFull ? '已满' : '加入' }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.room-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
}

.row-1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.name {
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note {
  margin: 0;
  font-size: 13px;
  color: var(--dsh-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-2 {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--dsh-dim);
}

.voice {
  color: var(--dsh-voice);
}

.row-3 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 2px;
}

.slots {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.bar {
  flex: 1;
  height: 6px;
  background: var(--dsh-bg-soft);
  border: 1px solid var(--dsh-border);
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--dsh-accent-dim), var(--dsh-accent));
  transition: width 0.3s;
}

.slot-text {
  font-size: 12px;
  color: var(--dsh-dim);
  white-space: nowrap;
}
</style>

<script setup>
import { computed } from 'vue'
import { Mic, Mute, Close } from '@element-plus/icons-vue'

const props = defineProps({
  member: { type: Object, required: true },
  meId: { type: String, default: '' },
  level: { type: Number, default: 0 }, // 0..1 说话音量
  volume: { type: Number, default: 1 }, // 该成员的独立收听音量
  canKick: Boolean,
})
const emit = defineEmits(['kick', 'volume'])

const isMe = computed(() => props.member.id === props.meId)
const isSpeaking = computed(() => props.member.inVoice && !props.member.muted && props.level > 0.12)
const micClass = computed(() => (!props.member.inVoice ? 'off' : props.member.muted ? 'muted' : 'on'))
const showVolume = computed(() => props.member.inVoice && !isMe.value)

const glow = computed(() => {
  if (!isSpeaking.value) return 'none'
  const r = 6 + props.level * 22
  return `0 0 ${r}px ${props.member.color}, 0 0 ${r}px rgba(255,255,255,${0.1 + props.level * 0.2})`
})
</script>

<template>
  <div class="member-tile" :class="{ me: isMe, speaking: isSpeaking }">
    <button v-if="canKick && !isMe" class="kick" title="移出队伍" @click="emit('kick', member)">
      <el-icon><Close /></el-icon>
    </button>
    <div class="avatar" :style="{ background: member.color, boxShadow: glow }">
      {{ member.nickname.slice(0, 1) }}
      <span v-if="member.isHost" class="crown" title="房主">👑</span>
      <span class="mic-badge" :class="micClass">
        <el-icon v-if="!member.inVoice" class="ic-off"><Mute /></el-icon>
        <el-icon v-else-if="member.muted" class="ic-muted"><Mute /></el-icon>
        <el-icon v-else class="ic-on"><Mic /></el-icon>
      </span>
    </div>
    <div class="nick" :title="member.nickname">
      {{ member.nickname }}<span v-if="isMe" class="me-tag">（你）</span>
    </div>
    <div class="state">
      <span v-if="member.isHost" class="host-tag">房主</span>
    </div>
    <div v-if="showVolume" class="vol" title="该队友的音量">
      <span class="vol-icon">🔊</span>
      <input
        class="vol-range"
        type="range"
        min="0"
        max="100"
        step="5"
        :value="Math.round(volume * 100)"
        @input="emit('volume', $event.target.value / 100)"
      />
    </div>
  </div>
</template>

<style scoped>
.member-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 8px 10px;
  background: var(--dsh-bg-soft);
  border: 1px solid transparent;
  transition: border-color 0.2s;
}

.member-tile.me {
  border-color: var(--dsh-accent-dim);
}

.member-tile.speaking {
  border-color: var(--dsh-voice);
}

.avatar {
  position: relative;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  font-size: 22px;
  font-weight: 800;
  color: #10161d;
  transition: box-shadow 0.1s linear;
}

.crown {
  position: absolute;
  top: -10px;
  right: -6px;
  font-size: 16px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
}

.mic-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #10161d;
  border: 1px solid var(--dsh-border);
}

.mic-badge :deep(.el-icon) {
  font-size: 12px;
}

.ic-off {
  color: #5d6b78;
}

.ic-muted {
  color: var(--dsh-danger);
}

.ic-on {
  color: var(--dsh-voice);
}

.nick {
  max-width: 100%;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.me-tag {
  color: var(--dsh-accent);
  font-size: 12px;
}

.state {
  display: flex;
  gap: 6px;
  height: 20px;
  font-size: 11px;
}

.host-tag {
  color: var(--dsh-accent);
}

.vol {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 0 4px;
}

.vol-icon {
  font-size: 11px;
  opacity: 0.7;
}

.vol-range {
  flex: 1;
  height: 3px;
  appearance: none;
  background: var(--dsh-border);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.vol-range::-webkit-slider-thumb {
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--dsh-accent);
  border: none;
}

.vol-range::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--dsh-accent);
  border: none;
}

.kick {
  position: absolute;
  top: 4px;
  right: 4px;
  display: none;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--dsh-border);
  background: var(--dsh-panel);
  color: var(--dsh-danger);
  cursor: pointer;
}

.member-tile:hover .kick {
  display: grid;
}
</style>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { Promotion } from '@element-plus/icons-vue'

const props = defineProps({
  messages: { type: Array, default: () => [] },
  meId: { type: String, default: '' },
})
const emit = defineEmits(['send'])

const input = ref('')
const listEl = ref(null)

watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  }
)

function fmtTime(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function send() {
  const text = input.value.trim()
  if (!text) return
  emit('send', text)
  input.value = ''
}
</script>

<template>
  <div class="chat-panel">
    <div ref="listEl" class="msg-list thin-scroll">
      <div v-if="!messages.length" class="empty">暂无消息，和队友打个招呼吧 👋</div>
      <template v-for="msg in messages" :key="msg.id">
        <div v-if="msg.system" class="sys-msg">{{ msg.text }}</div>
        <div v-else class="msg" :class="{ mine: msg.from === meId }">
          <span class="avatar-dot" :style="{ background: msg.color }">{{ msg.nickname.slice(0, 1) }}</span>
          <div class="body">
            <div class="meta">
              <span class="name">{{ msg.nickname }}</span>
              <span class="time">{{ fmtTime(msg.ts) }}</span>
            </div>
            <div class="bubble">{{ msg.text }}</div>
          </div>
        </div>
      </template>
    </div>
    <div class="input-row">
      <el-input
        v-model="input"
        placeholder="按 Enter 发送…"
        maxlength="500"
        clearable
        @keyup.enter="send"
      />
      <el-button type="primary" :icon="Promotion" @click="send">发送</el-button>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.msg-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty {
  margin: auto;
  font-size: 13px;
  color: var(--dsh-dim);
}

.sys-msg {
  align-self: center;
  font-size: 12px;
  color: var(--dsh-dim);
  padding: 2px 10px;
  background: var(--dsh-bg-soft);
  border: 1px dashed var(--dsh-border);
}

.msg {
  display: flex;
  gap: 8px;
}

.msg.mine {
  flex-direction: row-reverse;
}

.avatar-dot {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 700;
  color: #10161d;
  margin-top: 2px;
}

.body {
  max-width: 75%;
}

.meta {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 3px;
}

.msg.mine .meta {
  flex-direction: row-reverse;
}

.name {
  font-size: 12px;
  font-weight: 600;
}

.time {
  font-size: 11px;
  color: var(--dsh-dim);
}

.bubble {
  padding: 7px 12px;
  font-size: 13px;
  line-height: 1.5;
  background: var(--dsh-bg-soft);
  border: 1px solid var(--dsh-border);
  word-break: break-word;
  white-space: pre-wrap;
}

.msg.mine .bubble {
  background: rgba(255, 176, 46, 0.1);
  border-color: var(--dsh-accent-dim);
}

.input-row {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--dsh-border);
}
</style>

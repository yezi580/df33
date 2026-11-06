<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../stores/user'
import { AVATAR_COLORS } from '../lib/socket'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])

const user = useUserStore()
const name = ref('')
const color = ref(AVATAR_COLORS[0])

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      name.value = user.nickname
      color.value = AVATAR_COLORS.includes(user.color)
        ? user.color
        : AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
    }
  }
)

function randomName() {
  name.value = `干员${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function save() {
  if (!name.value.trim()) {
    ElMessage.warning('先给自己起个代号')
    return
  }
  user.saveProfile(name.value, color.value)
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="设置你的干员代号"
    width="420px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="form">
      <div class="preview">
        <span class="preview-avatar" :style="{ background: color }">{{ (name || '?').slice(0, 1) }}</span>
        <span class="preview-name">{{ name || '？？？' }}</span>
      </div>

      <div class="field">
        <label>代号（最多 12 字）</label>
        <div class="name-row">
          <el-input v-model="name" maxlength="12" placeholder="队友怎么称呼你？" clearable />
          <el-button @click="randomName">随机</el-button>
        </div>
      </div>

      <div class="field">
        <label>识别色</label>
        <div class="colors">
          <button
            v-for="c in AVATAR_COLORS"
            :key="c"
            class="color-dot"
            :class="{ active: c === color }"
            :style="{ background: c }"
            @click="color = c"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <span v-if="user.loggedIn" class="sync-hint">改名将同步到你的账号</span>
      <el-button type="primary" @click="save">确认就位</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--dsh-bg-soft);
  border: 1px solid var(--dsh-border);
}

.preview-avatar {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 18px;
  font-weight: 800;
  color: #10161d;
}

.preview-name {
  font-size: 16px;
  font-weight: 600;
}

.field label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--dsh-dim);
}

.name-row {
  display: flex;
  gap: 8px;
}

.colors {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.color-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}

.color-dot.active {
  border-color: #fff;
  box-shadow: 0 0 0 2px var(--dsh-accent);
}

.sync-hint {
  margin-right: auto;
  font-size: 12px;
  color: var(--dsh-dim);
}
</style>

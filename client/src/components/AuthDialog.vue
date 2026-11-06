<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../stores/user'
import { AVATAR_COLORS } from '../lib/socket'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])

const user = useUserStore()
const mode = ref('login') // login | register
const phone = ref('')
const password = ref('')
const name = ref('')
const color = ref(AVATAR_COLORS[0])
const submitting = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      mode.value = 'login'
      phone.value = ''
      password.value = ''
      name.value = user.hasProfile ? user.nickname : ''
      color.value = AVATAR_COLORS.includes(user.color)
        ? user.color
        : AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
    }
  }
)

function randomName() {
  name.value = `干员${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function validate() {
  if (!/^1[3-9]\d{9}$/.test(phone.value.trim())) return '请输入正确的手机号'
  if (password.value.length < 6 || password.value.length > 12) return '密码需为 6-12 位'
  if (mode.value === 'register' && !name.value.trim()) return '请先给自己起个代号'
  return ''
}

async function submit() {
  const err = validate()
  if (err) {
    ElMessage.warning(err)
    return
  }
  submitting.value = true
  try {
    if (mode.value === 'login') {
      await user.login(phone.value.trim(), password.value)
      ElMessage.success(`欢迎回来，${user.nickname}`)
    } else {
      await user.register({
        phone: phone.value.trim(),
        password: password.value,
        nickname: name.value.trim(),
        color: color.value,
      })
      ElMessage.success(`就位，${user.nickname}`)
    }
    emit('update:modelValue', false)
  } catch (e) {
    ElMessage.error(e.message || '请求失败，请稍后再试')
  } finally {
    submitting.value = false
  }
}

// 用户主动关闭（X / 取消）视为放弃登录，清掉挂起的续做操作
function onClose(visible) {
  if (!visible) user.cancelPending()
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="干员登录"
    width="420px"
    :close-on-click-modal="false"
    @update:model-value="onClose"
  >
    <div class="tabs">
      <button class="tab" :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</button>
      <button class="tab" :class="{ active: mode === 'register' }" @click="mode = 'register'">
        注册新账号
      </button>
    </div>

    <div class="form">
      <div class="field">
        <label>手机号</label>
        <el-input v-model="phone" maxlength="11" placeholder="11 位手机号" clearable />
      </div>

      <div class="field">
        <label>密码</label>
        <el-input
          v-model="password"
          type="password"
          maxlength="12"
          show-password
          placeholder="6-12 位密码"
          @keyup.enter="submit"
        />
      </div>

      <template v-if="mode === 'register'">
        <div class="preview">
          <span class="preview-avatar" :style="{ background: color }">{{
            (name || '?').slice(0, 1)
          }}</span>
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
      </template>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        {{ mode === 'login' ? '登录' : '注册并进入' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 18px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--dsh-border);
}

.tab {
  padding: 8px 2px;
  font-size: 14px;
  color: var(--dsh-dim);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.15s;
}

.tab.active {
  color: var(--dsh-accent);
  border-bottom-color: var(--dsh-accent);
  font-weight: 600;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 18px;
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
</style>

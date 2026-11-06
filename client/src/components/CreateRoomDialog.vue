<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../stores/user'
import { useRoomStore } from '../stores/room'

const props = defineProps({
  modelValue: Boolean,
  taskId: { type: String, required: true },
})
const emit = defineEmits(['update:modelValue'])

const user = useUserStore()
const roomStore = useRoomStore()
const router = useRouter()

const form = ref({ name: '', maxSize: 3, note: '' })
const creating = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (open) form.value = { name: `${user.nickname || '干员'}的队伍`, maxSize: 3, note: '' }
  }
)

async function create() {
  creating.value = true
  try {
    const res = await roomStore.createRoom({ taskId: props.taskId, ...form.value })
    if (res.ok) {
      emit('update:modelValue', false)
      router.push(`/room/${res.room.id}`)
    } else {
      ElMessage.error(res.error)
    }
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="创建队伍"
    width="440px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-width="80px" label-position="left">
      <el-form-item label="队伍名称">
        <el-input v-model="form.name" maxlength="30" placeholder="给队伍起个响亮的名字" />
      </el-form-item>
      <el-form-item label="人数上限">
        <el-select v-model="form.maxSize" style="width: 120px">
          <el-option v-for="n in 5" :key="n + 1" :label="`${n + 1} 人`" :value="n + 1" />
        </el-select>
        <span class="tip">三角洲烽火地带小队最多 3 人，全面战场可更多</span>
      </el-form-item>
      <el-form-item label="备注">
        <el-input
          v-model="form.note"
          maxlength="100"
          placeholder="例如：缺1输出，带资进组，晚上8点开打"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="creating" @click="create">创建并进入</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.tip {
  margin-left: 12px;
  font-size: 12px;
  color: var(--dsh-dim);
}
</style>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { Search } from '@element-plus/icons-vue'
import { useLobbyStore } from '../stores/lobby'
import TaskCard from '../components/TaskCard.vue'

const lobby = useLobbyStore()
// 阶段/细分筛选放在 store：进入组队再返回大厅时保留上次的浏览位置
const { mode, subCat } = storeToRefs(lobby)
const keyword = ref('')
const MODES = ['第一阶段', '第二阶段', '第三阶段', '第四阶段', '命运契约']

/** 当前阶段下的细分任务链（保持种子顺序），单一链的阶段不显示子筛选 */
const chains = computed(() => {
  const seen = new Set()
  for (const t of lobby.tasks) {
    if (t.mode === mode.value && !seen.has(t.category)) seen.add(t.category)
  }
  return [...seen]
})

// 无「全部」选项：切换阶段后若当前链不存在，自动落到该阶段第一条链
// immediate 确保从任务页返回（tasks 已缓存）时也能立即校正选中态
watch(
  chains,
  (list) => {
    if (!list.includes(subCat.value)) subCat.value = list[0] ?? ''
  },
  { immediate: true }
)

const filtered = computed(() => {
  const kw = keyword.value.trim()
  return lobby.tasks.filter((t) => {
    if (t.mode !== mode.value) return false
    if (t.category !== subCat.value) return false
    if (kw && !`${t.name}${t.description}${t.category}`.includes(kw)) return false
    return true
  })
})

const season = computed(() => lobby.tasks[0]?.season ?? '')

/** 阶段页签滑动指示条：实测激活按钮坐标（不依赖等宽标签），ResizeObserver 兜底窗口缩放 */
const tabsRef = ref(null)
const indicatorStyle = ref({ opacity: 0 })
function syncIndicator() {
  const active = tabsRef.value?.querySelector('.mode-tab.active')
  if (!active || !tabsRef.value) return
  const y = active.offsetTop + active.offsetHeight - 2 // 压在页签行底部描线上
  indicatorStyle.value = {
    transform: `translate(${active.offsetLeft}px, ${y}px)`,
    width: `${active.offsetWidth}px`,
    opacity: 1,
  }
}
watch(mode, () => nextTick(syncIndicator))
onMounted(() => {
  nextTick(syncIndicator)
  if (typeof ResizeObserver !== 'undefined' && tabsRef.value) {
    new ResizeObserver(syncIndicator).observe(tabsRef.value)
  }
})
</script>

<template>
  <div class="lobby">
    <section class="hero tactical-card">
      <div class="hero-text">
        <p class="season">{{ season || 'SEASON' }} · 赛季任务</p>
        <h2>选任务，找队友，开语音，一把过</h2>
        <p class="sub">
          按赛季任务组队：选中你要做的任务，加入正在招募的队伍，进房即连语音，边打边聊。
        </p>
      </div>
      <div class="hero-stats">
        <div class="stat">
          <b>{{ lobby.onlineStats.roomCount }}</b>
          <span>招募中队伍</span>
        </div>
        <div class="stat">
          <b>{{ lobby.onlineStats.playerCount }}</b>
          <span>在线干员</span>
        </div>
        <div class="stat">
          <b>{{ lobby.onlineStats.voiceCount }}</b>
          <span>语音中</span>
        </div>
      </div>
    </section>

    <div class="filter-bar">
      <div ref="tabsRef" class="mode-tabs">
        <button
          v-for="m in MODES"
          :key="m"
          class="mode-tab"
          :class="{ active: mode === m }"
          @click="mode = m"
        >
          {{ m }}
        </button>
        <span class="tab-indicator" :style="indicatorStyle"></span>
      </div>
      <el-input
        v-model="keyword"
        placeholder="搜索任务名 / 描述 / 分类"
        clearable
        :prefix-icon="Search"
        class="search"
      />
    </div>

    <!-- 细分任务链子筛选（无「全部」，始终选中一条链；单一链的阶段自动隐藏） -->
    <transition name="bar-swap">
      <div v-if="chains.length > 1" class="sub-tabs">
        <button
          v-for="c in chains"
          :key="c"
          class="sub-tab"
          :class="{ active: subCat === c }"
          @click="subCat = c"
        >
          <span class="tab-label">{{ c }}</span>
        </button>
      </div>
    </transition>

    <div v-if="!lobby.tasksLoaded && !lobby.tasksError" class="loading">
      <el-skeleton :rows="3" animated />
    </div>

    <el-alert
      v-else-if="lobby.tasksError"
      :title="lobby.tasksError"
      type="error"
      show-icon
      :closable="false"
    />

    <el-empty v-else-if="!filtered.length" description="没有匹配的任务，换个筛选条件试试" />

    <!-- 切换阶段/任务链时列表交叉淡入淡出（key 变化触发，搜索筛选不触发） -->
    <transition v-else name="tab-swap" mode="out-in">
      <div class="task-grid" :key="mode + '|' + subCat">
        <TaskCard v-for="t in filtered" :key="t.id" :task="t" />
      </div>
    </transition>
  </div>
</template>

<style scoped>
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  padding: 28px 32px;
  margin-bottom: 18px;
  background:
    linear-gradient(120deg, rgba(255, 176, 46, 0.12), transparent 45%),
    linear-gradient(160deg, var(--dsh-panel-2), var(--dsh-panel));
}

.season {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 3px;
  color: var(--dsh-accent);
}

.hero-text h2 {
  margin: 0 0 10px;
  font-size: 24px;
  letter-spacing: 1px;
}

.sub {
  margin: 0;
  font-size: 13px;
  color: var(--dsh-dim);
  max-width: 520px;
  line-height: 1.7;
}

.hero-stats {
  display: flex;
  gap: 12px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 86px;
  padding: 14px 10px;
  background: var(--dsh-bg-soft);
  border: 1px solid var(--dsh-border);
}

.stat b {
  font-size: 22px;
  color: var(--dsh-accent);
}

.stat span {
  font-size: 12px;
  color: var(--dsh-dim);
}

.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.mode-tabs {
  position: relative;
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--dsh-border);
}

.mode-tab {
  padding: 10px 18px 12px;
  font-size: 14px;
  letter-spacing: 1px;
  color: var(--dsh-dim);
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.25s;
}

.mode-tab:hover {
  color: var(--dsh-text);
}

.mode-tab.active {
  color: var(--dsh-accent);
}

/* 滑动指示条：位置由 JS 实测激活按钮坐标驱动，压在页签行底部描线上 */
.tab-indicator {
  position: absolute;
  top: 0;
  left: 0;
  height: 2px;
  background: var(--dsh-accent);
  transition:
    transform 0.3s cubic-bezier(0.33, 0, 0.2, 1),
    width 0.3s cubic-bezier(0.33, 0, 0.2, 1),
    opacity 0.2s;
  will-change: transform, width;
}

.sub-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.sub-tab {
  position: relative;
  overflow: hidden;
  padding: 5px 14px;
  font-size: 13px;
  color: var(--dsh-dim);
  background: var(--dsh-bg-soft);
  border: 1px solid var(--dsh-border);
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}

/* 激活填充：琥珀淡色从左向右擦入（比阶段页签轻一档） */
.sub-tab::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 176, 46, 0.12);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.25s ease;
}

.sub-tab .tab-label {
  position: relative;
  z-index: 1;
}

.sub-tab:hover {
  color: var(--dsh-text);
  border-color: var(--dsh-accent-dim);
}

.sub-tab.active {
  color: var(--dsh-accent);
  border-color: var(--dsh-accent);
  font-weight: 600;
}

.sub-tab.active::before {
  transform: scaleX(1);
}

/* 任务列表切换：旧列表上移淡出 → 新列表下方淡入 */
.tab-swap-enter-active,
.tab-swap-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.tab-swap-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.tab-swap-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* 子筛选栏出现/隐藏：淡入淡出 + 轻微下移 */
.bar-swap-enter-active,
.bar-swap-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.bar-swap-enter-from,
.bar-swap-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .mode-tab,
  .tab-indicator,
  .sub-tab,
  .sub-tab::before,
  .tab-swap-enter-active,
  .tab-swap-leave-active,
  .bar-swap-enter-active,
  .bar-swap-leave-active {
    transition: none;
  }
}

.search {
  width: 280px;
}

.task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 16px;
}

.loading {
  padding: 24px;
  background: var(--dsh-panel);
  border: 1px solid var(--dsh-border);
}
</style>

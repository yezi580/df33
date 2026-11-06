# 三角洲组队大厅（DF33）

以**赛季任务**为核心的三角洲行动组队网站：选任务 → 加入正在招募的队伍 → 进房即连 WebRTC 实时语音，边打边聊。

## 分类结构（S10 裂变）

任务数据抓取自 [orzice.com 赛季任务页](https://orzice.com/v/task_s10)，共 133 个任务：

- **第一阶段 ~ 第四阶段**：赛季主线/支线任务，按阶段解锁；每个阶段下有细分任务链（主线、配给运用作战、保障有力、战斗专家系列等），大厅内以子筛选页签呈现
- **命运契约**：赛季末高难任务链

## 技术栈

- **前端**：Vue 3 + Vite + Element Plus + Pinia + Vue Router
- **后端**：Node.js (Express + Socket.IO)，数据库用 Node 24 内置的 `node:sqlite`（零原生依赖）
- **语音**：WebRTC P2P 网状连接（小队 3-6 人场景），Socket.IO 做信令中继

## 快速开始

```bash
# 1. 安装依赖（根目录 + server + client）
npm run setup

# 2. 开发模式（同时启动后端 3001 和前端 5173）
npm run dev
```

打开 http://localhost:5173 即可。开两个浏览器标签页（或一台机器 + 局域网另一台设备访问 `http://<你的IP>:5173`）分别创建/加入同一队伍，点击「加入语音」即可互相通话测试。

> 语音需要 HTTPS 或 localhost 才能获取麦克风权限。局域网其他设备调试时，Chrome 可先开 `chrome://flags/#unsafely-treat-insecure-origin-as-secure` 填入 `http://<你的IP>:5173`。

## 生产部署

```bash
npm run build   # 打包前端到 client/dist
npm run start   # 3001 端口同时提供 API + 静态页面，单进程即可上线
```

建议用 nginx 反代并配置 **HTTPS 证书**（麦克风权限必需），WebSocket 升级头记得透传。

## 维护任务列表

任务数据在 `server/data/tasks.json`（S10 全部 133 个任务，含阶段/类型/目标/奖励），改完后强制重新播种：

```bash
# Windows (Git Bash / PowerShell)
RESEED=1 npm --prefix server run dev     # Git Bash
# PowerShell
$env:RESEED=1; npm --prefix server run start
```

首次启动会自动把 `tasks.json` 写入 `server/data/hub.db`（SQLite）。

## 语音连不通时（公网环境）

1. P2P 依赖 STUN 打洞，国内可用的公共 STUN 已内置（腾讯 / 小米）。同一局域网不需要 STUN。
2. 若双方 NAT 严格（常见于手机热点对家宽），需要自建 coturn TURN 服务器，并把配置加到 `client/src/lib/rtc.js`。
3. 房间人数 > 6 不建议继续用 P2P 网状（上行带宽 ×N 增长），届时应换 SFU（如 LiveKit / mediasoup）。

## 目录结构

```
server/
  src/index.js      # Express + Socket.IO 入口
  src/db.js         # node:sqlite 初始化与播种
  src/rooms.js      # 内存房间管理器
  src/socket.js     # 房间事件 + WebRTC 信令中继
  data/tasks.json   # 赛季任务种子数据（可编辑）
client/
  src/views/        # 大厅 / 任务房间列表 / 语音房间 三个页面
  src/stores/       # user / lobby / room / voice(WebRTC 引擎)
  src/lib/rtc.js    # ICE 服务器配置
```

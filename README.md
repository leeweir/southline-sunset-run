# 南湾夜行 · Southline: Sunset Run

阿岚开着一辆青绿色的潮汐 GT，替南湾 98.6 FM 收集夜班节目的声音。主线有三章九个委托。自由漫游里可以换车、接警、跑计时赛，也可以从街面飞到楼顶。

**[在线试玩](https://leeweir.github.io/southline-sunset-run/)** · [游戏规格与任务表](SPEC.md)

## 本地试玩

安装 Node.js 24、npm 和 Python 3，在项目根目录运行以下命令。

```sh
npm ci
npm start
```

打开 [本地游戏](http://127.0.0.1:4178/)。启动命令会先构建，再启动仅监听本机的静态服务器。修改源码后运行 `npm run build`，刷新正在试玩的页面就能看到修改。

需要离线携带时，运行 `npm run build`，复制整个 `dist/` 文件夹，双击其中的 `index.html`。脚本、字型、图片和合成电台都在包内。本地网址、公开网址和直接打开的文件分别使用浏览器提供的存储空间。

## 上手

| 想做的事                   | 操作                                                                       |
| -------------------------- | -------------------------------------------------------------------------- |
| 开始主线                   | 点「开始驾驶」，跟金色路线到唱片行；点左上角行程卡查看电台留言和本章节目单 |
| 开车 / 步行                | WASD 或方向键；Space 手刹或步行疾跑；触屏：左半屏按住拖动摇杆              |
| 上车、弃车、切换目标       | E 上下车，步行靠近多辆车时按 Q 选择目标                                    |
| 直接试玩空巡               | 在「城市活动」选「高星追逐」五星，E 弃车，等悬梯靠近后按 F 夺机            |
| 选楼顶、降落、回街面       | M 选停机坪，飞近 H 按 F 降落；E 离舱，到绿色楼梯口按 F 下楼                |
| 打开城市活动 / 地图 / 暂停 | J / M / Esc                                                                |

手机：左半屏任意位置按住拖动即可驾驶摇杆，右下「手刹」按住漂移，步行时换成「疾跑」。进度自动保存在当前浏览器。

## 维护与检查

| 位置                            | 内容                                         |
| ------------------------------- | -------------------------------------------- |
| `src/game/`                     | 城市、主线数据、驾驶、追逐、飞行、活动和存档 |
| `src/render/`                   | 等距投影、街景、车辆、角色、镜头和地图       |
| `src/ui/`                       | 键盘和触屏输入、HUD、活动和对话框            |
| `src/main.js`、`src/runtime.js` | 菜单与游戏的切换、Canvas 和固定步长帧循环    |
| `public/assets/`                | 手绘封面、图标、本地字体及字体许可证         |
| `scripts/build.mjs`、`tests/`   | 离线包构建及可重复的模拟测试                 |
| `dist/`                         | 构建生成的可玩副本                           |

```sh
npm run format
npm run format:check
npm run lint
npm test
npm run build
```

每个源模块显式导入依赖。esbuild 输出一份可从文件系统加载的经典脚本，脚本和样式文件名带有内容哈希。美术、任务规则和已有存档的回归条件见[游戏规格](SPEC.md)。

## 发布

GitHub Pages 使用 GitHub Actions。向 `main` 推送提交，或在 Actions 手动运行 `Test and publish Southline`。工作流依次检查格式、静态分析和测试，再构建并部署 `dist/`。从对应提交的运行记录可查看部署结果。[发布工作流](.github/workflows/pages.yml)

修复前的本地工程保存在标签 `playable-baseline-20261121`。可以在另一个目录打开它，比较旧画面、玩法或存档行为。

```sh
git worktree add --detach ../southline-baseline playable-baseline-20261121
```

## 访问统计

游戏与游戏小屋共用 Umami 站点 `leeweir.github.io`。按标签 `southline-sunset-run` 可以查看本作的浏览量、访客数和访问来源。打开线上游戏页记一次浏览，进入驾驶或打开地图都属于同一次浏览。[南湾夜行统计报表](https://cloud.umami.is/analytics/us/websites/b72a1b50-0b5a-4d61-a9f5-d3878d826048?tag=eq.southline-sunset-run)

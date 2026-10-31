# 随 Git 分发的数据

本目录的 `events.json.gz`、`supplemental-events.json.gz`、`manifest.json` 和本文件应一并提交。无需 Git LFS，也无需上传运行中的 SQLite 文件。

- `events.json.gz`：完整可运行快照，包含全球精选、国家历史与搜索使用的来源记录、月份覆盖及最近同步时间。
- `supplemental-events.json.gz`：固定版本的公开历史事件补充来源，供后续重新筛选。
- `manifest.json`：快照数量、截止日期、事件/地图/图片/字体文件的 SHA-256 与尺寸。
- `history.sqlite`、`history.sqlite-wal`、`history.sqlite-shm`：启动时自动生成，属于本地运行状态，已忽略。
- `source-cache/`：压缩后的抓取缓存，帮助本机后续同步，已忽略。运行已有数据不依赖这些缓存。

地图、照片、署名和许可证位于 `public/geo/`、`public/images/events/`、`public/fonts/`，也应提交。来源与许可见 `docs/SOURCES.md`。

克隆后执行 `npm ci`、`npm run data:verify`、`npm run dev`。第一次启动会自动将快照恢复为 SQLite；也可先执行 `npm run db:restore`，这个步骤不联网。

运行 `npm run sync` 或 `npm run media` 会原子更新事件快照并重新生成清单。更新后的 gzip 和清单需要一起提交。请勿提交 `.env.local` 或密钥。

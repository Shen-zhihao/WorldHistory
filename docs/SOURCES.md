# 数据来源与边界

## Wikipedia 年度大事记

年度页面来自 Wikipedia contributors，例如 [1800（英文）](https://en.wikipedia.org/wiki/1800)、[1800 年（中文）](https://zh.wikipedia.org/wiki/1800%E5%B9%B4)。导入器只提取事件章节中能确定月份及日期的条目，不把出生、逝世、日期未详或进行中的年份级条目伪装成月度事件。现代月份可从 [Current events 月度归档](https://en.wikipedia.org/wiki/Portal:Current_events/October_2026)补充。

年度与当天来源是百科摘要，不是无偏差的全球史全集；内容和区域分布取决于各语言社区的收录。

## 随项目附带的历史补充快照

- 上游：[mneedham/wikipedia-onthisday](https://github.com/mneedham/wikipedia-onthisday)。
- 固定数据版本：[c7dcbbe8c5dab4f2218f95bc254e4b286b52fa3b](https://github.com/mneedham/wikipedia-onthisday/blob/c7dcbbe8c5dab4f2218f95bc254e4b286b52fa3b/events.jsonl)，提交时间 2026-08-24 08:25:36 UTC；本项目于 2026-10-31 下载。
- 原始文件 `events.jsonl` 共 19,860 条，其中包括明确标记的未来/合成示例。本项目**仅**接收 `category = history` 且 `source = Wikipedia contributors` 的条目，严格保留 1800-01-01 至 2026-10-31 的有效日历日期。未来的天文/奥运会数据和全部 synthetic 条目均排除。
- 扫描占位符、未展开的模板和链接标记；下载文件未发现这些损坏内容。最终补充快照共 **15,464 条**。如后续来源出现占位符，应丢弃该记录，不能猜写缺失事实。
- 提取后 JSON 内容 SHA-256：`0f5ee080743029bfc09e6dd7ca13c702ecf08c2942a473195ddbc3729edb69b2`。如压缩为 gzip，此校验针对解压后的 UTF-8 JSON 内容。
- 保存字段：原文摘要、年/月/日、Wikipedia 原始日期页面链接、来源标题、语言。补充数据仍为英文；不使用未经核验的机器翻译冒充中文史料。
- 样本验证：通过 MediaWiki `action=parse&page=January_1&prop=text&format=json` 获取原始 HTML，逐条检查这一天自 1800 年以后的全部 93 条摘要开头，93/93 与主来源一致。这是样本验证，不代表逐条史实审校。
- 原始日页来自 [January 1](https://en.wikipedia.org/wiki/January_1) 至 [December 31](https://en.wikipedia.org/wiki/December_31)，含闰日。每条保存自己的直接来源链接。上游完整来源表见 [NOTICE.md](https://github.com/mneedham/wikipedia-onthisday/blob/c7dcbbe8c5dab4f2218f95bc254e4b286b52fa3b/NOTICE.md)。

## 授权与署名

Wikipedia contributors 的文本以 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 提供。提取、清理、截断、排序及结构化处理属于本项目的改编，改编文本数据继续遵守相同许可；应用代码的许可不替代数据许可。通过事件详情中的来源链接可访问页面贡献历史。Wikipedia 不为本项目背书。

图片不能因为位于 Wikipedia 就视为公共领域：每个 Commons 文件有自己的作者、许可和署名要求。仅在取到文件元数据及可用许可时缓存，记录原始文件页和署名；不明许可图片应跳过。缓存应采用受限尺寸的 WebP，不下载原始超大文件。

## 完整度与“重要”

“每月约五件、重大事件密集月份可扩展”是从可获取候选中作出的产品排序，不能声称是有公认结论的全球重要性排名。历史来源不足五条时显示实际数量，不要求凑满五条，不重复填充、不复制相邻月份、不把年份事件随机分配到月份。事件的国家筛选使用当代国家索引以方便定位；历史疆界图层独立使用下述历史快照，历史政体不会自动等同于现代国家。

## 接口稳定性

2026-10-31 查阅 [官方 Wikifeeds API 文档](https://www.mediawiki.org/wiki/Wikifeeds_API)：该服务自 2026 年 7 月起逐步弃用，替代路由尚待确定。因此附带补充快照不依赖 Wikifeeds 长期可用；启动补齐应优先采用仍可访问的 Wikipedia 页面及 MediaWiki Action API。超时、拒绝访问或缺失页面必须保留待补齐状态并可重试，不能把网络失败视为已同步成功。

## 历史疆界演变图层

历史模式使用 [André Ourednik / historical-basemaps](https://github.com/aourednik/historical-basemaps) 的真实社区重建快照，固定版本 `da7a4b735ecef70aebdc9c73e409d8a2500d50f3`，保留原始 GPL-3.0 许可及转换源码。包含 1800、1815、1878、1880、1900、1914、1920、1930、1938、1945、1960、1994、2000、2010 共 14 个年份。

地图跟随时间轴选择不晚于所选年份的最近快照，同时明确显示实际快照年份；例如 1850 年使用 1815 年快照，2026 年使用 2010 年快照。中间年份没有完整国界数据，不虚构逐年或逐月变动。用户可切换到独立的现代国界图层。历史名称及原始疆界精度等级被保留；跨越多个现代国家的消亡帝国不强行映射成单个现代国家。

文件经过 0.12° Douglas–Peucker 简化、三位小数坐标量化、属性裁减及 gzip 压缩；14 份压缩地图共约 1.23 MB，浏览时按所需年份加载。快照是有近似和争议区域的社区重建，不能作为精确历史疆界或现实领土主张的依据。完整署名、许可证、原始文件链接及可复现转换源码见 `public/geo/history/ATTRIBUTION.md`、`LICENSE`、`prepare.py`。

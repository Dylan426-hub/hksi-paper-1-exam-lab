# HKSI P1 · Institutional Sales Exam Desk

面向 institutional equity sales 的 HKSI Licensing Examination Paper 1 非官方备考工作台。

站点不是电子教材，而是一套针对考试节奏设计的训练界面：先把 60 道原创题拆成 12 个互斥训练板块，沿 Type 1 机构销售的工作判断链顺序练习，再回到 HKSI 九章考纲定位。

## 为什么这样设计

- 当前权威底座为 HKSI LE Paper 1 Study Guide v3.5，自 2026-06-30 起适用。
- 正式考试为 60 道 MCQ、90 分钟、70% 合格；本站模拟完整的计时、跳题、标记与交卷节奏。
- 60 题蓝图为 `3 / 3 / 8 / 14 / 11 / 9 / 6 / 3 / 3`，对应九章官方比重范围，并将训练重心放在 Ch4–6。
- 12 个训练板块覆盖全部 60 题且不重复：B01–B09 为 Type 1 核心，B10–B12 补齐考试制度与发行人知识。
- 每题标注 Level 1–3 认知层级，并记录置信度、错因和错题回炉状态。
- 简体中文用于理解；繁体中文与英文术语用于贴近正式考试措辞。

## 功能

- 版本闸门与本地材料健康检查
- 12 个板块的独立进度、独立正确率和固定顺序训练
- 九章权重地图退为第二层考纲索引
- 95 小时冲刺计划
- 板块专项、9 题诊断、章节练习、错题回炉和混合练习
- 客户会前 8 分钟模式：从 sales 高频章节抽 5 道情景题
- 20 题 / 30 分钟短模考与 60 题 / 90 分钟全真模考
- 放行线：最近三套全真均 ≥80%，Ch4–6 均 ≥80%，无章节低于 70%
- 20 组繁体 / 简体 / 英文术语
- 本地浏览器保存学习进度，可导出 JSON，不上传个人数据

## 本地运行

无需构建步骤：

```bash
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/`。

验证发布树与题库：

```bash
npm test
```

## 来源与版权边界

本站只发布原创摘要、原创练习题、章节权重和来源索引。仓库不包含用户的 ZIP、官方或第三方 PDF / DOCX、课程截图、样题原文或题库转录。

主要官方来源：

- [HKSI Licensing Examination overview](https://www.hksi.org/qualification/examinations/licensing-examination-for-securities-and-futures-intermediaries/overview/)
- [Paper 1 syllabus v3.5](https://www.hksi.org/media/8902/p1-syllabus_eng-v35_clean.pdf)
- [HKSI study-guide version status](https://www.hksi.org/en/qualification/examinations/licensing-examination-for-securities-and-futures-intermediaries/updating-your-study-guides/)
- [HKSI preparation guidelines](https://www.hksi.org/en/qualification/examinations/licensing-examination-for-securities-and-futures-intermediaries/guidelines-for-examination-preparation/)

HKSI、相关机构名称及标准监管术语归各自权利人所有。本项目与 HKSI 无隶属、认可或合作关系，也不构成法律、合规或投资意见。考试规则会更新，使用时应以 HKSI、SFC、HKEX、HKMA 等官方最新资料为准。

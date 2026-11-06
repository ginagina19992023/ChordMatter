# 和弦 · 极简和弦学习器

把科班乐理、琶音指法和你正在弹的曲子连在一起。纯静态网页（PWA），iPhone 上用 Safari 打开 → 分享 → 「添加到主屏幕」，就像 App 一样离线使用。

## 每天 4 步，约 12 分钟（自动安排）
1. **热身**：今日琶音，带指法；连续干净 3 次自动 +4 BPM，连续错 2 次自动 −4。
2. **学**：当前单元的一张课文卡。
3. **练**：8 题，当前单元 + 已掌握单元的薄弱复习；错题会在结尾再出一道。
4. **用**：一首曲子的背谱分层训练（看全谱 → 遮 1/3 → 遮 2/3 → 只看功能）。

## 体验原则
- 一个「继续」按钮把当天 4 步串起来，不需要做选择。
- 没有「我记住了 / 弹对了」这类自评按钮：琶音和「弹下来」只按收音或点键盘的真实结果判定，答题按真实对错记录，所有结果都在「我」页面的记录表里。
- 每课有「本课演示」（应用内自动演示所有例子）和 B 站 / 小红书参考视频搜索。

## 新增
- **简单模式**：用简谱数字级数（1、4、5、6m、5⁷/2）和「稳 / 走 / 紧」代替罗马数字和 T/S/D；点任何和弦都有大白话解释。
- **知识点**：从「C、G7 是什么」到终止式、五度圈，依据 Open Music Theory 等来源整理，附链接。
- **五线谱**：所有和弦、曲目都有大谱表（VexFlow）。
- **弹下来（背谱四层）**：五线谱+标注 → 只留标注 → 只留级数 → 什么都不留。
- **弹奏识别**：在琴边时用 iPhone 麦克风听你弹的和弦/琶音，弹对才往下走；不在琴边时点屏幕键盘；也可以自评。
- **即兴伴奏**：三步配和弦课程、每日配和弦小考、跟弹跟唱（小星星、欢乐颂、送别、生日快乐，均为公有领域）。
- **原曲**：K.545、BWV 846 完整原谱（Verovio 渲染），学习段落高亮，可听全部或只听段落；其他曲目链接 IMSLP / Apple Music。
- **识谱**：上传截图或 PDF，在本机识别谱面上印的和弦记号（Tesseract.js + pdf.js），自动猜调并生成曲目；原谱图片保存在本机，可随时查看。
- **横屏**：练习页横屏时键盘和谱面更大。

## 单元
音程 · 大小三和弦 · 减/增三和弦 · 转位与指法 · 调内三和弦 · 和声功能 · 终止式 · 七和弦 · 小调与和声小调 · 流行进行 · 副属和弦 · 借用和弦
最近 10 题以上正确率 ≥ 80% 自动解锁下一单元。

## 曲目
K.545、克列门蒂 Op.36 No.1、巴赫 BWV 846、天空之城、卡农、Let It Be。可添加自己的曲子（如 Always Online）：抄和弦 → 自动分析级数、功能、终止式、进行模板、低音线。
曲目里的和弦是学习用的简化分析，请对照自己的谱核对。

## 在线地址
https://ginagina19992023.github.io/ChordMatter/

iPhone：用 Safari 打开 → 分享 → 「添加到主屏幕」。

## 部署
GitHub Pages 从 `gh-pages` 分支发布。更新时：`git push origin main && git push origin main:gh-pages`。

## 文件
`theory.js` 乐理引擎 · `data.js` 课程、曲库、知识点 · `app.js` 界面 · `staff.js` 五线谱 · `listen.js` 弹奏识别 · `score.js` 原曲乐谱 · `ocr.js` 识谱 · `style.css` · `sw.js` 离线缓存

## 第三方与版权
- VexFlow（MIT），`vendor/vexflow.js`
- Verovio（LGPL），运行时从 jsDelivr 加载
- K.545 乐谱数据：Craig Stuart Sapp, mozart-piano-sonatas，CC BY-NC-SA 4.0，运行时加载
- BWV 846 乐谱数据：CCARH / humdrum-tools，运行时从原站加载，仅供学习
- `media/u2-minor-triads.mp4`：Mario Ajero《Back to Basics: Minor Triads》片段（3:16–4:52），CC BY 2.5，https://archive.org/details/MarioAjeroMinorTriadsandLastChristmas ；中文字幕为本项目所加
- `media/demo-*.mp4`：本项目自己录制的演示视频（转位、稳走紧、C 琶音指法、4536 进行），用 `tools/record-demos.js` 生成
- `media/bach-prelude-*.mp3`：Sam Tennison 演奏，公有领域，https://archive.org/details/BachWellTemperedKlavierBookI-PreludeInCMajor
- 曲目和弦为学习用简化分析，请对照乐谱核对

# jamulus（jamony 项目私有镜像）

本仓库是 [jamulussoftware/jamulus](https://github.com/jamulussoftware/jamulus) 的**私有镜像**，
托管在 jamonyapp 组织下，用作 jamony 项目二次开发的稳定基线。

## 上游来源

- **官方仓库**：https://github.com/jamulussoftware/jamulus
- **官方网站**：https://jamulus.io/
- **许可证**：GPLv2（GNU General Public License v2.0）
- **导入时间**：2026 年 6 月 5 日
- **导入方式**：GitHub Importer 一次性快照（非持续同步）

## ⚠️ 上游仓库辨析

jamulus 由 Volker Fischer（GitHub: `corrados`）于 2005 年创立。
2020 年 3 月后，项目移交给 `jamulussoftware` 组织维护。

**当前唯一活跃官方仓库 = `jamulussoftware/jamulus`**
`corrados/jamulus` 是历史路径，已停止维护（GitHub 自动重定向到新地址）。

未来同步上游、提交 PR、查看 Issues，**一律以 jamulussoftware/jamulus 为准**。

## 为什么开私有镜像

1. **基线稳定**：二次开发需要稳定起点，不被上游强制更新打乱节奏
2. **私有探索**：商业化形态、品牌定制、未公开功能在私有仓库迭代
3. **GPLv2 合规**：GPLv2 允许私有修改（未对外分发时无公开义务）；一旦对外分发需按 GPLv2 提供完整源码

## 上游同步策略

**当前**：手动按需同步，暂未自动化。

**未来可选**：
- 本地添加 upstream remote：`git remote add upstream https://github.com/jamulussoftware/jamulus.git`
- 同步命令：`git fetch upstream && git merge upstream/main`
- 或配置 GitHub Actions 自动 weekly 同步

## 协作者须知

- 上游原始代码必须**保留 GPLv2 协议头和 NOTICE/LICENSE 文件**
- 修改文件前建议先看上游同名文件的最新状态
- 二次开发代码若未来对外分发，需评估 GPLv2 传染性影响

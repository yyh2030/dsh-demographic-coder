# @local/demographic-coder

[English](README.en.md) · 中文

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(`dsh`)写的研究插件:人口学变量录入台。把 Excel/Word 问卷、纸质表格和零散 CSV 里的基本信息,变成一份有列定义、有编码规则、可导出可回溯的数据表。

版本 1.2.1 · 需要 DSH ≥ 0.2.2-rc.1 · MIT 许可 · 依赖 [`@local/research-core`](https://github.com/yyh2030/dsh-research-core)

## 为什么需要它

人口学数据通常是最早收集、最晚整理的一批:问卷是 Excel,补充信息在 Word 表格里,少数人只有纸质记录。手工编码的问题不是慢,而是同一个"教育程度"在不同人手里可能变成三种写法,而最终分析时没人记得当时怎么归的类。

录入台把这件事拆成可核对的三步:导入时只看原始值,编码页用显式映射或词典把原始值变成码值,导出时同时给数据和编码手册。原始值始终保留,关闭编码就导出原文,所以编码规则改了也能重跑而不用重新录入。

## 能做什么

- **问卷导入**:支持 `.xlsx` / `.xlsm`、`.docx`、逗号或制表符的 `.csv` / `.txt`,以及版本 2 的完整 `.json` 快照。编号可以在任意列,既可自动识别也可明确选列。
- **分类变量识别**:内置常用人口学变量的名称匹配(性别、年龄、受教育年限、教育程度、最高学历、婚姻状况、户口性质、政治面貌、民族、出生地、是否右利手、出生日期等),识别结果只作为候选,可以逐列改类型、加选项。
- **填空录入**:Tab 逐项前进,Enter 保存并继续。数字编号自动递增并延续零宽度,字母编号不改写。
- **表格编辑**:数据表里直接改单元格,保留原文;非法数值、必填缺失与上下限在保存前提示,草稿可供修正。
- **编码规则**:优先显式映射,其次精确词典匹配;模糊内容只提示候选,不自动编码。空原始值按 `coding.missing` 导出,原始数据仍为空;缺失导出值可在编码页设置。
- **导出**:CSV 数据、编码手册 CSV、可恢复的完整 JSON 快照三件一起写;快照包含列定义、词典、编码设置与原始记录,可在另一台机器上恢复后继续编辑。
- **安全保存**:每次提交携带研究身份、研究配置 revision 与磁盘 revision(原始文件字节 SHA-256),旧标签页不能覆盖较新的文件;保存用同进程队列、跨进程锁、唯一临时文件和原子 rename,上一成功版本保留为 `.previous`。
- **草稿保护**:浏览器草稿按研究 ID 隔离,恢复需要显式点击;旧 revision 的草稿只能先核对或导出再合并。
- **发布到核心**:`publishFlow` 打开后,保存会把人口学数据作为正式数据集提交到共享核心,带代次与 contentHash。

## 安装

```powershell
git clone https://github.com/yyh2030/dsh-research-core.git
git clone https://github.com/yyh2030/dsh-demographic-coder.git
dsh plugin --profile <profile> add link:<父目录>\dsh-demographic-coder
```

或者用 git 形式:

```powershell
dsh plugin --profile <profile> add git+https://github.com/yyh2030/dsh-demographic-coder.git
```

两种方式都要求 `research-core` 与本插件同级,插件用相对路径 `../research-core/host.mjs` 引用共享核心。仓库是私有的,安装前需要有访问权限。装完重启承载 `dsh web` 的进程,面板改动需要刷新页面。

## 配置

| 键 | 默认 | 说明 |
|---|---|---|
| `studyPath` | 空 | 研究定义 JSON 的绝对路径;为空时使用工作区 `_lab` |
| `labDir` | 研究的 `dataRoot` | 数据目录;主存储是 `<labDir>/demographics.json` |
| `root` | 空 | 限制导出目录,只允许写在这个根下 |
| `publishFlow` | `false` | 打开后保存将数据作为数据集提交到共享核心 |

研究定义里可用 `participants.pattern` 统一编号规则,`plugins.demographics.dataPath` 指定主文件、`plugins.demographics.labDir` 指定目录:

```json
{
  "schemaVersion": 1,
  "studyId": "sample-study",
  "name": "示例研究",
  "dataRoot": "./data",
  "participantId": { "pattern": "", "description": "任意非空字符串" },
  "visits": [],
  "tasks": [],
  "followups": [],
  "plugins": { "demographics": {} }
}
```

主存储为 `<dataRoot>/demographics.json`,顶层是 `{ schemaVersion: 2, studyId, study, updatedAt, name, columns, rows, dataset }`。顶层 `rows` 保留 `{id, ...原始值}` 的扁平结构供其他插件兼容读取,`dataset` 保存完整的恢复结构。同一 dataRoot 属于其他 studyId 时拒绝载入。

## 接口

同源 `/api/demographic-coder`,请求头 `x-demographic-coder: 1`,查询只允许 `status` 与 `load`,写操作只允许 POST:

| action | 作用 |
|---|---|
| `status` | 默认导出目录、`study:{id,name,path,dataRoot,revision}`、统一研究切换状态 |
| `load` | 读出当前数据集;空研究返回 `dataset: null`、`revision: 'empty'`,查询不写盘 |
| `sync` | 保存数据集,冲突返回 409 |
| `studyConnect` | 统一准备、提交研究切换,准备失败保持原研究 |
| `createStudy` | 独占创建新研究 JSON,已有文件不覆盖 |
| `save` | 写导出三件:CSV、编码手册、JSON 快照 |
| `reveal` | 在文件管理器中定位导出目录 |

这个插件目前只提供界面,没有注册 Agent 工具:人口学录入的判断(哪一列是编号、某个"本科"要不要并到"大学")依赖逐列核对,不适合交给一次性的工具调用。

## 数据与隐私

- 不联网。导入解析、编码与导出都在本机完成。
- 不存姓名:编号是任意非空字符串,前导零保留;导出文件名与研究 ID 绑定,不写个人姓名。
- 原始值始终保留在数据里,编码只是附加的码值映射;导出编码手册会列出可用映射,便于复核。
- 完整 JSON 快照包含原始记录,分发或备份时按研究数据的敏感级别处理。
- 浏览器草稿存在本机 localStorage,按研究 ID 隔离;存储不可用时显示错误并保留内存编辑,可下载完整 JSON。

## 已知限制

- 数值日期等复杂 Office 显示格式尚不完整支持,导入后需要核对预览;Excel 已丢失的显示格式无法恢复。
- 追加时对重复编号严格:内容相同或不同都会阻止整批追加,同标签变量的类型、词典、编码开关、缺失规则或映射差异也会阻止,需要先统一再试。
- 模糊匹配只提示候选,不自动编码;想批量归并要先写显式映射。
- 旧版全局 localStorage 草稿不会自动迁入新研究;旧扁平磁盘镜像只能只读兼容载入,缺失的历史编码设置无法推断。
- 异常退出遗留的 `.lock` 需要确认其他 Host 不再写入后手工处理。
- 仓库内没有测试目录,也没有 `test` 脚本;本插件的路由测试在 `research-core/tests/demographic-routes.test.mjs`。

## 许可

MIT，见仓库根目录 `LICENSE`（Copyright © 2026 Yuhui YANG）。许可只覆盖插件代码，不覆盖研究数据：被试信息、问卷作答、研究定义与由它们派生的数据仍归研究方所有，不随本许可授权。

# 人口学变量录入

本地数据工作台：导入 Excel / Word / CSV 或完整 JSON 快照，表单连续录入、表格编辑、变量编码，导出 CSV、编码手册和可恢复快照。Host 主存储保留原始值，浏览器保存研究隔离的草稿。默认研究为空白，模板需主动选择。

## 研究配置

插件配置 `studyPath` 指向研究 JSON 绝对路径。也可在导入页加载现有研究或创建研究配置；加载入口会协调当前 Host 进程中注册的研究插件统一切换，忙碌或配置无效时拒绝切换。状态行显示研究名称与 ID。刷新后使用安装配置；界面选择不修改安装配置。

```json
{
  "schemaVersion": 1,
  "studyId": "fiction-palette",
  "name": "虚构色板研究",
  "dataRoot": "./data",
  "participantId": {"pattern": "", "description": "任意非空字符串"},
  "visits": [],
  "tasks": [],
  "followups": [],
  "plugins": {"demographics": {}}
}
```

相对路径以研究 JSON 所在目录为基准。可选 `plugins.demographics.dataPath` 指定主文件、`labDir` 指定目录。未配置 studyPath 时，通用研究使用显式 `labDir/stateDir` 或工作区 `_lab`；不自动发现其他研究配置。`root` 限制导出目录。编号规则统一来自研究配置，组别应单独建列。

## 安全保存与恢复

面板先从 Host 加载再开放编辑；初次空浏览器不创建/覆盖磁盘文件。修改后自动保存，常驻状态显示成功、失败或版本冲突。每次提交携带研究身份、研究配置 revision、磁盘 revision，旧标签页不能覆盖较新文件，A→B→A 后旧 A 页也因切换代次过期而拒写。前端每 5 秒及窗口恢复焦点时检测研究切换并停止旧页自动保存。磁盘 revision 为原始文件字节 SHA-256。保存使用同进程队列、跨进程锁、唯一临时文件和原子 rename；上一成功版本保留为 `.previous`。异常退出遗留 `.lock` 需先核对其他 Host 不再写入后人工处理。

浏览器草稿按研究 ID 隔离，旧全局 localStorage 不会自动迁入。恢复草稿需要点击；旧 revision 草稿只能核对/导出后再合并。存储不可用时显示错误并保留内存编辑，可下载完整 JSON。重新加载或切换研究前会提示保存当前编辑。

完整 JSON 为 `{schemaVersion:2,exportedAt,study,dataset}`，其中 dataset 完整保留列定义、词典、coding.enabled/map/missing、source 和 `{id,values}` 原始记录。导入预览显示来源研究，需再次点击显式确认恢复到当前研究。快照不会自动切换目标或后台同步。旧扁平磁盘镜像可由 Host 只读兼容载入；缺失的历史编码设置无法推断。

## 导入、编码与录入

支持 `.xlsx/.xlsm`、`.docx`、逗号/制表符 `.csv/.txt`，以及版本 2 完整 `.json` 快照。编号可在任意列，既可自动识别，也可明确选列。字符串前导零保留；Excel 纯零显示格式（如 `00000`）保留宽度，其他数字格式可在预览手动指定补零宽度。数值日期等复杂 Office 显示格式尚不完整支持，请核对预览。

追加保留原始字符串 ID。重复编号明确区分内容相同/不同并阻止整批追加；同标签变量的类型、词典、编码开关、缺失规则或映射差异也会阻止追加。先核对来源、移除重复记录或统一编码，再重试。

Tab 逐项填写，Enter 保存并继续。数字编号自动递增并延续零宽度，字母编号不改写。数据表编辑保留原文；非法数值、必填缺失与上下限显示问题并阻止 Host 保存，草稿可供修正。JSON 可定义列的 required/min/max。

编码优先显式映射，再精确词典匹配；模糊内容仅提示候选，不自动编码。分类可使用任意自定义映射。空原始值按 coding.missing 导出，原始数据仍为空；缺失导出值可在编码页设置。关闭编码导出原文。导出编码手册列出可用映射。

## 本机接口

请求须同源并带 `x-demographic-coder: 1`。查询只允许 status/load；写操作只允许 POST。

- `status` → 默认导出目录、`study:{id,name,path,dataRoot,revision}`、统一切换 selection 状态。
- `load` → `{study,studyId,studyRevision,revision,dataset,path}`。空研究 `dataset:null,revision:'empty'`，无查询写入。
- `sync` payload `{studyId,studyRevision,selectionRevision,revision,dataset}` → 保存；冲突 409。旧 studyPath 请求拒绝。
- `studyConnect` payload `{studyPath}` → 统一准备、提交研究切换；准备忙碌/失败保持原研究，提交失败回滚。
- `createStudy` payload `{studyPath,definition}` → 独占创建新 JSON，已有文件不覆盖；随后显式连接。
- `save` payload `{name,dir,csv,codebook,json}` → 写导出三文件。
- `reveal` payload `{dir,file}` → 在资源管理器定位。

主存储为 `<dataRoot>/demographics.json`：顶层 `{schemaVersion:2,studyId,study,updatedAt,name,columns,rows,dataset}`。顶层 rows 保留 `{id,...rawValues}` 扁平协议供其他插件兼容读取，dataset 保存完整恢复结构。同一 dataRoot 属于其他 studyId 时拒绝载入。

## 合成回归

```powershell
node tests/functions.test.mjs
node tests/host.test.mjs
node tests/lifecycle.test.mjs
node tests/studies.test.mjs
```

新增测试只用独立虚构变量/编号和临时文件，不读取真实研究数据。浏览器生命周期测试使用可执行 hooks harness；真实浏览器视觉与键盘交互仍需在开发构建验收。

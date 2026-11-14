# @local/demographic-coder

[中文](README.md) · English

A research plugin written for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`): the demographics entry desk. It turns the basic information in Excel/Word questionnaires, paper forms and scattered CSVs into one data table with column definitions, coding rules, and the ability to export and retrace.

Version 1.2.1 · Requires DSH ≥ 0.2.2-rc.1 · MIT license · Depends on [`@local/research-core`](https://github.com/yyh2030/dsh-research-core)

## Why it exists

Demographic data is usually the first collected and the last organized: the questionnaire is Excel, supplementary information is in a Word table, and a few people exist only on paper. The problem with manual coding is not slowness but that the same "education level" can end up written three different ways depending on who did it, and at analysis time nobody remembers how it was classified back then.

The entry desk splits this into three checkable steps: import shows the raw values only, the coding page turns raw values into codes through an explicit mapping or a dictionary, and export gives you the data and the coding manual together. Raw values are always preserved: turn coding off and the original text is exported, so a changed coding rule can be re-run without re-entering anything.

## What it does

- **Questionnaire import**: supports `.xlsx` / `.xlsm`, `.docx`, comma- or tab-separated `.csv` / `.txt`, and full version 2 `.json` snapshots. The identifier can be in any column and can be auto-detected or explicitly chosen.
- **Categorical variable detection**: built-in name matching for common demographic variables (sex, age, years of education, education level, highest degree, marital status, household registration type, political affiliation, ethnicity, birthplace, right-handedness, date of birth, and so on); the results are candidates only, and you can change the type or add options per column.
- **Fill-in entry**: Tab advances item by item, Enter saves and continues. Numeric identifiers auto-increment and continue the zero padding; alphabetic identifiers are not rewritten.
- **Table editing**: edit cells directly in the data table while preserving the original text; invalid numbers, missing required values and out-of-range values are flagged before saving, and the draft can be corrected.
- **Coding rules**: explicit mappings take priority, then exact dictionary matches; fuzzy content only produces candidates and is never coded automatically. An empty raw value is exported according to `coding.missing` while the raw data stays empty; the missing export value is configurable on the coding page.
- **Export**: CSV data, coding manual CSV and a restorable full JSON snapshot are written together; the snapshot contains column definitions, the dictionary, coding settings and original records, and can be restored on another machine to continue editing.
- **Safe saving**: every submission carries the study identity, the study configuration revision and the on-disk revision (SHA-256 of the original file bytes), so an old tab cannot overwrite a newer file; saving uses an in-process queue, a cross-process lock, a unique temporary file and an atomic rename, and keeps the last successful version as `.previous`.
- **Draft protection**: browser drafts are isolated by study ID and restoring one requires an explicit click; a draft from an old revision can only be merged after checking or exporting it.
- **Publishing to the core**: with `publishFlow` enabled, saving commits the demographics data to the shared core as a formal dataset with a generation and contentHash.

## Installation

```powershell
git clone https://github.com/yyh2030/dsh-research-core.git
git clone https://github.com/yyh2030/dsh-demographic-coder.git
dsh plugin --profile <profile> add link:<parent directory>\dsh-demographic-coder
```

Or use the git form:

```powershell
dsh plugin --profile <profile> add git+https://github.com/yyh2030/dsh-demographic-coder.git
```

Both ways require `research-core` to be a sibling of this plugin; the plugin references the shared core through the relative path `../research-core/host.mjs`. The repositories are private and require access before installation. After installing, restart the process hosting `dsh web`; panel changes require a page refresh.

## Configuration

| Key | Default | Description |
|---|---|---|
| `studyPath` | empty | Absolute path to the study definition JSON; when empty, the workspace `_lab` is used |
| `labDir` | the study's `dataRoot` | Data directory; the primary store is `<labDir>/demographics.json` |
| `root` | empty | Restricts the export directory; writes are only allowed under this root |
| `publishFlow` | `false` | When enabled, saving commits the data to the shared core as a dataset |

In the study definition, `participants.pattern` can unify the identifier rule, `plugins.demographics.dataPath` names the primary file and `plugins.demographics.labDir` names the directory:

```json
{
  "schemaVersion": 1,
  "studyId": "sample-study",
  "name": "Sample study",
  "dataRoot": "./data",
  "participantId": { "pattern": "", "description": "any non-empty string" },
  "visits": [],
  "tasks": [],
  "followups": [],
  "plugins": { "demographics": {} }
}
```

The primary store is `<dataRoot>/demographics.json`, with top-level `{ schemaVersion: 2, studyId, study, updatedAt, name, columns, rows, dataset }`. The top-level `rows` keeps a flat `{id, ...raw values}` structure for other plugins to read compatibly, while `dataset` holds the full recovery structure. Loading is refused when the same dataRoot belongs to another studyId.

## API

Same-origin `/api/demographic-coder` with the request header `x-demographic-coder: 1`; queries allow only `status` and `load`, and write operations are POST only:

| action | Effect |
|---|---|
| `status` | Default export directory, `study:{id,name,path,dataRoot,revision}`, unified study switch state |
| `load` | Read the current dataset; an empty study returns `dataset: null`, `revision: 'empty'`, and the query does not write to disk |
| `sync` | Save the dataset; a conflict returns 409 |
| `studyConnect` | Unified preparation and commit of a study switch; if preparation fails the original study is kept |
| `createStudy` | Create a new study JSON exclusively; an existing file is not overwritten |
| `save` | Write the three export files: CSV, coding manual, JSON snapshot |
| `reveal` | Locate the export directory in the file manager |

This plugin currently provides a UI only and registers no Agent tools: demographics entry decisions (which column is the identifier, whether a particular "bachelor's" should be merged into "university") depend on column-by-column checking and are not a good fit for a one-shot tool call.

## Data and privacy

- No network access. Import parsing, coding and export are all done locally.
- No names are stored: an identifier is any non-empty string, with leading zeros preserved; export file names are tied to the study ID and never include a personal name.
- Raw values always remain in the data, and coding only adds a code value mapping; the exported coding manual lists the available mappings for review.
- The full JSON snapshot contains original records; handle it at the sensitivity level appropriate to research data when sharing or backing it up.
- Browser drafts are stored in local localStorage, isolated by study ID; when storage is unavailable an error is shown and in-memory edits are kept, with the option to download the full JSON.

## Known limitations

- Complex Office display formats such as numeric dates are not fully supported yet and must be checked in the preview after import; display formatting that Excel has already lost cannot be recovered.
- Appending is strict about duplicate identifiers: identical or different content both block the whole append batch, and differences in the type, dictionary, coding switch, missing rule or mapping of a same-label variable block it too, so you have to unify them before retrying.
- Fuzzy matching only produces candidates and never codes automatically; batch merging requires writing an explicit mapping first.
- Legacy global localStorage drafts are not migrated into a new study automatically; old flat on-disk mirrors can only be loaded in read-only compatibility mode, and missing historical coding settings cannot be inferred.
- A `.lock` left behind by an abnormal exit must be handled manually after confirming that no other Host is writing.
- There is no test directory and no `test` script in the repository; this plugin's route tests live in `research-core/tests/demographic-routes.test.mjs`.

## License

MIT, see `LICENSE` in the repository root (Copyright © 2026 Yuhui YANG). The license covers plugin code only, not research data: participant information, questionnaire responses, study definitions and data derived from them remain the property of the research party and are not licensed under it.

"""Build the fixture questionnaires used by tests/parse.test.mjs."""
from __future__ import annotations

import pathlib

from docx import Document
from openpyxl import Workbook

HERE = pathlib.Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures"
FIXTURES.mkdir(parents=True, exist_ok=True)


def excel() -> None:
    book = Workbook()

    codebook = book.active
    codebook.title = "编码表"
    codebook.append(["变量", "编码", "标签"])
    for row in [
        ("学历", "1", "小学及以下"),
        ("学历", "2", "初中"),
        ("学历", "3", "高中/中专"),
        ("学历", "4", "大专"),
        ("学历", "5", "本科"),
        ("学历", "6", "硕士"),
        ("学历", "7", "博士"),
        ("政治面貌", "1", "群众"),
        ("政治面貌", "2", "共青团员"),
        ("政治面貌", "3", "中共党员"),
        ("政治面貌", "4", "民主党派"),
        ("政治面貌", "5", "其他"),
    ]:
        codebook.append(list(row))

    sheet = book.create_sheet("问卷")
    sheet.append(["编号", "姓名", "性别", "年龄", "学历", "婚姻状况", "户口性质", "政治面貌", "民族", "是否独生"])
    sheet.append([1, "张三", "男", 23, "本科", "未婚", "城镇", "共青团员", "汉族", "是"])
    sheet.append([2, "李四", "女", 27, "硕士", "已婚", "农村", "中共党员", "少数民族", "否"])
    sheet.append([3, "王五", "男", 35, "博士", "离异", "城镇", "群众", "汉族", "是"])
    sheet.append([4, "赵六", "女", 19, "大专", "未婚", "农村", "群众", "汉族", "否"])
    sheet.append([5, "钱七", "男", 22, "高中/中专", "未婚", "城镇", "民主党派", "汉族", "是"])

    book.save(FIXTURES / "questionnaire.xlsx")


def word_table() -> None:
    document = Document()
    document.add_paragraph("被试基本情况登记表")
    table = document.add_table(rows=4, cols=4)
    table.style = "Table Grid"
    for index, value in enumerate(["姓名", "性别", "年龄", "学历"]):
        table.rows[0].cells[index].text = value
    rows = [
        ["张三", "男", "23", "本科"],
        ["李四", "女", "27", "硕士"],
        ["王五", "男", "35", "博士"],
    ]
    for row_index, row in enumerate(rows, start=1):
        for column_index, value in enumerate(row):
            table.rows[row_index].cells[column_index].text = value
    document.save(FIXTURES / "questionnaire-table.docx")


def word_paragraphs() -> None:
    document = Document()
    document.add_paragraph("纸质问卷转录")
    for line in ["姓名：钱七", "性别：男", "年龄：24", "学历：硕士", "政治面貌：中共党员", "户口性质：农村"]:
        document.add_paragraph(line)
    document.save(FIXTURES / "questionnaire-paragraphs.docx")


if __name__ == "__main__":
    excel()
    word_table()
    word_paragraphs()
    for path in sorted(FIXTURES.iterdir()):
        print(path.name, path.stat().st_size)

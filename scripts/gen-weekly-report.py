# -*- coding: utf-8 -*-
"""
Sinh bao cao tien do hang tuan (PDF) tu mot file mo ta JSON.

Hai bao cao dau tien duoc tao bang ReportLab nhung khong kem file nguon, nen
moi tuan sau lai phai dung lai bo cuc tu dau. Script nay giu bo cuc o mot cho
va tach noi dung tung tuan ra JSON, de tuan sau chi can them mot file du lieu.

Cach dung:
    python scripts/gen-weekly-report.py docs/weekly-reports/week-03.json
"""

import json
import os
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, PageTemplate,
                                Paragraph, Spacer, Table, TableStyle)

# Mau lay theo hai bao cao da nop, de cac tuan trong dong bo voi nhau.
NAVY = colors.HexColor('#1F3864')
HEADING = colors.HexColor('#1F5C99')
GREEN = colors.HexColor('#1E7A3C')
GREY_RULE = colors.HexColor('#BFBFBF')
GREY_TEXT = colors.HexColor('#666666')
ROW_ALT = colors.HexColor('#F2F2F2')

FONT = 'Arial'
FONT_B = 'Arial-Bold'


def dang_ky_font():
    """Dung Arial nhu hai bao cao truoc; khong co thi lui ve Helvetica."""
    win = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
    thuong = os.path.join(win, 'arial.ttf')
    dam = os.path.join(win, 'arialbd.ttf')
    if os.path.exists(thuong) and os.path.exists(dam):
        pdfmetrics.registerFont(TTFont(FONT, thuong))
        pdfmetrics.registerFont(TTFont(FONT_B, dam))
        return FONT, FONT_B
    return 'Helvetica', 'Helvetica-Bold'


def tao_styles(f, fb):
    return {
        'title': ParagraphStyle('title', fontName=fb, fontSize=17, leading=22,
                                textColor=NAVY, spaceAfter=2),
        'sub': ParagraphStyle('sub', fontName=f, fontSize=9.5, leading=13,
                              textColor=GREY_TEXT, spaceAfter=14),
        'h2': ParagraphStyle('h2', fontName=fb, fontSize=12, leading=16,
                             textColor=HEADING, spaceBefore=14, spaceAfter=7),
        'body': ParagraphStyle('body', fontName=f, fontSize=9, leading=13,
                               alignment=TA_LEFT, spaceAfter=4),
        'bullet': ParagraphStyle('bullet', fontName=f, fontSize=9, leading=13,
                                 leftIndent=10, bulletIndent=2, spaceAfter=4),
        'cell': ParagraphStyle('cell', fontName=f, fontSize=8.5, leading=12),
        'cell_h': ParagraphStyle('cell_h', fontName=fb, fontSize=8.5, leading=12,
                                 textColor=colors.white),
        'cell_ok': ParagraphStyle('cell_ok', fontName=f, fontSize=8.5, leading=12,
                                  textColor=GREEN),
        'label': ParagraphStyle('label', fontName=fb, fontSize=8.5, leading=12,
                                textColor=colors.white),
    }


def khung_trang(f, fb):
    """Header va footer lap lai o moi trang."""
    def ve(canvas, doc):
        canvas.saveState()
        w, h = A4
        canvas.setFont(fb, 7.5)
        canvas.setFillColor(GREY_TEXT)
        canvas.drawString(20 * mm, h - 15 * mm, 'BÁO CÁO TIẾN ĐỘ HÀNG TUẦN')
        canvas.setStrokeColor(GREY_RULE)
        canvas.setLineWidth(0.6)
        canvas.line(20 * mm, h - 17 * mm, w - 20 * mm, h - 17 * mm)
        canvas.line(20 * mm, 15 * mm, w - 20 * mm, 15 * mm)
        canvas.setFont(f, 7.5)
        canvas.drawString(20 * mm, 11 * mm, 'Trang')
        canvas.drawRightString(w - 20 * mm, 11 * mm, str(doc.page))
        canvas.restoreState()
    return ve


def bang_thong_tin(d, st, rong):
    hang = [
        ('Đề tài', d['deTai']),
        ('Sinh viên thực hiện', '<br/>'.join(d['sinhVien'])),
        ('Giảng viên hướng dẫn', d['giangVien']),
        ('Tuần báo cáo', 'Tuần %s (%s - %s)' % (d['tuan'], d['tuNgay'], d['denNgay'])),
        ('Tỷ lệ hoàn thành tuần', d['tyLeHoanThanh']),
    ]
    data = [[Paragraph(k, st['label']), Paragraph(v, st['cell'])] for k, v in hang]
    t = Table(data, colWidths=[rong * 0.28, rong * 0.72])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), NAVY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, GREY_RULE),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return t


def bang_chung(tieu_de, hang, st, rong, ty_le, cot_xanh=None):
    """Bang co hang tieu de nen navy; cot_xanh la chi so cot to mau xanh la."""
    data = [[Paragraph(h, st['cell_h']) for h in tieu_de]]
    for r in hang:
        o = []
        for i, c in enumerate(r):
            o.append(Paragraph(c, st['cell_ok'] if i == cot_xanh else st['cell']))
        data.append(o)

    t = Table(data, colWidths=[rong * x for x in ty_le], repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, GREY_RULE),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(('BACKGROUND', (0, i), (-1, i), ROW_ALT))
    t.setStyle(TableStyle(style))
    return t


def dung_pdf(d, duong_dan):
    f, fb = dang_ky_font()
    st = tao_styles(f, fb)
    rong = A4[0] - 40 * mm

    doc = BaseDocTemplate(duong_dan, pagesize=A4,
                          leftMargin=20 * mm, rightMargin=20 * mm,
                          topMargin=24 * mm, bottomMargin=20 * mm,
                          title='Bao cao tien do tuan %s' % d['tuan'],
                          author=', '.join(d['sinhVien']))
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='n')
    doc.addPageTemplates([PageTemplate(id='main', frames=[frame],
                                       onPage=khung_trang(f, fb))])

    e = [
        Paragraph(d['deTai'], st['title']),
        Paragraph('Báo cáo tiến độ tuần %s - %s đến %s'
                  % (d['tuan'], d['tuNgay'], d['denNgay']), st['sub']),
        bang_thong_tin(d, st, rong),
        Spacer(1, 6 * mm),
        Paragraph('1. Đối chiếu kế hoạch và kết quả', st['h2']),
        Paragraph(d['moDau'], st['body']),
        Spacer(1, 2 * mm),
        bang_chung(['Kế hoạch', 'Kết quả', 'Trạng thái'], d['doiChieu'], st, rong,
                   [0.26, 0.56, 0.18], cot_xanh=2),
        Paragraph('2. Kết quả kỹ thuật chính', st['h2']),
    ]
    for b in d['ketQuaKyThuat']:
        e.append(Paragraph(b, st['bullet'], bulletText='\u2022'))

    # Bọc tiêu đề cùng bảng của nó: nếu không, ReportLab có thể ngắt trang ngay
    # sau tiêu đề và để lại một dòng tiêu đề mồ côi ở cuối trang.
    e.append(KeepTogether([
        Paragraph('3. Minh chứng và kết quả kiểm tra', st['h2']),
        bang_chung(['Minh chứng', 'Nội dung'], d['minhChung'], st, rong,
                   [0.34, 0.66]),
    ]))
    e.append(Spacer(1, 4 * mm))
    e.append(bang_chung(['Lệnh kiểm tra', 'Kết quả'], d['lenhKiemTra'], st, rong,
                        [0.46, 0.54]))
    e.append(Paragraph('4. Giới hạn và rủi ro hiện tại', st['h2']))
    for b in d['gioiHan']:
        e.append(Paragraph(b, st['bullet'], bulletText='\u2022'))

    e.append(KeepTogether([
        Paragraph('5. Cam kết cho tuần tiếp theo', st['h2']),
        bang_chung(['', 'Nội dung'],
                   [[str(i + 1), c] for i, c in enumerate(d['camKet'])],
                   st, rong, [0.07, 0.93]),
    ]))

    doc.build(e)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Cach dung: python scripts/gen-weekly-report.py <file.json>')
        sys.exit(1)
    nguon = sys.argv[1]
    with open(nguon, encoding='utf-8') as fh:
        du_lieu = json.load(fh)
    ra = os.path.join(os.path.dirname(nguon),
                      'DACNTT-Bao-cao-tien-do-Tuan-%02d.pdf' % int(du_lieu['tuan']))
    dung_pdf(du_lieu, ra)
    print('Da tao: %s' % ra)

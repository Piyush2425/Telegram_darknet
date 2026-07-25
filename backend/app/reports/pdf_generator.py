import os
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    """Canvas to add custom headers and footers with accurate total page count."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        
        # 1. Header Banner
        self.setFillColor(colors.HexColor("#0f172a"))  # Dark Navy Slate 900
        self.rect(0, 752, 612, 40, stroke=0, fill=1)
        
        self.setFillColor(colors.white)
        self.setFont("Helvetica-Bold", 11)
        self.drawCentredString(306, 774, "CYBER THREAT INTELLIGENCE COMMAND CENTER")
        
        self.setFont("Helvetica-Oblique", 7.5)
        self.drawCentredString(306, 762, "Automated Telegram Darknet Monitoring Analysis Report")
        
        # 2. Footer
        self.setStrokeColor(colors.HexColor("#cbd5e1"))  # Slate 200 line
        self.setLineWidth(0.5)
        self.line(36, 45, 576, 45)
        
        self.setFillColor(colors.HexColor("#64748b"))  # Slate 500
        self.setFont("Helvetica-Oblique", 7.5)
        self.drawString(36, 32, "Confidential Security Assessment Report")
        self.drawRightString(576, 32, f"Page {self._pageNumber} of {page_count}")
        
        self.restoreState()

def create_detailed_pdf_report(
    channel_title: str, 
    start_date: str, 
    end_date: str, 
    messages: List[Dict[str, Any]], 
    report_text: str,
    output_path: Path
):
    """Compile a highly professional detailed PDF report using ReportLab platypus flowables."""
    # A4/Letter margins: 0.5 inch (36pt) left/right, top margin 60pt (under banner), bottom 60pt (above footer)
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=64,
        bottomMargin=64
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#1e293b"),  # Slate 800
        spaceAfter=6
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#475569"),  # Slate 600
        spaceAfter=4
    )
    
    h1_style = ParagraphStyle(
        'ReportH1',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )
    
    h2_style = ParagraphStyle(
        'ReportH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#1d4ed8"),  # Blue 700
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'ReportBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13.5,
        textColor=colors.HexColor("#334155"),  # Slate 700
        spaceAfter=5
    )
    
    bullet_style = ParagraphStyle(
        'ReportBullet',
        parent=body_style,
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=4
    )
    
    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#0f172a")
    )
    
    table_header_style = ParagraphStyle(
        'TableHeaderCell',
        parent=table_cell_style,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor("#334155")
    )

    story = []
    
    # 1. Main Document Header Block
    story.append(Paragraph("AI Cyber Threat Intelligence Detailed Report", title_style))
    story.append(Paragraph(f"Target Channel: {channel_title}", subtitle_style))
    story.append(Paragraph(f"Date Range Evaluated: {start_date} to {end_date}", subtitle_style))
    story.append(Paragraph(f"Total Messages Checked: {len(messages)} logs", subtitle_style))
    story.append(Spacer(1, 10))
    
    # 2. Parse Markdown elements and compile tables statefully
    lines = report_text.split("\n")
    current_table_rows = []
    
    def flush_table_to_story(rows):
        if not rows:
            return
        headers = rows[0]
        data_rows = rows[1:]
        
        col_cnt = len(headers)
        
        # Wrap cells in Paragraph so they autowrap!
        wrapped_data = []
        # Headers row
        header_cells = [Paragraph(f"<b>{str(h).strip()}</b>", table_header_style) for h in headers]
        wrapped_data.append(header_cells)
        
        for r in data_rows:
            # Safe cells count normalization to match headers column count
            cells = [str(c).strip() for c in r]
            if len(cells) > col_cnt:
                # Merge extra split columns back into the last cell (the message body)
                main_cells = cells[:col_cnt - 1]
                extra_text = " | ".join(cells[col_cnt - 1:])
                cells = main_cells + [extra_text]
            elif len(cells) < col_cnt:
                # Pad shorter rows
                while len(cells) < col_cnt:
                    cells.append("")
                    
            data_cells = [Paragraph(c, table_cell_style) for c in cells]
            wrapped_data.append(data_cells)
            
        # Compute column widths based on table structure
        col_cnt = len(headers)
        if col_cnt == 5:  # Severity | Alert Title | Description | Count | Last Seen
            widths = [55, 115, 210, 50, 110]
        elif col_cnt == 4:  # URL Link | Domain Purpose | Mention Count | Last Seen
            widths = [190, 190, 60, 100]
        elif col_cnt == 3:  # Time | Sender | Chat Message Log
            widths = [75, 115, 350]
        else:
            widths = [540 / col_cnt] * col_cnt
            
        t = Table(wrapped_data, colWidths=widths, repeatRows=1)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f1f5f9")),
            ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor("#334155")),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ]))
        story.append(t)
        story.append(Spacer(1, 10))

    idx = 0
    while idx < len(lines):
        line = lines[idx].strip()
        
        # Check for table row
        if line.startswith("|"):
            import re
            cells = [c.strip().replace(r"\|", "|") for c in re.split(r"(?<!\\)\|", line)]
            if line.startswith("|"):
                cells = cells[1:]
            if line.endswith("|"):
                cells = cells[:-1]
                
            # If it's a separator row (like | :--- | :--- |), skip it
            if all(c.startswith(":") or c.startswith("-") for c in cells):
                idx += 1
                continue
            current_table_rows.append(cells)
            idx += 1
            continue
        else:
            # Not a table row. If we have accumulated table rows, flush them first
            if current_table_rows:
                flush_table_to_story(current_table_rows)
                current_table_rows = []
                
        if not line:
            story.append(Spacer(1, 4))
            idx += 1
            continue
            
        # Parse Headings
        if line.startswith("# "):
            text = line.replace("# ", "").strip()
            story.append(Paragraph(text, title_style))
            story.append(Spacer(1, 6))
        elif line.startswith("## "):
            text = line.replace("## ", "").strip()
            story.append(Paragraph(text, h1_style))
            story.append(Spacer(1, 4))
        elif line.startswith("### "):
            text = line.replace("### ", "").strip()
            story.append(Paragraph(text, h2_style))
            story.append(Spacer(1, 4))
        elif line.startswith("* ") or line.startswith("- "):
            text = line[2:].strip()
            story.append(Paragraph(f"&bull; {text}", bullet_style))
        elif line.startswith("> "):
            text = line.replace("> ", "").strip()
            bq_style = ParagraphStyle(
                'Blockquote',
                parent=body_style,
                leftIndent=15,
                fontName='Helvetica-Oblique',
                textColor=colors.HexColor("#475569")
            )
            story.append(Paragraph(text, bq_style))
        else:
            story.append(Paragraph(line, body_style))
        idx += 1
        
    # Flush any remaining table
    if current_table_rows:
        flush_table_to_story(current_table_rows)
        
    # Build PDF using NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)

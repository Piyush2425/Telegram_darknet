from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response
from pathlib import Path
from ..db.mongodb import store
from ..config import settings

router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("")
async def list_reports():
    """List all generated CTI reports."""
    reps = list(store.reports.values())
    reps.sort(key=lambda x: x["created_at"], reverse=True)
    return reps

@router.get("/{report_id}/markdown")
async def download_markdown_report(report_id: str):
    """Download Markdown report file."""
    if report_id not in store.reports:
        raise HTTPException(status_code=404, detail="Report not found")
    
    rel_path = store.reports[report_id]["markdown_path"]
    full_path = settings.BASE_DIR / rel_path
    
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Markdown file not found on disk")
        
    return FileResponse(path=full_path, filename=full_path.name, media_type="text/markdown")

@router.get("/{report_id}/pdf")
async def download_pdf_report(report_id: str):
    """Download PDF report file."""
    if report_id not in store.reports:
        raise HTTPException(status_code=404, detail="Report not found")
    
    rel_path = store.reports[report_id]["pdf_path"]
    full_path = settings.BASE_DIR / rel_path
    
    if not full_path.exists():
        # Check text fallback file
        txt_fallback = Path(str(full_path) + ".txt")
        if txt_fallback.exists():
            return FileResponse(path=txt_fallback, filename=txt_fallback.name, media_type="text/plain")
        raise HTTPException(status_code=404, detail="PDF file not found on disk")
        
    return FileResponse(path=full_path, filename=full_path.name, media_type="application/pdf")

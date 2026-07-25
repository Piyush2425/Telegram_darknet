from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..scrapers.telegram_scraper import telegram_scraper
from ..config import settings

router = APIRouter(prefix="/telegram/auth", tags=["Telegram Auth"])

class SendCodeRequest(BaseModel):
    phone_number: str
    api_id: Optional[int] = 0
    api_hash: Optional[str] = ""

class VerifyCodeRequest(BaseModel):
    phone_number: str
    code: str
    phone_code_hash: Optional[str] = None
    password: Optional[str] = None

@router.get("/status")
async def get_auth_status():
    """Check if Telethon user session is active and authorized."""
    auth_info = await telegram_scraper.check_auth_status()
    return auth_info

@router.post("/send-code")
async def send_otp_code(req: SendCodeRequest):
    """Send Telegram login OTP code to user's phone number."""
    if not req.phone_number:
        raise HTTPException(status_code=400, detail="Phone number is required")

    result = await telegram_scraper.send_otp_code(
        phone_number=req.phone_number,
        api_id=req.api_id or 0,
        api_hash=req.api_hash or ""
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.post("/verify-code")
async def verify_otp_code(req: VerifyCodeRequest):
    """Verify Telegram login OTP code and authorize session."""
    result = await telegram_scraper.verify_otp_code(
        phone_number=req.phone_number,
        code=req.code,
        phone_code_hash=req.phone_code_hash,
        password=req.password
    )
    if "error" in result:
        if result["error"] == "2FA_PASSWORD_REQUIRED":
            return {"status": "2fa_required", "error": result["error"], "message": result.get("message")}
        raise HTTPException(status_code=400, detail=result["error"])
    return result

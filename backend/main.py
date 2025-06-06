from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional, List
import whisper
import tempfile
import uvicorn
import openai
import os
import ffmpeg
import base64
from sqlalchemy import create_engine, Column, String, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import uuid
import shutil

app = FastAPI()

# Allow CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Whisper model once at startup
model = whisper.load_model("base")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
openai.api_key = OPENAI_API_KEY

# DB setup
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres:postgres@db:5432/pareeksha")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class InterviewSession(Base):
    __tablename__ = "interview_sessions"
    id = Column(String, primary_key=True, index=True)
    question = Column(Text)
    transcript = Column(Text)
    video_path = Column(String)
    frame_paths = Column(Text)  # comma-separated paths
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
            tmp.write(await file.read())
            tmp.flush()
            result = model.transcribe(tmp.name)
        return {"transcript": result["text"]}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/analyze")
async def analyze(
    file: UploadFile = File(...),
    transcript: Optional[str] = Form(None),
    frame1: Optional[UploadFile] = File(None),
    frame2: Optional[UploadFile] = File(None),
    frame3: Optional[UploadFile] = File(None),
    question: Optional[str] = Form(None),
):
    # 1. Transcribe if transcript not provided
    whisper_text = transcript
    video_path = None
    if not transcript or not (frame1 or frame2 or frame3):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
            tmp.write(await file.read())
            tmp.flush()
            video_path = tmp.name
            if not transcript:
                result = model.transcribe(tmp.name)
                whisper_text = result["text"]
    # 2. Extract frames from video if not provided
    extracted_frames = []
    frame_debug = []
    extracted_frames_base64 = []
    if not (frame1 or frame2 or frame3):
        # Extract 3 frames using ffmpeg
        if video_path:
            try:
                for i in range(1, 4):
                    frame_file = tempfile.NamedTemporaryFile(delete=False, suffix=f"_frame{i}.jpg")
                    (
                        ffmpeg
                        .input(video_path, ss=f'{i*0.2+0.2}')
                        .output(frame_file.name, vframes=1)
                        .run(quiet=True, overwrite_output=True)
                    )
                    with open(frame_file.name, "rb") as f:
                        data = f.read()
                        extracted_frames.append(data)
                        extracted_frames_base64.append(base64.b64encode(data).decode('utf-8'))
                        frame_debug.append({
                            "name": frame_file.name,
                            "size": len(data),
                            "content_type": "image/jpeg"
                        })
            except Exception as e:
                frame_debug.append({"error": str(e)})
    else:
        # Use uploaded frames if present
        for idx, frame in enumerate([frame1, frame2, frame3], 1):
            if frame:
                data = await frame.read()
                extracted_frames.append(data)
                extracted_frames_base64.append(base64.b64encode(data).decode('utf-8'))
                frame_debug.append({
                    "name": frame.filename,
                    "size": len(data),
                    "content_type": frame.content_type
                })
            else:
                frame_debug.append(None)
    # 3. Call OpenAI GPT-4o (vision) for emotion/tone analysis
    prompt = (
        "You are an interview coach. Analyze the candidate's response for emotion, tone, and communication style. "
        "Give feedback on confidence, clarity, and expressiveness. Use the transcript and the video frames. "
        "Transcript: " + (whisper_text or "(none)")
    )
    messages = [
        {"role": "system", "content": "You are an expert interview coach."},
        {"role": "user", "content": ([{"type": "text", "text": prompt}] +
            ([{"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img}", "detail": "auto"}} for img in extracted_frames_base64]) if extracted_frames_base64 else [])}
    ]
    feedback = None
    try:
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=512
        )
        feedback = response.choices[0].message.content
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
    
    # Save video and frames to disk with unique session id
    session_id = str(uuid.uuid4())
    save_dir = os.path.join("sessions", session_id)
    os.makedirs(save_dir, exist_ok=True)
    # Save video
    video_save_path = os.path.join(save_dir, "video.webm")
    if video_path and os.path.exists(video_path):
        shutil.copy(video_path, video_save_path)
    else:
        with open(video_save_path, "wb") as f:
            f.write(await file.read())
    # Save frames
    frame_save_paths = []
    for idx, frame_bytes in enumerate(extracted_frames):
        frame_path = os.path.join(save_dir, f"frame{idx+1}.jpg")
        with open(frame_path, "wb") as f:
            f.write(frame_bytes)
        frame_save_paths.append(frame_path)
    # Store in DB
    db = SessionLocal()
    try:
        db_session = InterviewSession(
            id=session_id,
            question=question or "",
            transcript=whisper_text or "",
            video_path=video_save_path,
            frame_paths=",".join(frame_save_paths),
        )
        db.add(db_session)
        db.commit()
    finally:
        db.close()
    
    return {
        "id": session_id,
        "feedback": feedback,
        "transcript": whisper_text,
        "frame_analysis": frame_debug,
        "images_received": len(extracted_frames)
    }

@app.get("/api/session/{session_id}")
def get_session(session_id: str):
    db = SessionLocal()
    try:
        session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return {
            "id": session.id,
            "question": session.question,
            "transcript": session.transcript,
            "video_path": session.video_path,
            "frame_paths": session.frame_paths.split(",") if session.frame_paths else [],
            "created_at": session.created_at.isoformat() if session.created_at else None
        }
    finally:
        db.close()

@app.get("/api/sessions")
def list_sessions():
    db = SessionLocal()
    try:
        sessions = db.query(InterviewSession).order_by(InterviewSession.created_at.desc()).all()
        return [
            {
                "id": s.id,
                "question": s.question,
                "transcript": s.transcript,
                "video_path": s.video_path,
                "frame_paths": s.frame_paths.split(",") if s.frame_paths else [],
                "created_at": s.created_at.isoformat() if s.created_at else None
            }
            for s in sessions
        ]
    finally:
        db.close()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

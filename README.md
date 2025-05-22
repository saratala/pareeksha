# Pareeksha: AI Interview App

This is a minimal, modern React app for simulating technical interviews with AI feedback.

## Features
- Start an interview session
- App asks a technical question
- Record your answer with audio and video
- Send your response to an LLM (OpenAI/Gemini, vision or non-vision)
- Get instant AI feedback on your answer

## Development

### Run locally (Frontend)
```bash
cd frontend
npm install
npm start
```

### Run backend (Whisper API)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Build and run with Docker Compose
```bash
docker-compose up --build
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure
- `frontend/` — React app, Dockerfile, nginx.conf, static assets, and source code
- `backend/` — FastAPI Whisper backend
- `docker-compose.yml` — Unified dev/prod orchestration
- `.github/copilot-instructions.md` — Copilot workspace instructions

## Next Steps
- Implement the main workflow: question, recording, LLM call, feedback
- Add your OpenAI/Gemini API key as needed

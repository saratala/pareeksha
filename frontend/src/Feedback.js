import React from "react";

// Feedback component: displays backend AI feedback in a structured, user-friendly way
export default function Feedback({ question, recording, feedback, onRestart }) {
  const isBlobValid = recording && recording.videoBlob && recording.videoBlob.size > 1000;
  const transcript = (recording && (recording.whisperTranscript || recording.transcript));

  if (!feedback) {
    return <div style={{ color: '#888' }}>No feedback available yet.</div>;
  }

  // If backend sent an error
  if (feedback.error) {
    return (
      <div style={{ color: 'red', background: '#fff1f0', border: '1px solid #ffa39e', padding: 16 }}>
        <strong>Backend Error:</strong>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{feedback.error}</pre>
      </div>
    );
  }

  // Render frame analysis if present
  const renderFrameAnalysis = () => {
    if (!feedback.frame_analysis || !Array.isArray(feedback.frame_analysis) || feedback.frame_analysis.length === 0) return null;
    return (
      <div style={{ marginTop: 12 }}>
        <strong>Frame Analysis:</strong>
        <ul>
          {feedback.frame_analysis.map((frame, idx) => (
            <li key={idx}>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{typeof frame === 'object' ? JSON.stringify(frame, null, 2) : String(frame)}</pre>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  // Render main feedback/summary
  return (
    <div>
      <h2>AI Feedback</h2>
      <p><b>Question:</b> {question}</p>
      {transcript && (
        <div style={{margin: '1rem 0', padding: 12, background: '#f0f8ff'}}>
          <b>Your Answer (transcribed):</b>
          <div style={{marginTop: 6, fontSize: 16, color: '#222'}}>{transcript}</div>
        </div>
      )}
      <video
        controls
        src={isBlobValid ? URL.createObjectURL(recording.videoBlob) : undefined}
        style={{ width: "100%", maxHeight: 320, background: "#222" }}
      />
      {!isBlobValid && (
        <div style={{ color: "red" }}>
          No valid recording found. Please try again.
        </div>
      )}
      <div style={{ background: '#e6f7ff', border: '1px solid #91d5ff', padding: 16, marginTop: 16 }}>
        <h3>AI Feedback</h3>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 15 }}>{feedback.feedback}</pre>
        {renderFrameAnalysis()}
      </div>
      <button onClick={onRestart} style={{ marginTop: 16 }}>
        Restart Interview
      </button>
    </div>
  );
}

import React, { useEffect, useState } from "react";

// Replace this with your actual LLM API call
async function analyzeWithLLM({ question, videoBlob }) {
  // For demo: just return a fake response after 2s
  await new Promise((r) => setTimeout(r, 2000));
  return (
    "[AI FEEDBACK] This is a placeholder. " +
    "You answered: (video/audio submitted).\n" +
    "Question: " + question +
    "\nStrengths: ...\nAreas for improvement: ..."
  );
}

export default function Feedback({ question, recording, onFeedback, feedback, onRestart }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isBlobValid = recording && recording.videoBlob && recording.videoBlob.size > 1000;
  const transcript = (recording && (recording.whisperTranscript || recording.transcript));

  useEffect(() => {
    if (!feedback && recording) {
      setLoading(true);
      analyzeWithLLM({ question, videoBlob: recording.videoBlob })
        .then((fb) => {
          onFeedback(fb);
          setLoading(false);
        })
        .catch((e) => {
          setError("Failed to get feedback: " + e.message);
          setLoading(false);
        });
    }
    // eslint-disable-next-line
  }, [recording, feedback]);

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
      {loading && <div>Analyzing your answer...</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}
      {feedback && (
        <div style={{ margin: "1rem 0", padding: 12, background: "#f5f5f5" }}>
          <pre style={{ whiteSpace: "pre-wrap" }}>{feedback}</pre>
        </div>
      )}
      <button onClick={onRestart} style={{ marginTop: 16 }}>
        Restart Interview
      </button>
    </div>
  );
}

import React, { useState } from "react";
import Interview from "./Interview";
import Feedback from "./Feedback";

function App() {
  const [stage, setStage] = useState("start");
  const [question, setQuestion] = useState("");
  const [recording, setRecording] = useState(null); // { audioBlob, videoBlob }
  const [feedback, setFeedback] = useState("");

  // Example: static question, can be replaced with LLM call
  const askQuestion = () => {
    setQuestion(
      "Describe a challenging technical problem you solved and how you approached it."
    );
    setStage("interview");
  };

  // Called after recording is done
  const handleRecording = (rec) => {
    setRecording(rec);
    setStage("feedback");
  };

  // Called after feedback is received
  const handleFeedback = (fb) => {
    setFeedback(fb);
  };

  return (
    <div style={{ maxWidth: 600, margin: "2rem auto", padding: 24 }}>
      <h1>Pareeksha: AI Interview</h1>
      {stage === "start" && (
        <>
          <p>Click below to start your interview simulation.</p>
          <button onClick={askQuestion} style={{ fontSize: 18, padding: 12 }}>
            Start Interview
          </button>
        </>
      )}
      {stage === "interview" && (
        <Interview
          question={question}
          onComplete={handleRecording}
          onBack={() => setStage("start")}
        />
      )}
      {stage === "feedback" && (
        <Feedback
          question={question}
          recording={recording}
          onFeedback={handleFeedback}
          feedback={feedback}
          onRestart={() => {
            setStage("start");
            setFeedback("");
            setRecording(null);
          }}
        />
      )}
    </div>
  );
}

export default App;

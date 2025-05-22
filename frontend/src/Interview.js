import React, { useRef, useState, useEffect } from "react";
import AudioRecorderPolyfill from 'audio-recorder-polyfill';

// Helper to select a specific English voice (prefer 'Samantha', fallback to first English, then first available)
function getEnglishVoice() {
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  let voice = voices.find(v => v.name === 'Samantha');
  if (!voice) voice = voices.find(v => v.lang && v.lang.startsWith('en'));
  if (!voice) voice = voices[0] || null;
  return voice;
}

export default function Interview({ question, onComplete, onBack }) {
  const videoRef = useRef();
  const mediaRecorderRef = useRef();
  const [recording, setRecording] = useState(false);
  const [chunks, setChunks] = useState([]);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState("");
  const [videoReady, setVideoReady] = useState(false);
  const [waitingForSpeech, setWaitingForSpeech] = useState(false);
  const [readyToBegin, setReadyToBegin] = useState(false);
  const [hasBegun, setHasBegun] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [recognizing, setRecognizing] = useState(false);
  let recognitionRef = useRef(null);

  // Start camera/mic and wait for audio to be ready (audio only)
  useEffect(() => {
    let localStream;
    let cancelled = false;
    async function getStream() {
      setError("");
      setVideoReady(false);
      try {
        // Only request audio for debugging speech synthesis
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Comment out video element usage
        // if (videoRef.current) {
        //   videoRef.current.srcObject = localStream;
        //   videoRef.current.onloadedmetadata = () => {
        //     setVideoReady(true);
        //   };
        // }
        setVideoReady(true); // Set true immediately for audio-only
        setStream(localStream);
      } catch (e) {
        setError("Could not access microphone: " + e.message);
      }
    }
    getStream();
    return () => {
      cancelled = true;
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Wait for speech synthesis voices to be loaded (macOS/Chrome fix)
  useEffect(() => {
    let timeout;
    let tries = 0;
    function checkVoices() {
      const voices = window.speechSynthesis?.getVoices?.() || [];
      if (voices.some(v => v.lang && v.lang.startsWith('en'))) {
        // Do nothing
      } else if (tries < 20) { // try for up to 2 seconds
        tries++;
        timeout = setTimeout(checkVoices, 100);
      } else {
        setError('No English speech synthesis voices found. Please check your browser or system settings.');
      }
    }
    checkVoices();
    return () => clearTimeout(timeout);
  }, []);

  // Remove all voice debug UI and state

  // Remove Begin button and automatically ask question when ready
  useEffect(() => {
    if (videoReady && stream && question) {
      setReadyToBegin(true);
      // Automatically start the question when ready
      if (!hasBegun) {
        setHasBegun(true);
        handleBegin();
      }
    }
    // eslint-disable-next-line
  }, [videoReady, stream, question]);

  // Test speech synthesis with a sample phrase
  const testSpeech = () => {
    setError("");
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setError("Speech synthesis is not supported in this browser. Try Chrome, Edge, or Firefox.");
      return;
    }
    const synth = window.speechSynthesis;
    const speak = () => {
      const utter = new window.SpeechSynthesisUtterance("This is a test of your browser's speech synthesis.");
      const voice = getEnglishVoice();
      if (voice) utter.voice = voice;
      utter.volume = 1.0;
      utter.onerror = () => setError("Speech synthesis failed. Check your browser audio output and system volume.");
      synth.speak(utter);
    };
    if (synth.getVoices().length === 0) {
      synth.onvoiceschanged = speak;
    } else {
      speak();
    }
  };

  // Handler for Begin button
  const handleBegin = () => {
    setHasBegun(true);
    setError("");
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setError("Speech synthesis is not supported in this browser. Please use Chrome, Edge, or Firefox.");
      startRecording();
      return;
    }
    setWaitingForSpeech(true);
    const synth = window.speechSynthesis;
    // Cancel any ongoing speech to avoid overlap
    synth.cancel();
    // Wait for voices to be loaded, then delay speech slightly after video is ready
    const speak = () => {
      setTimeout(() => {
        const utter = new window.SpeechSynthesisUtterance(question);
        const voice = getEnglishVoice();
        if (voice) utter.voice = voice;
        utter.volume = 1.0;
        utter.onend = () => {
          setTimeout(() => startRecording(), 300);
        };
        utter.onerror = () => {
          setError("Could not speak the question. Please check your browser audio output and unmute your system volume.");
          setTimeout(() => startRecording(), 300);
        };
        try {
          synth.speak(utter);
        } catch (e) {
          setError("Speech synthesis was blocked. Please click 'Play Question' below.");
        }
      }, 300); // 300ms delay to ensure video/audio context is stable
    };
    if (synth.getVoices().length === 0) {
      synth.onvoiceschanged = speak;
    } else {
      speak();
    }
  };

  // Manual play fallback for speech synthesis
  const playQuestion = () => {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    setError("");
    setWaitingForSpeech(true);
    const synth = window.speechSynthesis;
    synth.cancel(); // Cancel any ongoing speech
    const speak = () => {
      setTimeout(() => {
        const utter = new window.SpeechSynthesisUtterance(question);
        const voice = getEnglishVoice();
        if (voice) utter.voice = voice;
        utter.volume = 1.0;
        utter.onend = () => setTimeout(() => startRecording(), 300);
        utter.onerror = () => {
          setError("Could not speak the question. Please check your browser audio output and unmute your system volume.");
          setTimeout(() => startRecording(), 300);
        };
        synth.speak(utter);
      }, 300);
    };
    if (synth.getVoices().length === 0) {
      synth.onvoiceschanged = speak;
    } else {
      speak();
    }
  };

  const startRecording = () => {
    if (!stream) return;
    setError("");
    setChunks([]);
    setTranscript(""); // Clear transcript before recording
    try {
      // Use polyfill for all audio-only recording on macOS (Chrome/Safari)
      let MR = window.MediaRecorder;
      const isMac = /Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent);
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
      if (!MR || isSafari || (isMac && isChrome)) {
        MR = AudioRecorderPolyfill;
        window.MediaRecorder = AudioRecorderPolyfill;
      }
      const mr = new MR(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          setChunks((c) => [...c, e.data]);
        }
      };
      mr.onstop = async () => {
        const allChunks = chunks.length ? chunks : [];
        let blob;
        if (allChunks.length > 0) {
          blob = new Blob(allChunks, { type: mr.mimeType || 'audio/webm' });
        } else {
          blob = new Blob([], { type: mr.mimeType || 'audio/webm' });
        }
        console.log('MediaRecorder stopped. Chunks:', allChunks, 'Blob size:', blob.size, 'Type:', mr.mimeType);
        if (blob.size === 0) {
          setError("Recording failed. No audio data was captured. This is a known issue with some browsers (especially Chrome/Safari on macOS) and the MediaRecorder API.\n\nDebug info: " + JSON.stringify({chunks: allChunks.length, type: mr.mimeType, transcript}));
          stream.getTracks().forEach((t) => t.stop());
          setRecording(false);
          return;
        }
        // Send audio to backend for Whisper transcription
        let whisperTranscript = null;
        try {
          const formData = new FormData();
          formData.append('file', blob, 'audio.webm');
          // Use relative path for Docker Compose (frontend:3000, backend:8000)
          const resp = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData
          });
          if (resp.ok) {
            const data = await resp.json();
            whisperTranscript = data.transcript;
          } else {
            console.error('Whisper backend error', await resp.text());
          }
        } catch (err) {
          console.error('Failed to fetch Whisper transcript', err);
        }
        onComplete({ videoBlob: blob, audioBlob: blob, transcript, whisperTranscript });
        stream.getTracks().forEach((t) => t.stop());
      };
      setChunks([]); // Clear chunks before starting
      mr.start();
      setRecording(true);
    } catch (e) {
      setError("Could not start recording: " + e.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  // Start speech recognition when recording starts
  useEffect(() => {
    if (!recording) return;
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    setTranscript("");
    setRecognizing(true);
    let runningTranscript = "";
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const isFinal = event.results[i].isFinal;
        const text = event.results[i][0].transcript;
        if (isFinal) {
          runningTranscript += text + ' ';
        } else {
          interim += text;
        }
      }
      setTranscript((runningTranscript + interim).trim());
    };
    recognition.onerror = (event) => {
      setError('Speech recognition error: ' + event.error);
      setRecognizing(false);
    };
    recognition.onend = () => {
      setRecognizing(false);
    };
    recognition.start();
    return () => {
      recognition.stop();
      setRecognizing(false);
    };
  }, [recording]);

  // Stop recognition when recording stops
  useEffect(() => {
    if (!recording && recognitionRef.current) {
      recognitionRef.current.stop();
      setRecognizing(false);
    }
  }, [recording]);

  return (
    <div>
      <button onClick={onBack}>Back</button>
      <h2>Interview Question</h2>
      <p>{question}</p>
      {/* Comment out video element in render */}
      {/*
      <div style={{ position: "relative", width: "100%", maxWidth: 480, margin: "0 auto" }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: "100%", maxHeight: 320, background: "#222" }}
        />
        {!videoReady && <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "#222", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading camera...</div>}
      </div>
      */}
      <div style={{ margin: "1rem 0" }}>
        {/* Test Speech Output button removed */}
        {/* Debug info: show voices and selected voice */}
        {/* (Removed) */}
        {/* {readyToBegin && !hasBegun && voicesReady && (
          <button onClick={handleBegin} style={{ fontSize: 18, padding: 12, background: '#007bff', color: '#fff' }}>
            Begin
          </button>
        )} */}
        {/* {!voicesReady && <div style={{color:'#c00', marginTop:8}}>Loading speech synthesis voices...</div>} */}
        {hasBegun && !recording && !waitingForSpeech && (
          <button onClick={playQuestion} style={{ fontSize: 16, padding: 10, background: '#007bff', color: '#fff', marginLeft: 8 }}>
            Play Question
          </button>
        )}
        {recording && (
          <div style={{marginBottom:12}}>
            <label htmlFor="transcript" style={{fontWeight:'bold'}}>Live Transcript:</label>
            <textarea id="transcript" value={transcript} readOnly rows={3} style={{width:'100%', fontSize:16, marginTop:4}} />
            {recognizing && <div style={{color:'#888'}}>Listening...</div>}
          </div>
        )}
        {recording && (
          <button onClick={stopRecording} style={{ fontSize: 16, padding: 10, background: "#c00", color: "#fff" }}>
            Stop & Submit
          </button>
        )}
      </div>
      {error && <div style={{ color: "red" }}>{error}</div>}
    </div>
  );
}

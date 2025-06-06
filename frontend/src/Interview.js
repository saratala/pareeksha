import React, { useRef, useState, useEffect } from "react";
import AudioRecorderPolyfill from 'audio-recorder-polyfill';
import Feedback from "./Feedback";

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
  const [uiLog, setUiLog] = useState("");
  const [feedback, setFeedback] = useState(null);
  let recognitionRef = useRef(null);

  // Start camera/mic and wait for audio+video to be ready
  useEffect(() => {
    let localStream;
    let cancelled = false;
    async function getStream() {
      setError("");
      setVideoReady(false);
      try {
        // Request both audio and video
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
          setUiLog(prev => prev + `\nvideoRef.current set with stream. Video tracks: ${localStream.getVideoTracks().length}`);
          videoRef.current.onloadedmetadata = () => {
            setUiLog(prev => prev + '\nvideoRef loadedmetadata fired');
            setVideoReady(true);
            videoRef.current.play(); // Ensure playback starts
          };
        } else {
          setUiLog(prev => prev + '\nvideoRef.current is null');
        }
        setStream(localStream);
      } catch (e) {
        setError("Could not access microphone/camera: " + e.message);
        setUiLog(prev => prev + `\ngetUserMedia error: ${e.message}`);
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
    console.log('useEffect [videoReady, stream, question]:', videoReady, stream, question);
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
    console.log('handleBegin called');
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
    console.log('playQuestion called');
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

  const getSupportedMimeType = () => {
    // Force video/webm for better compatibility
    if (window.MediaRecorder && window.MediaRecorder.isTypeSupported('video/webm')) {
      return 'video/webm';
    }
    // Fallbacks
    const possibleTypes = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/mp4'
    ];
    for (const type of possibleTypes) {
      if (window.MediaRecorder && window.MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  };

  // Helper to extract N frames from a video Blob
  async function extractFramesFromVideo(videoBlob, frameCount = 3) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(videoBlob);
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      let durationCheckTimeout;
      function waitForDuration(cb, tries = 0) {
        if (isFinite(video.duration) && video.duration > 0) {
          cb();
        } else if (tries < 60) { // wait up to ~6s
          durationCheckTimeout = setTimeout(() => waitForDuration(cb, tries + 1), 100);
        } else {
          reject(new Error('Video duration is not available or invalid for frame extraction.'));
        }
      }
      video.onloadedmetadata = () => {
        waitForDuration(() => {
          const duration = video.duration;
          if (!isFinite(duration) || duration <= 0) {
            reject(new Error('Video duration is not valid after waiting.'));
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          const frames = [];
          let extracted = 0;
          function seekAndCapture(time) {
            if (!isFinite(time) || time < 0 || time > duration) {
              reject(new Error('Invalid seek time for frame extraction.'));
              return;
            }
            // Defensive: double-check duration before seeking
            if (!isFinite(video.duration) || video.duration <= 0) {
              reject(new Error('Video duration became invalid during seek.'));
              return;
            }
            // Defensive: do not set currentTime if video.readyState < 1
            if (video.readyState < 1) {
              // Wait for canplay event before seeking
              video.oncanplay = () => {
                video.oncanplay = null;
                seekAndCapture(time);
              };
              return;
            }
            // Only set currentTime if it is different from the current value
            if (Math.abs(video.currentTime - time) > 0.01) {
              try {
                video.currentTime = time;
              } catch (e) {
                reject(new Error('Failed to set video.currentTime: ' + e.message));
              }
            } else {
              // Already at the correct time, trigger onseeked manually
              if (typeof video.onseeked === 'function') video.onseeked();
            }
          }
          video.onseeked = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
              frames.push(blob);
              extracted++;
              if (extracted < frameCount) {
                const nextTime = ((extracted + 1) / (frameCount + 1)) * duration;
                seekAndCapture(nextTime);
              } else {
                resolve(frames);
              }
            }, 'image/jpeg', 0.8);
          };
          // Defensive: wait for video.readyState >= 1 before first seek
          if (video.readyState < 1) {
            video.oncanplay = () => {
              seekAndCapture(duration / (frameCount + 1));
            };
          } else {
            seekAndCapture(duration / (frameCount + 1));
          }
        });
      };
      video.onerror = (e) => {
        if (durationCheckTimeout) clearTimeout(durationCheckTimeout);
        reject(e);
      };
    });
  }

  const startRecording = () => {
    setUiLog(prev => prev + "\nstartRecording called, stream: " + (stream ? "OK" : "null"));
    if (!stream) {
      setError("Microphone/camera stream not available. Please allow access and reload the page.");
      setUiLog(prev => prev + "\nERROR: No stream available");
      return;
    }
    setError("");
    setChunks([]);
    setTranscript("");
    try {
      let MR = window.MediaRecorder;
      const mimeType = getSupportedMimeType();
      setUiLog(prev => prev + `\nUsing MediaRecorder mimeType: ${mimeType}`);
      setUiLog(prev => prev + `\nBrowser userAgent: ${navigator.userAgent}`);
      setUiLog(prev => prev + `\nMediaRecorder.isTypeSupported(video/webm): ${window.MediaRecorder && window.MediaRecorder.isTypeSupported('video/webm')}`);
      setUiLog(prev => prev + `\nMediaRecorder.isTypeSupported(video/mp4): ${window.MediaRecorder && window.MediaRecorder.isTypeSupported('video/mp4')}`);
      setUiLog(prev => prev + `\nMediaRecorder.isTypeSupported(video/webm;codecs=vp8,opus): ${window.MediaRecorder && window.MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')}`);
      setUiLog(prev => prev + `\nMediaRecorder.isTypeSupported(video/webm;codecs=vp8): ${window.MediaRecorder && window.MediaRecorder.isTypeSupported('video/webm;codecs=vp8')}`);
      if (!MR) {
        setError("MediaRecorder is not supported in this browser.");
        setUiLog(prev => prev + "\nERROR: MediaRecorder not supported");
        return;
      }
      const mr = mimeType ? new MR(stream, { mimeType }) : new MR(stream);
      mediaRecorderRef.current = mr;
      const localChunks = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          localChunks.push(e.data);
        }
      };
      mr.onstop = async () => {
        const allChunks = localChunks;
        let blob;
        if (allChunks.length > 0) {
          blob = new Blob(allChunks, { type: mimeType || mr.mimeType || 'video/webm' });
        } else {
          blob = new Blob([], { type: mimeType || mr.mimeType || 'video/webm' });
        }
        setUiLog(prev => prev + `\nMediaRecorder stopped. Chunks: ${allChunks.length}, Blob size: ${blob.size}, Type: ${mimeType || mr.mimeType}`);
        if (blob.size === 0) {
          setError("Recording failed. No audio/video data was captured. This is a known issue with some browsers and the MediaRecorder API.\n\nDebug info: " + JSON.stringify({chunks: allChunks.length, type: mimeType || mr.mimeType, transcript}));
          stream.getTracks().forEach((t) => t.stop());
          setRecording(false);
          return;
        }
        // Defensive: check minimum recording duration (skip frame extraction if too short)
        let minDurationSec = 1.0;
        let durationOk = true;
        let durationValue = null;
        try {
          const tempVideo = document.createElement('video');
          tempVideo.src = URL.createObjectURL(blob);
          await new Promise((resolve, reject) => {
            tempVideo.onloadedmetadata = () => {
              durationValue = tempVideo.duration;
              if (!isFinite(tempVideo.duration) || tempVideo.duration < minDurationSec) {
                durationOk = false;
                setUiLog(prev => prev + `\nRecording too short for frame extraction (duration: ${tempVideo.duration}s).`);
              }
              resolve();
            };
            tempVideo.onerror = reject;
          });
        } catch (e) {
          setUiLog(prev => prev + `\nCould not check video duration: ${e}`);
        }
        if (!durationOk) {
          setError(`Recording too short for frame extraction. Please record at least ${minDurationSec} seconds. (If your browser cannot extract frames, our server will handle it automatically.)`);
          setUiLog(prev => prev + `\nBlob debug: type=${blob.type}, size=${blob.size}, url=${URL.createObjectURL(blob)}`);
          setUiLog(prev => prev + `\nDownload raw video: <a href='${URL.createObjectURL(blob)}' download='debug-video.webm'>debug-video.webm</a>`);
          // If duration is Infinity, skip frame extraction but still send video to backend
          if (durationValue === Infinity) {
            setUiLog(prev => prev + `\nDuration is Infinity. Skipping frame extraction and sending video to backend. Our server will extract frames automatically if needed.`);
            try {
              const formData = new FormData();
              formData.append('file', blob, 'video.webm');
              formData.append('transcript', transcript);
              formData.append('question', question);
              setUiLog(prev => prev + `\nSending video/audio (no frames) to /api/analyze, blob size: ${blob.size}`);
              const resp = await fetch('/api/analyze', {
                method: 'POST',
                body: formData
              });
              if (resp.ok) {
                const data = await resp.json();
                console.log('Received feedback from /api/analyze:', data);
                setUiLog(prev => prev + `\nLLM backend response: ${JSON.stringify(data)}`);
                setFeedback(data);
                onComplete({ videoBlob: blob, audioBlob: blob, transcript, whisperTranscript: null, feedback: data });
              } else {
                let backendError = await resp.text();
                setUiLog(prev => prev + `\nLLM backend error: ${backendError}`);
                setError('Backend error: ' + backendError);
                onComplete({ videoBlob: blob, audioBlob: blob, transcript, whisperTranscript: null, feedback: { error: backendError } });
              }
            } catch (err) {
              setUiLog(prev => prev + `\nFailed to fetch LLM analysis: ${err}`);
              setError('Failed to fetch LLM analysis: ' + err);
              onComplete({ videoBlob: blob, audioBlob: blob, transcript, whisperTranscript: null, feedback: { error: String(err) } });
            }
            stream.getTracks().forEach((t) => t.stop());
            setRecording(false);
            return;
          }
          stream.getTracks().forEach((t) => t.stop());
          setRecording(false);
          return;
        }
        // Extract frames from video
        let frames = [];
        let extractionError = null;
        try {
          frames = await extractFramesFromVideo(blob, 3); // 3 frames
          frames = frames.filter(f => f instanceof Blob && f.size > 0);
          setUiLog(prev => prev + `\nExtracted ${frames.length} valid frames from video.`);
          if (frames.length < 3) {
            setUiLog(prev => prev + `\nWarning: Less than 3 valid frames extracted.`);
          }
        } catch (err) {
          setUiLog(prev => prev + `\nFrame extraction error: ${err}`);
          extractionError = err;
          // Try fallback: re-create blob as video/mp4 if not already
          if (blob.type !== 'video/mp4' && window.MediaRecorder && window.MediaRecorder.isTypeSupported('video/mp4')) {
            try {
              const fallbackBlob = new Blob([blob], { type: 'video/mp4' });
              setUiLog(prev => prev + `\nRetrying frame extraction with fallback blob type video/mp4...`);
              frames = await extractFramesFromVideo(fallbackBlob, 3);
              frames = frames.filter(f => f instanceof Blob && f.size > 0);
              setUiLog(prev => prev + `\nExtracted ${frames.length} valid frames from fallback mp4 blob.`);
              extractionError = null;
            } catch (err2) {
              setUiLog(prev => prev + `\nFallback frame extraction (mp4) also failed: ${err2}`);
              extractionError = err2;
            }
          }
          // Try fallback: re-create blob as video/webm if not already
          if (extractionError && blob.type !== 'video/webm') {
            try {
              const fallbackBlob = new Blob([blob], { type: 'video/webm' });
              setUiLog(prev => prev + `\nRetrying frame extraction with fallback blob type video/webm...`);
              frames = await extractFramesFromVideo(fallbackBlob, 3);
              frames = frames.filter(f => f instanceof Blob && f.size > 0);
              setUiLog(prev => prev + `\nExtracted ${frames.length} valid frames from fallback webm blob.`);
              extractionError = null;
            } catch (err3) {
              setUiLog(prev => prev + `\nFallback frame extraction (webm) also failed: ${err3}`);
              extractionError = err3;
            }
          }
        }
        if (extractionError) {
          const blobUrl = URL.createObjectURL(blob);
          setUiLog(prev => prev + `\nBlob debug: type=${blob.type}, size=${blob.size}, url=${blobUrl}`);
          setUiLog(prev => prev + `\nDownload raw video: <a href='${blobUrl}' download='debug-video.webm'>debug-video.webm</a>`);
          setUiLog(prev => prev + `\nFrame extraction failed in browser. Our server will attempt to extract frames automatically.`);
          setError('Frame extraction failed in browser. The backend will attempt to extract frames from your video.');
        }
        // Send video, transcript, and frames to backend for LLM analysis
        try {
          const formData = new FormData();
          formData.append('file', blob, 'video.webm');
          formData.append('transcript', transcript);
          formData.append('question', question);
          frames.forEach((frame, idx) => {
            if (frame instanceof Blob && frame.size > 0) {
              formData.append(`frame${idx+1}`, frame, `frame${idx+1}.jpg`);
            } else {
              setUiLog(prev => prev + `\nFrame ${idx+1} is invalid and will not be sent.`);
            }
          });
          setUiLog(prev => prev + `\nSending video/audio and ${frames.length} frames to /api/analyze, blob size: ${blob.size}`);
          const resp = await fetch('/api/analyze', {
            method: 'POST',
            body: formData
          });
          if (resp.ok) {
            const data = await resp.json();
            console.log('Received feedback from /api/analyze:', data); // <-- log feedback
            setUiLog(prev => prev + `\nLLM backend response: ${JSON.stringify(data)}`);
            setFeedback(data);
            onComplete({ videoBlob: blob, audioBlob: blob, transcript, whisperTranscript: null, feedback: data });
          } else {
            let backendError = await resp.text();
            setUiLog(prev => prev + `\nLLM backend error: ${backendError}`);
            setError('Backend error: ' + backendError);
            onComplete({ videoBlob: blob, audioBlob: blob, transcript, whisperTranscript: null, feedback: { error: backendError } });
          }
        } catch (err) {
          setUiLog(prev => prev + `\nFailed to fetch LLM analysis: ${err}`);
          setError('Failed to fetch LLM analysis: ' + err);
          onComplete({ videoBlob: blob, audioBlob: blob, transcript, whisperTranscript: null, feedback: { error: String(err) } });
        }
        onComplete({ videoBlob: blob, audioBlob: blob, transcript, whisperTranscript: null });
        stream.getTracks().forEach((t) => t.stop());
      };
      setChunks([]); // Clear chunks before starting
      mr.start();
      setRecording(true);
    } catch (e) {
      setError("Could not start recording: " + e.message);
      setUiLog(prev => prev + "\nERROR: Exception in startRecording: " + e.message);
    }
  };

  const stopRecording = () => {
    console.log('stopRecording called, recording:', recording, 'mediaRecorderRef:', mediaRecorderRef.current);
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
      {/* Show video preview */}
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
      {uiLog && <pre style={{color:'#888', fontSize:12, background:'#f8f8f8', padding:8, marginBottom:8}}>{uiLog}</pre>}
      {error && <div style={{ color: "red" }}>{error}</div>}
      {feedback && (
        <Feedback feedback={feedback} />
      )}
    </div>
  );
}

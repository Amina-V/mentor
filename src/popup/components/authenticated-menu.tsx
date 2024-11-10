// src/components/authenticated-menu.tsx
import React, { useEffect, useState, useRef } from 'react';
import { ACTIONS, COLORS, STYLES } from '../../shared/constants';
import './authenticated-menu.css';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import { keyframes } from '@emotion/react';
import HumeServices from '../../../src/hume-services';

interface EmotionData {
  name: string;
  score: number;
}

const pulseAnimation = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(244, 67, 54, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0);
  }
`;

const AuthenticatedMenu: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const humeServiceRef = useRef<HumeServices | null>(null);
  const apiKeyRef = useRef<string>('');
  const [topFive, setTopFive] = useState<EmotionData[]>([]);
  const frameIntervalRef = useRef<number | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceResponse, setVoiceResponse] = useState<string>('');
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingInterval = useRef<number | null>(null);

  useEffect(() => {
    setIsMounted(true);
    // Retrieve API key from storage
    chrome.storage.sync.get(['apiKey'], (results) => {
      if (results.apiKey) {
        apiKeyRef.current = results.apiKey;
      } else {
        alert('API key not found. Please set your API key in the extension settings.');
      }
    });

    return () => {
      setIsMounted(false);
      stopStreaming();
    };
  }, []);

  useEffect(() => {
    if (voiceActive) {
      setRecordingTime(0);
      recordingInterval.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
        recordingInterval.current = null;
      }
      setRecordingTime(0);
    }

    return () => {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
    };
  }, [voiceActive]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startStreaming = async () => {
    if (!isMounted) {
      console.error('Component not mounted');
      return;
    }

    try {
      console.log('Requesting webcam and microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current?.play();
            setStreaming(true);

            // Initialize and connect Hume service
            humeServiceRef.current = new HumeServices(apiKeyRef.current);
            
            // Connect WebSocket for emotions
            await humeServiceRef.current.connectEmotions((emotionData) => {
              console.log('Emotion data received:', emotionData);
              setTopFive(emotionData);
            });

            // Connect WebSocket for voice
            await humeServiceRef.current.connectVoice();
            
            // Set up voice transcript callback
            humeServiceRef.current.setTranscriptCallback((transcript) => {
              console.log('Voice transcript received:', transcript);
              setVoiceResponse(transcript);
            });

            // Start frame capture for emotion detection
            startFrameCapture();

          } catch (error) {
            console.error('Error starting services:', error);
            stopStreaming();
          }
        };
      }
    } catch (error) {
      console.error('Error starting stream:', error);
      alert('Error accessing webcam/microphone: ' + (error as Error).message);
    }
  };

  const startFrameCapture = () => {
    if (!videoRef.current || !humeServiceRef.current) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    frameIntervalRef.current = window.setInterval(async () => {
      if (!videoRef.current || !ctx || !humeServiceRef.current) return;

      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;

      if (canvas.width === 0 || canvas.height === 0) {
        console.error('Video dimensions not ready.');
        return;
      }

      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob || !humeServiceRef.current) return;
        const base64Frame = await humeServiceRef.current.convertBlobToBase64(blob);
        humeServiceRef.current.sendFrame(base64Frame);
      }, 'image/jpeg', 0.8);
    }, 7500);
  };

  const toggleVoice = async () => {
    if (!humeServiceRef.current) return;

    try {
      if (!voiceActive) {
        await humeServiceRef.current.startVoiceCapture();
        setVoiceActive(true);
        // Show start recording feedback
        const startMessage = "Started voice recording";
        setVoiceResponse(prevResponse => 
          `${startMessage}\n${prevResponse ? '---\n' + prevResponse : ''}`
        );
      } else {
        humeServiceRef.current.stopVoiceCapture();
        setVoiceActive(false);
        // Show stop recording feedback
        const stopMessage = "Stopped voice recording";
        setVoiceResponse(prevResponse => 
          `${stopMessage}\n${prevResponse ? '---\n' + prevResponse : ''}`
        );
      }
    } catch (error) {
      console.error('Error toggling voice:', error);
      setVoiceActive(false);
      setVoiceResponse('Error with voice recording: ' + (error as Error).message);
    }
  };

  const stopStreaming = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }

    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    if (humeServiceRef.current) {
      humeServiceRef.current.cleanup();
      humeServiceRef.current = null;
    }

    setStreaming(false);
    setVoiceActive(false);
    setTopFive([]);
    setVoiceResponse('');
  };

  return (
    <Box sx={{ padding: 2 }}>
      <Typography sx={{ textAlign: 'center' }} variant='body1' gutterBottom>
        Click "{streaming ? 'Stop' : 'Start'}" to {streaming ? 'stop' : 'begin'}!
      </Typography>
      
      <video 
        ref={videoRef} 
        style={{
          display: 'block',
          width: '100%',
          maxWidth: '300px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          marginTop: '10px',
          marginBottom: '10px'
        }}
        playsInline
        muted
      />

      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
        <Button
          size='large'
          variant='outlined'
          aria-label={streaming ? 'Stop streaming' : 'Start streaming'}
          sx={STYLES.customCTABtnStyles}
          onClick={streaming ? stopStreaming : startStreaming}
        >
          {streaming ? 'Stop' : 'Start'}
        </Button>

        {streaming && (
          <IconButton 
            aria-label={voiceActive ? 'Stop voice recording' : 'Start voice recording'}
            onClick={toggleVoice}
            sx={{
              color: voiceActive ? '#f44336' : '#4caf50',
              border: '1px solid currentColor',
              backgroundColor: voiceActive ? 'rgba(244, 67, 54, 0.1)' : 'transparent',
              animation: voiceActive ? `${pulseAnimation} 2s infinite` : 'none',
              transition: 'all 0.3s ease',
              '&:hover': {
                backgroundColor: voiceActive 
                  ? 'rgba(244, 67, 54, 0.2)' 
                  : 'rgba(76, 175, 80, 0.1)'
              },
              position: 'relative',
              '&::after': voiceActive ? {
                content: '""',
                position: 'absolute',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#f44336',
                top: '5px',
                right: '5px'
              } : {}
            }}
          >
            {voiceActive ? (
              <>
                <MicOffIcon />
                <Typography
                  variant="caption"
                  sx={{
                    position: 'absolute',
                    bottom: '-25px',
                    fontSize: '0.75rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Recording... {formatTime(recordingTime)}
                </Typography>
              </>
            ) : (
              <MicIcon />
            )}
          </IconButton>
        )}
      </Box>

      {/* Voice Response Display */}
      {voiceResponse && (
        <Box sx={{ 
          mb: 2, 
          p: 2, 
          bgcolor: 'rgba(0, 0, 0, 0.04)', 
          borderRadius: 1,
          maxHeight: '100px',
          overflowY: 'auto'
        }}>
          <Typography variant='body2' color="text.secondary">
            Voice Response:
          </Typography>
          <Typography variant='body1'>
            {voiceResponse}
          </Typography>
        </Box>
      )}

      {/* Emotions Display */}
      {topFive.length > 0 && (
        <Box>
          <Typography variant='body1'>Top 5 Expressions</Typography>
          {topFive.map(({ name, score }, i) => (
            <Box key={i} display='flex' alignItems='center' mb={1}>
              <Typography variant='body2' sx={{ width: '20px' }}>{i + 1}</Typography>
              <Box
                sx={{
                  width: '20px',
                  height: '20px',
                  backgroundColor: COLORS[name],
                  marginRight: '8px',
                }}
              />
              <Typography sx={{ flexGrow: 1 }} variant='body2'>
                {name}
              </Typography>
              <Typography variant='body2'>{score.toFixed(2)}</Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default AuthenticatedMenu;
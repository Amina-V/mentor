import React, { useEffect, useState, useRef } from 'react';
import { ACTIONS, COLORS, STYLES } from '../../shared/constants';
import './authenticated-menu.css';
// components
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

const AuthenticatedMenu: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const apiKeyRef = useRef<string>('');
  const [topFive, setTopFive] = useState<any[]>([]);
  const intervalIdRef = useRef<number | null>(null);

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

  const startStreaming = async () => {
    if (!isMounted) {
      console.error('Component not yet mounted');
      return;
    }

    try {
      console.log('Requesting webcam access...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      console.log('Webcam access granted.');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        console.log('Stream set to video element.');

        videoRef.current.onloadedmetadata = () => {
          console.log('Video metadata loaded.');
          videoRef.current?.play().then(() => {
            console.log('Video playback started.');
            setStreaming(true);
            connectWebSocket();
          }).catch(error => {
            console.error('Error starting video playback:', error);
          });
        };
      } else {
        console.error('Video element reference is null.');
      }
    } catch (error) {
      console.error('Error starting stream:', error);
      alert('Error accessing webcam: ' + error.message);
    }
  };

  const stopStreaming = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (intervalIdRef.current !== null) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }

    setStreaming(false);
    setTopFive([]);
  };

  const connectWebSocket = () => {
    if (!apiKeyRef.current) {
      console.error('API key is not set.');
      alert('API key is not set. Please set your API key in the extension settings.');
      return;
    }

    const wsURL = `wss://api.hume.ai/v0/stream/models?apikey=${apiKeyRef.current}`;
    const ws = new WebSocket(wsURL);

    ws.onopen = () => {
      console.log('WebSocket connection established.');
      console.log("Streaming:", streaming);
      captureFrames(); // Start capturing frames when WebSocket is open
    };

    ws.onmessage = (event) => {
      console.log('Received message from Hume API:', event.data);
      const data = JSON.parse(event.data);
      console.log('Parsed data:', data);

      const topExpressions = extractTopFiveExpressions(data);
      console.log('Extracted top expressions:', topExpressions);
      setTopFive(topExpressions);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed.');
    };

    wsRef.current = ws;
  };

  const captureFrames = () => {
    console.log('Starting frame capture...');

    if (!wsRef.current) {
      console.error('WebSocket is not ready.');
      return;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const captureAndSend = () => {
      console.log('Capturing frame...');

      if (!videoRef.current || !ctx || !wsRef.current) return;

      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;

      if (canvas.width === 0 || canvas.height === 0) {
        console.error('Video dimensions not ready.', canvas);
        return;
      }

      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob || !wsRef.current) return;

        const base64Data = await blobToBase64(blob);
        const message = JSON.stringify({
          data: base64Data.split(',')[1],
          models: { face: {} },
          payload_id: `${Date.now()}`,
        });
        console.log('Sending frame to Hume API');
        wsRef.current.send(message);
      }, 'image/jpeg', 0.8);
    };

    console.log('Starting frame capture interval...');
    intervalIdRef.current = window.setInterval(captureAndSend, 1000 / 2); // 2 fps
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const extractTopFiveExpressions = (res: any): any[] => {
    console.log('Extracting top five expressions from response:', res);

    if (!res.face || !res.face.predictions || res.face.predictions.length === 0) {
      console.warn('No face predictions found in the response.');
      return [];
    }

    const emotions = res.face.predictions[0].emotions;
    if (!emotions || emotions.length === 0) {
      console.warn('No emotions found in the face prediction.');
      return [];
    }

    return emotions
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
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

      <Button
        size='large'
        variant='outlined'
        aria-label={streaming ? 'Stop streaming' : 'Start streaming'}
        sx={{ ...STYLES.customCTABtnStyles, marginBottom: 2 }}
        onClick={streaming ? stopStreaming : startStreaming}
      >
        {streaming ? 'Stop' : 'Start'}
      </Button>

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

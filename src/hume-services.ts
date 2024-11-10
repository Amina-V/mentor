// src/services/hume-services.ts
import { Hume, HumeClient } from 'hume';

interface EmotionData {
  name: string;
  score: number;
}

type EmotionCallback = (emotions: EmotionData[]) => void;
type TranscriptCallback = (transcript: string) => void;

class HumeServices {
  private CONFIG_ID: string;
  private API_KEY: string;
  private SECRET_KEY: string;
  private client: HumeClient;
  
  // Emotion WebSocket
  private emotionSocket: WebSocket | null;
  private emotionCallback: EmotionCallback | null;

  // Voice WebSocket
  private voiceSocket: any;
  private transcriptCallback: TranscriptCallback | null;
  private audioStream: MediaStream | null;
  private recorder: MediaRecorder | null;
  private audioQueue: Blob[];
  private isPlaying: boolean;
  private currentAudio: HTMLAudioElement | null;
  private mimeType: string;

  constructor(apiKey: string) {
    this.CONFIG_ID = '9b9e0037-48aa-45d0-867a-d7b87d88be24';
    this.API_KEY = apiKey;
    this.SECRET_KEY = 'KqdFn07jjhrAiaePYBAVtZ2M2wkvTluGoV0KCr7TrbE3G47k6paYm3CsAUMFC4AG';
    
    this.client = new HumeClient({
      apiKey: this.API_KEY,
      secretKey: this.SECRET_KEY,
    });

    // Initialize emotion properties
    this.emotionSocket = null;
    this.emotionCallback = null;

    // Initialize voice properties
    this.voiceSocket = null;
    this.transcriptCallback = null;
    this.audioStream = null;
    this.recorder = null;
    this.audioQueue = [];
    this.isPlaying = false;
    this.currentAudio = null;
    this.mimeType = this.getBrowserSupportedMimeType();
  }

  // Emotion Methods
  async connectEmotions(callback: EmotionCallback) {
    this.emotionCallback = callback;
    const wsUrl = `wss://api.hume.ai/v0/stream/models?apikey=${this.API_KEY}`;
    
    this.emotionSocket = new WebSocket(wsUrl);

    this.emotionSocket.onopen = () => {
      console.log('Emotion WebSocket connected');
    };

    this.emotionSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (this.emotionCallback) {
          const emotions = this.extractEmotions(data);
          this.emotionCallback(emotions);
        }
      } catch (error) {
        console.error('Error processing emotion data:', error);
      }
    };

    this.emotionSocket.onerror = (error) => {
      console.error('Emotion WebSocket error:', error);
    };
  }

  async sendFrame(base64Frame: string) {
    if (this.emotionSocket?.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        data: base64Frame,
        models: { face: {} },
        payload_id: Date.now().toString()
      });
      this.emotionSocket.send(message);
    }
  }

  // Voice Methods
  async connectVoice() {
    try {
      // Connect using the Hume client
      const socket = await this.client.empathicVoice.chat.connect({
        configId: this.CONFIG_ID
      });

      // Set up event handlers
      socket.on('open', () => {
        console.log('Voice connection established');
      });

      socket.on('message', (message: any) => {
        console.log('Received voice message:', message);
        if (message.type === 'audio_output') {
          const audioData = message.data;
          const blob = this.convertBase64ToBlob(audioData, this.mimeType);
          this.audioQueue.push(blob);
          if (this.audioQueue.length === 1) {
            this.playAudio();
          }
        } else if (message.type === 'transcript') {
          if (this.transcriptCallback) {
            this.transcriptCallback(message.data);
          }
        }
      });

      socket.on('error', (error: any) => {
        console.error('Voice socket error:', error);
      });

      socket.on('close', () => {
        console.log('Voice connection closed');
      });

      this.voiceSocket = socket;
    } catch (error) {
      console.error('Error connecting to voice service:', error);
      throw error;
    }
  }

  async startVoiceCapture() {
    if (!this.voiceSocket) {
      throw new Error('Voice socket not connected');
    }

    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recorder = new MediaRecorder(this.audioStream, { mimeType: this.mimeType });
      
      this.recorder.ondataavailable = async ({ data }) => {
        if (data.size < 1) return;
        
        try {
          // Convert the blob to base64
          const base64Audio = await this.convertBlobToBase64(data);
          
          // Use the Hume client's sendAudioInput method
          if (this.voiceSocket) {
            await this.voiceSocket.sendAudioInput({
              data: base64Audio
            });
            console.log('Audio data sent successfully');
          } else {
            console.warn('Voice socket not available');
          }
        } catch (error) {
          console.error('Error processing audio data:', error);
        }
      };

      this.recorder.start(100); // Capture every 100ms
    } catch (error) {
      console.error('Error starting voice capture:', error);
      throw error;
    }
  }

  stopVoiceCapture() {
    if (this.recorder) {
      this.recorder.stop();
      this.recorder = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
    this.stopAudio();
  }

  setTranscriptCallback(callback: TranscriptCallback) {
    this.transcriptCallback = callback;
  }

  // Utility Methods
  private getBrowserSupportedMimeType(): string {
    const types = ['audio/webm', 'audio/mp4', 'audio/ogg'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return 'audio/webm';
  }

  private extractEmotions(data: any): EmotionData[] {
    if (!data.face || !data.face.predictions || data.face.predictions.length === 0) {
      return [];
    }
    const emotions = data.face.predictions[0].emotions;
    return emotions.sort((a: any, b: any) => b.score - a.score).slice(0, 5);
  }

  async convertBlobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result?.toString().split(',')[1];
        if (base64data) resolve(base64data);
        else reject(new Error('Failed to convert blob to base64'));
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private convertBase64ToBlob(base64: string, mimeType: string): Blob {
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mimeType });
  }

  private playAudio() {
    if (!this.audioQueue.length || this.isPlaying) return;
    
    this.isPlaying = true;
    const audioBlob = this.audioQueue.shift();
    if (!audioBlob) return;

    const audioUrl = URL.createObjectURL(audioBlob);
    this.currentAudio = new Audio(audioUrl);
    
    this.currentAudio.onended = () => {
      this.isPlaying = false;
      URL.revokeObjectURL(audioUrl);
      if (this.audioQueue.length) {
        this.playAudio();
      }
    };

    this.currentAudio.play().catch(error => {
      console.error('Error playing audio:', error);
      this.isPlaying = false;
      URL.revokeObjectURL(audioUrl);
    });
  }

  private stopAudio() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.isPlaying = false;
    this.audioQueue.length = 0;
  }

  // Cleanup
  cleanup() {
    // Clean up voice
    this.stopVoiceCapture();
    if (this.voiceSocket) {
      this.voiceSocket.close();
      this.voiceSocket = null;
    }

    // Clean up emotions
    if (this.emotionSocket) {
      this.emotionSocket.close();
      this.emotionSocket = null;
    }

    this.emotionCallback = null;
    this.transcriptCallback = null;
  }
}

export default HumeServices;
// src/services/hume-services.ts
import {
  Hume,
  HumeClient,
  convertBlobToBase64,
  convertBase64ToBlob,
  getBrowserSupportedMimeType,
  MimeType,
} from 'hume';

export default class HumeServices {
  private client: HumeClient | null = null;
  private chatSocket: Hume.empathicVoice.chat.ChatSocket | null = null;
  private recorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private audioQueue: Blob[] = [];
  private isPlaying = false;
  private isConnected = false;
  private resumeChats = true;
  private chatGroupId?: string;
  private mimeType: MimeType;
  private processedMessages = new Set<string>();

  constructor(
    private readonly API_KEY: string,
    private readonly SECRET_KEY: string,
    private readonly CONFIG_ID: string
  ) {
    const result = getBrowserSupportedMimeType();
    this.mimeType = result.success ? result.mimeType : MimeType.WEBM;
  }

  async connectChat(): Promise<void> {
    if (this.isConnected || this.chatSocket) {
      console.log('Chat already connected, skipping...');
      return;
    }

    try {
      if (!this.client) {
        this.client = new HumeClient({
          apiKey: this.API_KEY,
          secretKey: this.SECRET_KEY,
        });
      }

      this.chatSocket = await this.client.empathicVoice.chat.connect({
        configId: this.CONFIG_ID,
        resumedChatGroupId: this.chatGroupId,
      });

      if (!this.chatSocket) {
        throw new Error('Failed to create chat socket');
      }

      this.chatSocket.on('open', this.handleWebSocketOpenEvent.bind(this));
      this.chatSocket.on('message', this.handleWebSocketMessageEvent.bind(this));
      this.chatSocket.on('error', this.handleWebSocketErrorEvent.bind(this));
      this.chatSocket.on('close', this.handleWebSocketCloseEvent.bind(this));

      this.isConnected = true;
      console.log('Chat WebSocket connected successfully');
    } catch (error) {
      console.error('Error connecting chat:', error);
      this.cleanup();
      throw error;
    }
  }

  async startAudioCapture(): Promise<void> {
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Audio stream started:', this.audioStream.active);
      
      if (!this.audioStream.active) {
        throw new Error('Audio stream not active');
      }

      this.recorder = new MediaRecorder(this.audioStream, { mimeType: this.mimeType });
      
      this.recorder.ondataavailable = async ({ data }) => {
        if (data.size < 1) return;
        
        try {
          const encodedAudioData = await convertBlobToBase64(data);
          this.chatSocket?.sendAudioInput({ data: encodedAudioData });
        } catch (error) {
          console.error('Error sending audio data:', error);
        }
      };

      const timeSlice = 100;
      this.recorder.start(timeSlice);
    } catch (error) {
      console.error('Error starting audio capture:', error);
      throw error;
    }
  }

  private async playAudio(): Promise<void> {
    if (!this.audioQueue.length || this.isPlaying) return;

    this.isPlaying = true;
    const audioBlob = this.audioQueue.shift();
    if (!audioBlob) return;

    const audioUrl = URL.createObjectURL(audioBlob);
    this.currentAudio = new Audio(audioUrl);

    await this.currentAudio.play();
    this.currentAudio.onended = () => {
      this.isPlaying = false;
      if (this.audioQueue.length) this.playAudio();
    };
  }

  private stopAudio(): void {
    this.currentAudio?.pause();
    this.currentAudio = null;
    this.isPlaying = false;
    this.audioQueue = [];
  }

  private async handleWebSocketOpenEvent(): Promise<void> {
    console.log('Chat WebSocket connection opened');
    this.isConnected = true;
    await this.startAudioCapture();
  }

  private handleWebSocketMessageEvent(event: Hume.empathicVoice.SubscribeEvent): void {
    console.log('WebSocket message received:', event.type);

    if (!this.isConnected) return;

    switch (event.type) {
      case 'chat_metadata':
        if (!this.chatGroupId) {
          this.chatGroupId = event.chatGroupId;
        }
        break;

      case 'user_message':
      case 'assistant_message':
        if (this.messageCallback && event.message?.content) {
          const messageId = `${event.type}-${Date.now()}`;
          if (this.processedMessages.has(messageId)) return;
          
          this.processedMessages.add(messageId);
          setTimeout(() => this.processedMessages.delete(messageId), 5000);

          this.messageCallback({
            role: event.message.role,
            content: event.message.content || '',
            timestamp: new Date().toISOString(),
            emotions: this.extractTopThreeEmotions(event)
          });
        }
        break;

      case 'audio_output':
        if (event.data) {
          const blob = convertBase64ToBlob(event.data, this.mimeType);
          this.audioQueue.push(blob);
          if (!this.isPlaying) {
            this.playAudio();
          }
        }
        break;

      case 'user_interruption':
        this.stopAudio();
        break;
    }
  }

  private handleWebSocketErrorEvent(error: Error): void {
    console.error('WebSocket error:', error);
  }

  private handleWebSocketCloseEvent(): void {
    console.log('WebSocket closed');
    this.isConnected = false;
  }

  private extractTopThreeEmotions(
    message: Hume.empathicVoice.UserMessage | Hume.empathicVoice.AssistantMessage
  ): { emotion: string; score: string }[] {
    const scores = message.models.prosody?.scores;
    if (!scores) return [];

    return Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([emotion, score]) => ({
        emotion,
        score: (Math.round(Number(score) * 100) / 100).toFixed(2),
      }));
  }

  async sendChatMessage(text: string): Promise<void> {
    if (!this.chatSocket) {
      throw new Error("Chat socket not connected");
    }

    try {
      const blob = new Blob([text], { type: 'text/plain' });
      const encodedData = await convertBlobToBase64(blob);
      
      await this.chatSocket.sendAudioInput({
        data: encodedData
      });
    } catch (error) {
      console.error("Error sending chat message:", error);
      throw error;
    }
  }

  cleanup(): void {
    console.log('Cleaning up HumeServices...');
    
    this.stopAudio();
    
    if (this.recorder) {
      this.recorder.stop();
      this.recorder = null;
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }

    this.isConnected = false;
    
    if (!this.resumeChats) {
      this.chatGroupId = undefined;
    }

    if (this.chatSocket) {
      this.chatSocket.close();
      this.chatSocket = null;
    }
  }

  private messageCallback?: (message: {
    role: Hume.empathicVoice.Role;
    content: string;
    timestamp: string;
    emotions: { emotion: string; score: string }[];
  }) => void;

  setMessageCallback(callback: typeof this.messageCallback) {
    this.messageCallback = callback;
  }

  setChatGroupId(id: string | undefined) {
    this.chatGroupId = id;
  }

  setResumeChats(resume: boolean) {
    this.resumeChats = resume;
  }
}
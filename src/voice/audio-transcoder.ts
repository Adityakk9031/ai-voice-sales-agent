import { WaveFile } from 'wavefile';

export class AudioTranscoder {
  private targetSampleRate: number;

  constructor(targetSampleRate: number = 16000) {
    this.targetSampleRate = targetSampleRate;
  }

  // Twilio (8kHz mu-law) -> Gemini (PCM 16-bit)
  public mulawToPcm(mulawBuffer: Buffer): Buffer {
    try {
      const wav = new WaveFile();
      wav.fromScratch(1, 8000, '8m', new Uint8Array(mulawBuffer));
      wav.fromMuLaw(); // decode to 16-bit PCM
      
      if (this.targetSampleRate !== 8000) {
        wav.toSampleRate(this.targetSampleRate);
      }
      
      wav.toBitDepth('16');
      const samples = (wav as any).data.samples as Int16Array;
      return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
    } catch {
      return Buffer.alloc(0);
    }
  }

  // Gemini (PCM 16-bit) -> Twilio (8kHz mu-law)
  public pcmToMulaw(pcmBuffer: Buffer, sourceSampleRate: number = 16000): Buffer {
    try {
      const wav = new WaveFile();
      const samples = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength / 2);
      wav.fromScratch(1, sourceSampleRate, '16', samples);
      
      if (sourceSampleRate !== 8000) {
        wav.toSampleRate(8000);
      }
      
      wav.toMuLaw();
      const mulawSamples = (wav as any).data.samples as Uint8Array;
      return Buffer.from(mulawSamples.buffer, mulawSamples.byteOffset, mulawSamples.byteLength);
    } catch {
      return Buffer.alloc(0);
    }
  }
}

import React, { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  color: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ analyser, isActive, color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    let animationId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return;

    // Draw parameters
    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      
      const width = canvas.width;
      const height = canvas.height;
      
      // Clean background with very soft transparency
      canvasCtx.clearRect(0, 0, width, height);

      if (!isActive || !analyser) {
        // Draw elegant ambient breathing line
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = `${color}40`; // 40 is hex opacity
        canvasCtx.beginPath();
        canvasCtx.moveTo(0, height / 2);
        
        const time = Date.now() * 0.003;
        for (let i = 0; i < width; i++) {
          const y = height / 2 + Math.sin(i * 0.04 + time) * 2;
          canvasCtx.lineTo(i, y);
        }
        canvasCtx.stroke();
        return;
      }

      analyser.getByteTimeDomainData(dataArray);

      // Create beautiful neon gradient
      const gradient = canvasCtx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.5, `${color}bb`);
      gradient.addColorStop(1, color);

      canvasCtx.lineWidth = 3;
      canvasCtx.strokeStyle = gradient;
      canvasCtx.shadowBlur = 10;
      canvasCtx.shadowColor = color;
      canvasCtx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        // Apply amplification for small signals
        const amp = 1.3;
        const norm = v - 1.0;
        const y = (1.0 + norm * amp) * height / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(width, height / 2);
      canvasCtx.stroke();
      canvasCtx.shadowBlur = 0; // Reset shadow for performance
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [analyser, isActive, color]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-12 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-medium)]"
      width={400} 
      height={64} 
    />
  );
};

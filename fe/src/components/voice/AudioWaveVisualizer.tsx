import React from 'react';

interface AudioWaveVisualizerProps {
  isListening: boolean;
  volume: number; // 0 to 100
}

/**
 * Component hien thi visualizer song am thanh dong theo bien do am luong.
 */
export const AudioWaveVisualizer: React.FC<AudioWaveVisualizerProps> = ({ isListening, volume }) => {
  const barCount = 16;
  const bars = Array.from({ length: barCount }, (_, i) => i);

  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-1">
      <div className="relative flex items-center justify-center">
        <div
          className={`w-14 h-14 rounded-full bg-gradient-to-tr from-amber-500 via-amber-400 to-purple-600 transition-transform duration-100 flex items-center justify-center shadow-xl ${
            isListening ? 'shadow-[0_0_30px_rgba(245,158,11,0.6)]' : 'shadow-none opacity-40'
          }`}
          style={{
            transform: isListening
              ? `scale(${1 + (volume / 100) * 0.3})`
              : 'scale(1)',
          }}
        >
          <div className="w-11 h-11 rounded-full bg-[#0F172A] flex items-center justify-center border border-amber-400/40">
            <span className="text-base animate-pulse">🎙️</span>
          </div>
        </div>

        {isListening && volume > 10 && (
          <div
            className="absolute inset-0 rounded-full border border-amber-400/40 animate-ping pointer-events-none"
            style={{ animationDuration: '1.2s' }}
          />
        )}
      </div>

      <div className="flex items-center gap-1.5 h-9 px-3.5 py-1 rounded-xl bg-slate-950/80 border border-slate-800">
        {bars.map((index) => {
          const distanceToCenter = Math.abs(index - (barCount - 1) / 2);
          const factor = Math.max(0.2, 1 - distanceToCenter / (barCount / 2));
          const dynamicHeight = isListening
            ? Math.max(4, Math.min(28, (volume * 0.35 + Math.random() * 6) * factor))
            : 4;

          return (
            <div
              key={index}
              className="w-1.5 rounded-full transition-all duration-75"
              style={{
                height: `${dynamicHeight}px`,
                background:
                  index % 2 === 0
                    ? 'linear-gradient(to top, #F59E0B, #FBBF24)'
                    : 'linear-gradient(to top, #9333EA, #C084FC)',
                boxShadow: isListening && volume > 15
                  ? '0 0 8px rgba(245,158,11,0.5)'
                  : 'none',
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

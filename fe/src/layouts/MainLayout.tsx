import React, { useState } from 'react';
import { MeteorEdgeMenu } from '../components/navigation/MeteorEdgeMenu';
import { SolarisVoiceAssistantWidget } from '../components/voice/SolarisVoiceAssistantWidget';

interface MainLayoutProps {
  children: React.ReactNode;
  currentRoute: string;
  onNavigate: (route: string) => void;
}

/**
 * Layout tong the bao gom menu dieu huong va widget tro ly giong noi Solaris.
 */
export const MainLayout: React.FC<MainLayoutProps> = ({ children, currentRoute, onNavigate }) => {
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const currentProjectId = searchParams?.get('projectId') || undefined;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 font-['Plus_Jakarta_Sans',sans-serif] relative overflow-x-hidden">
      <div className="fixed top-0 left-1/4 w-[600px] h-[300px] bg-indigo-950/20 rounded-full blur-[160px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[600px] h-[300px] bg-amber-950/15 rounded-full blur-[180px] pointer-events-none" />

      <MeteorEdgeMenu
        currentRoute={currentRoute}
        onNavigate={onNavigate}
        onOpenVoiceCommand={() => setIsVoiceModalOpen(true)}
      />

      <SolarisVoiceAssistantWidget
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        currentProjectId={currentProjectId}
        onExecuteCommand={(text) => {
          console.log('Voice Command Executed:', text);
        }}
      />

      <main className="pl-16 min-h-screen relative z-10 transition-all duration-300">
        {children}
      </main>
    </div>
  );
};


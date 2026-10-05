import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

class SocketService {
  public socket: Socket | null = null;
  private reconnectCallbacks: Array<() => void> = [];

  connect() {
    if (this.socket?.connected) return;

    const token = localStorage.getItem('solarisToken');

    this.socket = io(SOCKET_URL, {
      auth: {
        token: token || '',
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      console.log('⚡ Connected to Socket.IO Server [ID:', this.socket?.id, ']');
      // Trigger all registered reconnect callbacks to sync fresh state
      this.reconnectCallbacks.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          console.error('Error executing reconnect callback:', e);
        }
      });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from Socket.IO Server. Reason:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.warn('⚠️ Socket connection error, attempting auto-reconnect...', error.message);
    });

    this.socket.io.on('reconnect', (attempt) => {
      console.log('🔄 Reconnected successfully to Socket.IO Server on attempt:', attempt);
      this.reconnectCallbacks.forEach((cb) => cb());
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  onReconnect(callback: () => void) {
    this.reconnectCallbacks.push(callback);
    return () => {
      this.reconnectCallbacks = this.reconnectCallbacks.filter((cb) => cb !== callback);
    };
  }

  joinProject(projectId: string) {
    if (this.socket?.connected) {
      const token = localStorage.getItem('solarisToken') || '';
      this.socket.emit('joinProject', { projectId, token });
    }
  }

  leaveProject(projectId: string) {
    if (this.socket?.connected) {
      this.socket.emit('leaveProject', { projectId });
    }
  }

  joinUser(userId: string) {
    if (this.socket?.connected) {
      const token = localStorage.getItem('solarisToken') || '';
      this.socket.emit('joinUser', { userId, token });
    }
  }

  leaveUser(userId: string) {
    if (this.socket?.connected) {
      this.socket.emit('leaveUser', { userId });
    }
  }

  emit(event: string, data?: any) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  on(event: string, callback: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback?: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }
}

export const socketService = new SocketService();
  

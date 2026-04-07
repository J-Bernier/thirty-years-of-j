import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState } from '../types';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  gameState: GameState | null;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  gameState: null,
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);

  useEffect(() => {
    const socketInstance = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3000');

    socketInstance.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    // Listen for gameState at the context level — no race condition possible.
    // The listener is attached before the socket connects, so the initial
    // state from the server is always captured.
    socketInstance.on('gameStateUpdate', (state: GameState) => {
      setGameState(state);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected, gameState }}>
      {children}
    </SocketContext.Provider>
  );
};

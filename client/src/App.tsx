import { SocketProvider } from './context/SocketContext';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import HostDashboard from './views/HostDashboard';
import PlayerView from './views/PlayerView';
import DisplayView from './views/DisplayView';

function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
      <h1 className="text-4xl font-bold mb-8 text-primary">Thirty Years of J</h1>
      <div className="grid gap-4 w-full max-w-md">
        <Link to="/host" className="p-6 text-center border rounded-lg hover:bg-accent transition-colors">
          <h2 className="text-2xl font-semibold">Host</h2>
          <p className="text-muted-foreground">Control the game</p>
        </Link>
        <Link to="/player" className="p-6 text-center border rounded-lg hover:bg-accent transition-colors">
          <h2 className="text-2xl font-semibold">Player</h2>
          <p className="text-muted-foreground">Join a team</p>
        </Link>
        <Link to="/display" className="p-6 text-center border rounded-lg hover:bg-accent transition-colors">
          <h2 className="text-2xl font-semibold">Display</h2>
          <p className="text-muted-foreground">Big screen view</p>
        </Link>
      </div>
    </div>
  );
}

function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/host" element={<HostDashboard />} />
          <Route path="/player" element={<PlayerView />} />
          <Route path="/display" element={<DisplayView />} />
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  );
}

export default App;

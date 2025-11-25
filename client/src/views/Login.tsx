import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      navigate("/host");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="max-w-md w-full space-y-8 p-8 border rounded-lg shadow-lg bg-card">
        <h2 className="text-3xl font-bold text-center">Host Login</h2>
        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded text-sm">
            {error}
          </div>
        )}
        <button
          onClick={handleLogin}
          className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-semibold"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

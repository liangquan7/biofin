"use client";
import { useState } from "react";
import { auth } from "@/lib/firebase";
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/"); 
    } catch (err: any) { alert(err.message); }
  };

  const handleGoogle = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.push("/");
    } catch (err: any) { alert("Google login failed."); }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f2f7f4', fontFamily: 'Sora, sans-serif' }}>
      <div style={{ background: '#fff', padding: 40, borderRadius: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.05)', width: 400 }}>
        <h2 style={{ textAlign: 'center', color: '#0f2d1e', marginBottom: 30 }}>BioFin Oracle Login</h2>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <input type="email" placeholder="EMAIL" onChange={(e) => setEmail(e.target.value)} style={{ padding: 12, borderRadius: 10, border: '1px solid #e4ede8' }} required />
          <input type="password" placeholder="PASSWORD" onChange={(e) => setPassword(e.target.value)} style={{ padding: 12, borderRadius: 10, border: '1px solid #e4ede8' }} required />
          <button type="submit" style={{ background: '#059669', color: '#fff', padding: 12, borderRadius: 10, border: 'none', fontWeight: 700, cursor: 'pointer' }}>EMAIL LOGIN</button>
        </form>
        <button onClick={handleGoogle} style={{ width: '100%', marginTop: 15, padding: 12, borderRadius: 10, border: '1px solid #e4ede8', background: '#fff', cursor: 'pointer' }}>Continue with Google</button>
      </div>
    </div>
  );
}
import { useState, useEffect, useRef } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081';
const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || '15559924197';
const MIXPANEL_ID = import.meta.env.VITE_MIXPANEL_ID || '';

function App() {
  const [step, setStep] = useState('form'); // 'form' | 'verifying' | 'dashboard'
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNo, setPhoneNo] = useState('');
  const [ipAddress, setIpAddress] = useState('127.0.0.1');
  const [deviceId, setDeviceId] = useState('DEVICE-123');
  
  const [sessionId, setSessionId] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sseConnected, setSseConnected] = useState(false);

  const abortControllerRef = useRef(null);

  // Auto-fetch IP Address and Device ID (Mixpanel / Fallback) on mount
  useEffect(() => {
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => {
        if (data.ip) {
          setIpAddress(data.ip);
        }
      })
      .catch(() => {
        // Fallback to default
        setIpAddress('127.0.0.1');
      });
      
    // Helper to extract Mixpanel distinct ID from SDK, cookies, or localStorage
    const getMixpanelId = () => {
      // 1. Try SDK directly if loaded globally
      if (window.mixpanel && typeof window.mixpanel.get_distinct_id === 'function') {
        return window.mixpanel.get_distinct_id();
      }
      
      // 2. Try target localStorage key using VITE_MIXPANEL_ID
      if (MIXPANEL_ID) {
        const key = `mp_${MIXPANEL_ID}_mixpanel`;
        try {
          const item = localStorage.getItem(key);
          if (item) {
            const data = JSON.parse(item);
            if (data && data.distinct_id) return data.distinct_id;
          }
        } catch (e) {}
      }
      
      // 3. Fallback scan localStorage (wildcard scan)
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('mp_') && key.endsWith('_mixpanel')) {
            const data = JSON.parse(localStorage.getItem(key));
            if (data && data.distinct_id) return data.distinct_id;
          }
        }
      } catch (e) {}

      // 4. Try target cookie using VITE_MIXPANEL_ID
      if (MIXPANEL_ID) {
        const key = `mp_${MIXPANEL_ID}_mixpanel`;
        try {
          const cookies = document.cookie.split(';');
          for (let cookie of cookies) {
            cookie = cookie.trim();
            if (cookie.startsWith(key + '=')) {
              const value = cookie.substring(key.length + 1);
              const data = JSON.parse(decodeURIComponent(value));
              if (data && data.distinct_id) return data.distinct_id;
            }
          }
        } catch (e) {}
      }

      // 5. Fallback scan cookies
      try {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
          cookie = cookie.trim();
          if (cookie.startsWith('mp_')) {
            const parts = cookie.split('=');
            if (parts.length > 1) {
              const data = JSON.parse(decodeURIComponent(parts[1]));
              if (data && data.distinct_id) return data.distinct_id;
            }
          }
        }
      } catch (e) {}
      return null;
    };

    // Determine and set device ID
    const updateDeviceId = () => {
      const mxId = getMixpanelId();
      if (mxId) {
        setDeviceId(mxId);
        localStorage.setItem('iwo_device_id', mxId);
        return true;
      }
      return false;
    };

    // 1. Initial attempt
    const found = updateDeviceId();
    
    // 2. Fallback to localStorage or generate if not found immediately
    if (!found) {
      const savedDeviceId = localStorage.getItem('iwo_device_id');
      if (savedDeviceId) {
        setDeviceId(savedDeviceId);
      } else {
        const newId = `DEVICE-${Math.floor(1000 + Math.random() * 9000)}`;
        localStorage.setItem('iwo_device_id', newId);
        setDeviceId(newId);
      }
    }

    // 3. Keep checking for Mixpanel in case it loads asynchronously
    let checks = 0;
    const interval = setInterval(() => {
      checks++;
      const updated = updateDeviceId();
      if (updated || checks > 10) {
        clearInterval(interval);
      }
    }, 500);

    // Cleanup stream connection and interval on unmount
    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleStartVerification = async (e) => {
    e.preventDefault();
    if (!firstName || !email || !phoneNo) {
      setError('Please fill in all fields.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    // 1. Construct payload
    const payload = {
      phoneNo: phoneNo.trim(),
      ipAddress: ipAddress.trim(),
      deviceId: deviceId.trim()
    };
    
    // 2. Base64 encoding (supporting unicode correctly)
    const jsonString = JSON.stringify(payload);
    const base64Token = btoa(unescape(encodeURIComponent(jsonString)));
    
    try {
      const response = await fetch(`${API_BASE_URL}/verification/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: base64Token
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      setSessionId(data.sessionId);
      setVerificationCode(data.verificationCode);
      setStep('verifying');
      setLoading(false);
      
      // 3. Connect to Stream reader
      connectToSSE(data.sessionId);
      
    } catch (err) {
      console.error(err);
      setError(`Failed to connect to backend server: ${err.message}. Make sure your backend API is running on ${API_BASE_URL}.`);
      setLoading(false);
    }
  };

  const connectToSSE = async (sessId) => {
    // Close existing connection if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setSseConnected(false);
    
    try {
      const url = `${API_BASE_URL}/verification/events/${sessId}`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/event-stream'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      setSseConnected(true);
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let buffer = '';
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          setSseConnected(false);
          break;
        }
        
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        // Perform case-insensitive checks for verification success keyword
        const upperBuffer = buffer.toUpperCase();
        if (upperBuffer.includes('SUCCESS') || upperBuffer.includes('VERIFIED')) {
          try {
            reader.cancel();
          } catch (e) {}
          
          controller.abort();
          setSseConnected(false);
          setStep('dashboard');
          break;
        }
        
        // Prevent buffer memory leak
        if (buffer.length > 5000) {
          buffer = buffer.slice(-1000);
        }
      }
      
    } catch (err) {
      if (err.name === 'AbortError') {
        // Stream aborted cleanly
      } else {
        console.error(err);
        setSseConnected(false);
      }
    }
  };

  const handleLogout = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setStep('form');
    setSessionId('');
    setVerificationCode('');
    setError('');
  };

  // WhatsApp Link Generation
  const getWhatsAppLink = () => {
    const text = `Hi , ${firstName} Thankyou for choosing IWO service Do not chnage the code. Verification Code: ${verificationCode}`;
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 md:p-8 select-none text-slate-800">
      <div className="w-full max-w-5xl">
        
        {/* STEP 1: FORM (Split Layout: Left SVG, Right Form) */}
        {step === 'form' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 border border-slate-100 rounded-3xl overflow-hidden bg-white">
            
            {/* Left Side: SVG Illustration & Welcome */}
            <div className="hidden lg:flex lg:col-span-6 bg-slate-50 flex-col items-center justify-center p-12 text-center border-r border-slate-100/80">
              <div className="max-w-md space-y-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 mb-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Inbound WhatsApp Onboarding</h2>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Verify your identity seamlessly using secure WhatsApp message loops. Fill in your contact info to receive your unique onboarding session token.
                </p>
                
                {/* Custom Tech Vector SVG */}
                <div className="py-4">
                  <svg className="w-full max-w-[280px] mx-auto text-indigo-600" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* Background elements */}
                    <circle cx="100" cy="100" r="80" fill="#f8fafc" />
                    <circle cx="100" cy="100" r="60" stroke="#f1f5f9" strokeWidth="2" />
                    <circle cx="100" cy="100" r="40" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="4 4" />
                    
                    {/* Outer nodes */}
                    <circle cx="60" cy="50" r="6" fill="#818cf8" />
                    <circle cx="150" cy="80" r="8" fill="#34d399" />
                    <circle cx="50" cy="130" r="5" fill="#a78bfa" />
                    <path d="M60 50 L100 100 M150 80 L100 100 M50 130 L100 100" stroke="#e2e8f0" strokeWidth="1.5" />
                    
                    {/* Device outline */}
                    <rect x="75" y="45" width="50" height="95" rx="8" fill="white" stroke="#64748b" strokeWidth="4" />
                    {/* Screen content */}
                    <rect x="80" y="55" width="40" height="70" rx="3" fill="#fafafa" />
                    {/* Phone button */}
                    <circle cx="100" cy="133" r="3" fill="#cbd5e1" />
                    {/* Speaker */}
                    <line x1="95" y1="49" x2="105" y2="49" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
                    
                    {/* WhatsApp bubble in screen */}
                    <rect x="85" y="65" width="30" height="18" rx="4" fill="#34d399" />
                    <path d="M107 83 L111 86 L111 81" fill="#34d399" />
                    <circle cx="95" cy="74" r="3" fill="white" />
                    <path d="M99 76.5 C101 76.5 103 75 103 74" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                    
                    {/* Outgoing API loop */}
                    <path d="M125 70 C145 70 155 100 128 115" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" />
                    <polygon points="126,111 127,116 132,114" fill="#818cf8" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Right Side: Form */}
            <div className="col-span-1 lg:col-span-6 p-8 md:p-12 flex flex-col justify-center bg-white">
              
              <div className="mb-8">
                <h3 className="text-xl font-extrabold text-slate-900 mb-1">Create Account</h3>
                <p className="text-sm text-slate-500">Enter your details to initiate WhatsApp authentication.</p>
              </div>

              {error && (
                <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-xs flex items-start gap-3">
                  <svg className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-semibold">Verification Connection Error</p>
                    <p className="opacity-90 mt-0.5">{error}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleStartVerification} className="space-y-5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">First Name</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Enter your name" 
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-200 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
                  <input 
                    type="email" 
                    required
                    placeholder="you@example.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-200 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">WhatsApp Phone Number</label>
                  <div className="relative">
                    <input 
                      type="tel" 
                      required
                      placeholder="e.g. 918181864070" 
                      value={phoneNo}
                      onChange={(e) => setPhoneNo(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-200 text-sm"
                    />
                    <p className="text-[10px] text-slate-400 mt-1.5 ml-1">
                      Include country code without + or spaces (e.g. 91 for India, 1 for USA)
                    </p>
                  </div>
                </div>

                {/* Developer Metadata / Advanced Inputs */}
                <div className="pt-2 border-t border-slate-100">
                  <details className="group">
                    <summary className="text-[11px] text-indigo-600/80 hover:text-indigo-600 cursor-pointer list-none flex items-center justify-between py-2">
                      <span className="font-semibold">Advanced / Metadata Token Fields</span>
                      <span className="transition-transform group-open:rotate-180">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                      </span>
                    </summary>
                    
                    <div className="space-y-4 pt-2 pb-1">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Detected IP Address</label>
                        <div className="bg-slate-50 border border-slate-200/60 rounded-lg px-3 py-1.5 text-xs text-slate-500 font-mono">
                          {ipAddress}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Device ID</label>
                        <div className="bg-slate-50 border border-slate-200/60 rounded-lg px-3 py-1.5 text-xs text-slate-500 font-mono">
                          {deviceId}
                        </div>
                      </div>
                    </div>
                  </details>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-none"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Starting Onboarding...</span>
                    </>
                  ) : (
                    <span>Register with WhatsApp</span>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* STEP 2: VERIFYING */}
        {step === 'verifying' && (
          <div className="w-full max-w-md mx-auto border border-slate-100 rounded-3xl p-8 bg-white flex flex-col items-center">
            <div className="text-center mb-6">
              <h2 className="text-xl font-extrabold text-slate-900 mb-2">Verify Your Account</h2>
              <p className="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">
                Scan the QR code or click the button below to send your verification message.
              </p>
            </div>

            {/* QR Code Container with Central Overlay Icon */}
            <div className="bg-white p-4 rounded-3xl flex flex-col items-center justify-center max-w-[200px] w-full mx-auto mb-6 border border-slate-100 shadow-sm relative group">
              <div className="relative w-36 h-36 flex items-center justify-center bg-white rounded-xl">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getWhatsAppLink())}`}
                  alt="Scan to open WhatsApp"
                  className="w-full h-full select-none rounded-lg"
                />
                
                {/* Center WhatsApp Icon Overlay */}
                <div className="absolute bg-white p-1 rounded-2xl shadow-md flex items-center justify-center border border-slate-50">
                  <div className="bg-emerald-500 p-1.5 rounded-xl flex items-center justify-center">
                    <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.455 5.703 1.456h.008c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase mt-3 tracking-wider">
                Scan with phone camera
              </span>
            </div>

            {/* Launch WhatsApp Button */}
            <div className="w-full space-y-4">
              <a 
                href={getWhatsAppLink()} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 px-4 rounded-xl transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2.5 text-center text-sm shadow-none"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.455 5.703 1.456h.008c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                <span>Or Open on WhatsApp Web</span>
              </a>

              {/* Waiting Status / Connection indicator */}
              <div className="flex flex-col items-center justify-center py-4 border-t border-slate-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="relative flex h-2.5 w-2.5">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${sseConnected ? 'bg-indigo-400' : 'bg-amber-400'}`}></span>
                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${sseConnected ? 'bg-indigo-500' : 'bg-amber-500'}`}></span>
                  </div>
                  <span className="text-xs font-semibold text-slate-600">
                    {sseConnected ? 'Waiting for message...' : 'Connecting to notification stream...'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 text-center max-w-xs leading-normal">
                  You will be logged in automatically as soon as your WhatsApp message is detected.
                </p>
              </div>

              {/* Cancel Button */}
              <div className="pt-4 border-t border-slate-100 flex justify-center">
                <button 
                  onClick={handleLogout}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Cancel & Go Back
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: DASHBOARD */}
        {step === 'dashboard' && (
          <div className="w-full max-w-md mx-auto border border-slate-100 rounded-3xl p-8 bg-white">
            {/* Header Success Icon */}
            <div className="flex items-center justify-center mb-6">
              <div className="w-14 h-14 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            <div className="text-center mb-6">
              <h2 className="text-2xl font-extrabold text-slate-900 mb-1">Welcome, {firstName}!</h2>
              <p className="text-sm text-slate-500">
                Your device has been verified and registered.
              </p>
            </div>

            {/* Dashboard stats & card */}
            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 mb-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Verification Status</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                  VERIFIED
                </span>
              </div>
              
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Name:</span>
                  <span className="text-slate-900 font-medium">{firstName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Email:</span>
                  <span className="text-slate-900 font-medium">{email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Phone Number:</span>
                  <span className="text-slate-900 font-medium font-mono">+{phoneNo}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">IP Address:</span>
                  <span className="text-slate-600 font-mono text-xs">{ipAddress}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Device ID:</span>
                  <span className="text-slate-600 font-mono text-xs">{deviceId}</span>
                </div>
                {sessionId && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Session ID:</span>
                    <span className="text-slate-400 font-mono text-[10px] truncate max-w-[180px]" title={sessionId}>{sessionId}</span>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm shadow-none"
            >
              <span>Logout & Reset</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;

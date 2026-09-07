import React, { useMemo, useState } from 'react';
import { Delete, Lock } from 'lucide-react';

const PIN = '2009';
const STORAGE_KEY = 'evault.pin.ok';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

interface PinGateProps {
  children: React.ReactNode;
}

const PinGate: React.FC<PinGateProps> = ({ children }) => {
  const alreadyOk = useMemo(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }, []);

  const [unlocked, setUnlocked] = useState(alreadyOk);
  const [digits, setDigits] = useState('');
  const [error, setError] = useState(false);

  const submit = (value: string) => {
    if (value === PIN) {
      try {
        sessionStorage.setItem(STORAGE_KEY, '1');
      } catch {
        /* ignore quota / private mode */
      }
      setUnlocked(true);
      return;
    }
    setError(true);
    setTimeout(() => {
      setDigits('');
      setError(false);
    }, 420);
  };

  const onKey = (key: string) => {
    if (key === '' || error) return;
    if (key === 'del') {
      setDigits((prev) => prev.slice(0, -1));
      return;
    }
    const next = (digits + key).slice(0, 4);
    setDigits(next);
    if (next.length === 4) submit(next);
  };

  if (unlocked) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#0B1220] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-[22px] bg-white/10 border border-white/10 flex items-center justify-center mb-5">
            <Lock size={26} className="text-sky-300" />
          </div>
          <p className="text-[10px] font-bold tracking-[0.35em] text-sky-300/80 uppercase">id.evault.org</p>
          <h1 className="text-3xl font-bold tracking-tight mt-2">eVault Leads</h1>
          <p className="text-sm text-white/50 mt-2">Introduza o PIN para continuar</p>
        </div>

        <div className={`flex justify-center gap-3 mb-8 ${error ? 'animate-pulse' : ''}`}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`w-3.5 h-3.5 rounded-full border transition-colors ${
                error
                  ? 'bg-rose-500 border-rose-400'
                  : digits.length > i
                    ? 'bg-sky-300 border-sky-200'
                    : 'bg-transparent border-white/25'
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((key, index) => {
            if (key === '') return <span key={`empty-${index}`} />;
            const isDel = key === 'del';
            return (
              <button
                key={key}
                type="button"
                onClick={() => onKey(key)}
                className="h-16 rounded-2xl bg-white/8 border border-white/8 text-2xl font-semibold active:scale-95 transition-transform flex items-center justify-center"
              >
                {isDel ? <Delete size={22} className="text-white/60" /> : key}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PinGate;

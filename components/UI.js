'use client';
import { useEffect, useState } from 'react';
import { hhmm } from '@/lib/format';

export function Header({ titulo, sub, children }) {
  const [hora, setHora] = useState('');
  useEffect(() => {
    setHora(hhmm(Date.now()));
    const iv = setInterval(() => setHora(hhmm(Date.now())), 10000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="top">
      <div>
        <h1>{titulo}</h1>
        <div className="sub">{sub}</div>
      </div>
      <div className="sp" />
      {children}
      <span className="clock">{hora}</span>
    </div>
  );
}

export const Kpi = ({ l, v, d }) => (
  <div className="kpi">
    <div className="l">{l}</div>
    <div className="v">{v}</div>
    <div className="d mute">{d || ' '}</div>
  </div>
);

export const Canal = ({ c }) => <span className={'chip c-' + c}>{c}</span>;

export function Modal({ titulo, children, onClose }) {
  return (
    <div className="modal" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="box">
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

'use client';
import { useState } from 'react';
import { Modal } from '@/components/UI';
import { bs } from '@/lib/format';

// Modificadores que aplican a un producto (los de su categoría + los generales)
export const extrasPara = (producto, modifiers) =>
  (modifiers || []).filter(m => m.activo && (!m.categoria || m.categoria === producto.categoria));

// Clave única de una línea del carrito: mismo producto con distintos extras = líneas distintas
export const claveLinea = (id, extras = [], nota = '') => id + '|' + [...extras].sort((a, b) => a - b).join(',') + '|' + (nota || '');

// Precio unitario de una línea (producto + extras)
export const precioLinea = (producto, extras, modifiers) =>
  Number(producto.precio) + (extras || []).reduce((s, id) => s + Number((modifiers.find(m => m.id === id) || {}).precio || 0), 0);

export const nombresExtras = (extras, modifiers) =>
  (extras || []).map(id => (modifiers.find(m => m.id === id) || {}).nombre).filter(Boolean).join(', ');

/**
 * Ventana para elegir borde, extras y "sin ..." de un producto.
 * onOk({ extras: [ids], nota })
 */
export function ElegirExtras({ producto, modifiers, onOk, onClose }) {
  const opciones = extrasPara(producto, modifiers);
  const [sel, setSel] = useState([]);
  const [nota, setNota] = useState('');
  const grupos = [...new Set(opciones.map(m => m.grupo))];
  // En el grupo "Borde" solo se puede elegir uno
  const unico = g => /borde|tamaño|masa/i.test(g);
  const toggle = m => setSel(s => {
    if (s.includes(m.id)) return s.filter(x => x !== m.id);
    const sinMismoGrupo = unico(m.grupo) ? s.filter(x => (opciones.find(o => o.id === x) || {}).grupo !== m.grupo) : s;
    return [...sinMismoGrupo, m.id];
  });
  const total = precioLinea(producto, sel, opciones);

  return (
    <Modal titulo={producto.nombre} onClose={onClose}>
      <div className="mods">
        {grupos.map(g => (
          <div key={g}>
            <h4>{g}{unico(g) ? ' (elige uno)' : ''}</h4>
            {opciones.filter(m => m.grupo === g).map(m => (
              <label key={m.id} className={'opc' + (sel.includes(m.id) ? ' on' : '')}>
                <input type="checkbox" checked={sel.includes(m.id)} onChange={() => toggle(m)} />
                <span>{m.nombre}</span>
                <b>{Number(m.precio) > 0 ? '+' + bs(m.precio) : ''}</b>
              </label>
            ))}
          </div>
        ))}
        <h4>Nota para cocina</h4>
        <input className="inp" placeholder="Ej. bien cocida, cortar en 12" value={nota} onChange={e => setNota(e.target.value)} />
      </div>
      <div className="bigtot" style={{ fontSize: 16 }}><span>Precio</span><span>{bs(total)}</span></div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn pri" onClick={() => onOk({ extras: sel, nota: nota.trim() })}>Agregar</button>
      </div>
    </Modal>
  );
}

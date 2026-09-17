import { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';

interface Stroke {
  x0: number; y0: number; x1: number; y1: number; color: string;
}

interface Props {
  socket: Socket;
  roomCode: string;
}

export default function Whiteboard({ socket, roomCode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState('#4d7cfe');

  function getCtx() {
    return canvasRef.current?.getContext('2d') || null;
  }

  function drawLine(stroke: Stroke) {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.x0, stroke.y0);
    ctx.lineTo(stroke.x1, stroke.y1);
    ctx.stroke();
  }

  useEffect(() => {
    socket.on('whiteboard-draw', (stroke: Stroke) => drawLine(stroke));
    socket.on('whiteboard-clear', () => clearCanvas(false));
    return () => {
      socket.off('whiteboard-draw');
      socket.off('whiteboard-clear');
    };
  }, [socket]);

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const rect = canvasRef.current!.getBoundingClientRect();
    lastPoint.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !lastPoint.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x1 = e.clientX - rect.left;
    const y1 = e.clientY - rect.top;
    const stroke: Stroke = { x0: lastPoint.current.x, y0: lastPoint.current.y, x1, y1, color };
    drawLine(stroke);
    socket.emit('whiteboard-draw', { roomCode, stroke });
    lastPoint.current = { x: x1, y: y1 };
  }

  function handlePointerUp() {
    drawing.current = false;
    lastPoint.current = null;
  }

  function clearCanvas(broadcast = true) {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (broadcast) socket.emit('whiteboard-clear', { roomCode });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="whiteboard-toolbar">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <button className="btn secondary" onClick={() => clearCanvas(true)}>Clear</button>
      </div>
      <canvas
        ref={canvasRef}
        width={600}
        height={420}
        style={{ background: 'white', borderRadius: 6, touchAction: 'none', width: '100%' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  );
}

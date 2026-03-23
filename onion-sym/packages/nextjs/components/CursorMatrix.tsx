"use client";

import { useCallback, useEffect, useRef } from "react";

type Digit = { x: number; y: number; char: string; opacity: number; born: number };

export const CursorMatrix = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const digits = useRef<Digit[]>([]);
  const mouse = useRef({ x: -1000, y: -1000 });
  const raf = useRef<number>(0);

  const spawn = useCallback((mx: number, my: number) => {
    const now = Date.now();
    // Spawn a few digits scattered around cursor
    for (let i = 0; i < 3; i++) {
      digits.current.push({
        x: mx + (Math.random() - 0.5) * 60,
        y: my + (Math.random() - 0.5) * 60,
        char: Math.random() < 0.5 ? String(Math.floor(Math.random() * 10)) : String.fromCharCode(0x30a0 + Math.floor(Math.random() * 96)),
        opacity: 0.25 + Math.random() * 0.15,
        born: now,
      });
    }
    // Cap total digits
    if (digits.current.length > 300) {
      digits.current = digits.current.slice(-200);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = document.documentElement.scrollHeight;
    };
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(document.documentElement);

    let lastSpawn = 0;
    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.pageX, y: e.pageY };
      const now = Date.now();
      if (now - lastSpawn > 40) {
        spawn(e.pageX, e.pageY);
        lastSpawn = now;
      }
    };
    window.addEventListener("mousemove", onMove);

    const draw = () => {
      const now = Date.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      digits.current = digits.current.filter(d => {
        const age = now - d.born;
        if (age > 2000) return false;

        const fade = age < 200 ? age / 200 : age > 1500 ? 1 - (age - 1500) / 500 : 1;
        ctx.font = "14px monospace";
        ctx.fillStyle = `rgba(0, 255, 136, ${d.opacity * fade})`;
        ctx.fillText(d.char, d.x, d.y);
        // Slow drift downward
        d.y += 0.3;
        return true;
      });

      raf.current = requestAnimationFrame(draw);
    };
    raf.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("mousemove", onMove);
      resizeObserver.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, [spawn]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ opacity: 1 }}
    />
  );
};

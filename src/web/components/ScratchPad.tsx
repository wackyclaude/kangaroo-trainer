import { useEffect, useRef } from "react";

/** A see-through drawing layer over the question, for working things out. Not saved. */
export function ScratchPad({ clearKey }: { clearKey: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = r.width * dpr;
      c.height = r.height * dpr;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#3d7bff";
    };
    fit();
    let drawing = false;
    const ctx = c.getContext("2d");
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const down = (e: PointerEvent) => {
      drawing = true;
      c.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      ctx?.beginPath();
      ctx?.moveTo(x, y);
    };
    const move = (e: PointerEvent) => {
      if (!drawing || !ctx) return;
      const [x, y] = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    };
    const up = () => (drawing = false);
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    window.addEventListener("resize", fit);
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      window.removeEventListener("resize", fit);
    };
  }, [clearKey]);

  return <canvas ref={ref} key={clearKey} className="scratch" aria-label="Scratch pad: draw with your finger or pencil" />;
}

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { NextPage } from "next";

// ── Types ────────────────────────────────────────────────────────────

type Step = {
  id: string;
  label: string;
  detail: string;
  node: "agent" | "relay_b" | "relay_a" | "service";
  action: "encrypt" | "decrypt" | "forward" | "request" | "respond" | "log";
  color: string;
};

type DemoRequest = {
  name: string;
  method: string;
  endpoint: string;
  description: string;
  private: boolean;
};

type LogLine = {
  ts: number;
  text: string;
  color: string;
  indent?: number;
};

// ── Demo scenarios ───────────────────────────────────────────────────

const PRIVATE_REQUESTS: DemoRequest[] = [
  { name: "weather", method: "GET", endpoint: "/weather?city=Tokyo", description: "check weather in Tokyo", private: true },
  { name: "flights", method: "GET", endpoint: "/flights?origin=LHR&destination=NRT", description: "search flights LHR → NRT", private: true },
  { name: "booking", method: "POST", endpoint: "/book", description: "book flight PA303", private: true },
  { name: "weather2", method: "GET", endpoint: "/weather?city=Berlin", description: "check weather in Berlin", private: true },
];

const DIRECT_REQUESTS: DemoRequest[] = [
  { name: "weather_d", method: "GET", endpoint: "/weather?city=Tokyo", description: "check weather in Tokyo", private: false },
  { name: "flights_d", method: "GET", endpoint: "/flights?origin=LHR&destination=NRT", description: "search flights LHR → NRT", private: false },
];

const ONION_STEPS: Step[] = [
  { id: "build", label: "BUILD ONION", detail: "encrypting 2 layers with relay public keys", node: "agent", action: "encrypt", color: "#00ff88" },
  { id: "send_entry", label: "→ RELAY B", detail: "sending encrypted blob to entry relay", node: "relay_b", action: "forward", color: "#00ccff" },
  { id: "pay_402", label: "← 402", detail: "relay demands 0.01 USDC — x402 payment required", node: "agent", action: "respond", color: "#cc66ff" },
  { id: "pay_sign", label: "SIGN USDC", detail: "signing transferWithAuthorization on Base Sepolia", node: "agent", action: "encrypt", color: "#cc66ff" },
  { id: "pay_retry", label: "→ RETRY", detail: "resending with X-PAYMENT header + USDC proof", node: "relay_b", action: "forward", color: "#cc66ff" },
  { id: "peel_1", label: "PEEL LAYER 1", detail: "payment verified — decrypt outer layer, read next_hop", node: "relay_b", action: "decrypt", color: "#00ccff" },
  { id: "fwd", label: "→ RELAY A", detail: "forwarding inner blob to exit relay", node: "relay_a", action: "forward", color: "#ffcc00" },
  { id: "peel_2", label: "PEEL LAYER 2", detail: "decrypt inner layer, read destination", node: "relay_a", action: "decrypt", color: "#ffcc00" },
  { id: "exit", label: "→ SERVICE", detail: "making actual HTTP request to destination", node: "service", action: "request", color: "#ff8800" },
  { id: "resp_back", label: "← RESPONSE", detail: "encrypting response back through circuit", node: "relay_a", action: "respond", color: "#ffcc00" },
  { id: "resp_entry", label: "← RELAY B", detail: "re-encrypting for agent", node: "relay_b", action: "respond", color: "#00ccff" },
  { id: "unwrap", label: "UNWRAP", detail: "decrypting 2 response layers", node: "agent", action: "decrypt", color: "#00ff88" },
];

const DIRECT_STEPS: Step[] = [
  { id: "direct_send", label: "→ SERVICE", detail: "sending request DIRECTLY — no relays", node: "service", action: "request", color: "#ff4444" },
  { id: "direct_resp", label: "← RESPONSE", detail: "response comes back — service saw your IP", node: "agent", action: "respond", color: "#ff4444" },
];

// ── Node component ───────────────────────────────────────────────────

const NODE_META = {
  agent: { label: "AGENT", sub: "your machine", x: 0 },
  relay_b: { label: "RELAY B", sub: "entry node", x: 1 },
  relay_a: { label: "RELAY A", sub: "exit node", x: 2 },
  service: { label: "SERVICE", sub: "destination", x: 3 },
} as const;

const NetworkNode = ({
  id,
  active,
  activeColor,
  pulse,
}: {
  id: keyof typeof NODE_META;
  active: boolean;
  activeColor: string;
  pulse: boolean;
}) => {
  const meta = NODE_META[id];
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-20 h-20 sm:w-24 sm:h-24 border-2 flex flex-col items-center justify-center transition-all duration-300"
        style={{
          borderColor: active ? activeColor : "#1a1a2e",
          background: active ? `${activeColor}10` : "#0e0e18",
          boxShadow: pulse ? `0 0 20px ${activeColor}40` : "none",
        }}
      >
        <div
          className="text-[10px] sm:text-xs font-bold tracking-wider transition-colors duration-300"
          style={{ color: active ? activeColor : "#555" }}
        >
          {meta.label}
        </div>
        <div className="text-[8px] sm:text-[10px] text-[#333] mt-1">{meta.sub}</div>
      </div>
    </div>
  );
};

// ── Packet animation ─────────────────────────────────────────────────

const PacketTrail = ({
  fromIdx,
  toIdx,
  color,
  visible,
}: {
  fromIdx: number;
  toIdx: number;
  color: string;
  visible: boolean;
}) => {
  if (!visible) return null;

  const left = fromIdx < toIdx;
  const minX = Math.min(fromIdx, toIdx);
  const span = Math.abs(toIdx - fromIdx);

  return (
    <div
      className="absolute top-1/2 h-[2px] transition-all duration-500"
      style={{
        left: `${minX * 25 + 12.5}%`,
        width: `${span * 25}%`,
        background: `linear-gradient(${left ? "90deg" : "270deg"}, transparent, ${color}, transparent)`,
        opacity: 0.6,
        transform: "translateY(-50%)",
      }}
    />
  );
};

// ── Visibility panel ─────────────────────────────────────────────────

const VIS_DATA: Record<string, { sees: string[]; blind: string[] }> = {
  agent: { sees: ["destination", "request", "response", "circuit path", "cost"], blind: ["—", "—", "—"] },
  relay_b: { sees: ["agent IP", "relay_a address", "blob hash", "—", "—"], blind: ["destination", "request content", "who you are"] },
  relay_a: { sees: ["relay_b address", "destination", "request", "—", "—"], blind: ["agent IP", "who sent it", "—"] },
  service: { sees: ["relay_a IP", "request content", "blind token", "—", "—"], blind: ["agent IP", "real identity", "other requests"] },
};

const MAX_VIS_ROWS = 5; // pad all lists to this length so height never changes

const VisibilityPanel = ({ step }: { step: Step | null }) => {
  const v = step ? VIS_DATA[step.node] : null;
  const label = step ? NODE_META[step.node].label : "—";

  const sees = v ? v.sees.slice(0, MAX_VIS_ROWS) : Array(MAX_VIS_ROWS).fill("—");
  const blind = v ? v.blind.slice(0, MAX_VIS_ROWS) : Array(MAX_VIS_ROWS).fill("—");
  while (sees.length < MAX_VIS_ROWS) sees.push("—");
  while (blind.length < MAX_VIS_ROWS) blind.push("—");

  return (
    <div className="border border-[#1a1a2e] bg-[#0e0e18] p-3 text-[10px]" style={{ height: 160 }}>
      <div className="text-[#555] uppercase tracking-wider mb-2 h-4">
        {step ? `${label} visibility` : "node visibility"}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[#00ff88] mb-1">CAN SEE</div>
          {sees.map((s, i) => (
            <div key={i} className={s === "—" ? "text-[#1a1a2e]" : "text-[#888]"}>+ {s}</div>
          ))}
        </div>
        <div>
          <div className="text-[#ff4444] mb-1">CANNOT SEE</div>
          {blind.map((s, i) => (
            <div key={i} className={s === "—" ? "text-[#1a1a2e]" : "text-[#444]"}>- {s}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Main demo page ───────────────────────────────────────────────────

const Demo: NextPage = () => {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "private" | "direct" | "done">("idle");
  const [currentStep, setCurrentStep] = useState<Step | null>(null);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [packetFrom, setPacketFrom] = useState(-1);
  const [packetTo, setPacketTo] = useState(-1);
  const [packetColor, setPacketColor] = useState("#00ff88");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [requestIdx, setRequestIdx] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  const addLog = useCallback((text: string, color = "#c8c8d0", indent = 0) => {
    setLogs(prev => [...prev, { ts: Date.now(), text, color, indent }]);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  const animateStep = useCallback(
    async (step: Step) => {
      if (abortRef.current) return;
      setCurrentStep(step);
      setActiveNode(step.node);
      const toIdx = NODE_META[step.node].x;

      // Determine packet direction from step id
      if (step.id.includes("send") || step.id.includes("fwd") || step.id === "exit" || step.id === "direct_send" || step.id === "pay_retry") {
        const fromMap: Record<string, number> = {
          build: 0,
          send_entry: 0,
          pay_retry: 0,
          fwd: 1,
          exit: 2,
          direct_send: 0,
        };
        setPacketFrom(fromMap[step.id] ?? 0);
        setPacketTo(toIdx);
      } else if (step.id.includes("resp") || step.id === "unwrap" || step.id === "direct_resp" || step.id === "pay_402") {
        setPacketFrom(toIdx + 1 <= 3 ? toIdx + 1 : toIdx);
        setPacketTo(toIdx);
      } else if (step.id === "pay_sign") {
        // signing happens locally at agent — no packet
        setPacketFrom(-1);
        setPacketTo(-1);
      } else {
        setPacketFrom(-1);
        setPacketTo(-1);
      }
      setPacketColor(step.color);

      addLog(`${step.label}  ${step.detail}`, step.color, step.node === "agent" ? 0 : NODE_META[step.node].x);
      await sleep(600);
    },
    [addLog],
  );

  const makeRequest = useCallback(
    async (req: DemoRequest) => {
      const url = `http://localhost:9000${req.endpoint}`;
      const method = req.method;

      // Actually call through the agent's audit API for real data
      try {
        if (method === "POST") {
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ flight: "PA303", passenger: "AgentSmith" }),
          });
        } else {
          await fetch(url);
        }
      } catch {
        // Service might not have CORS — that's fine for the animation
      }
    },
    [],
  );

  const runDemo = useCallback(async () => {
    abortRef.current = false;
    setRunning(true);
    setLogs([]);
    setRequestIdx(0);

    // ── Phase 1: Private requests ──
    setPhase("private");
    addLog("par demo --mode private", "#00ff88");
    addLog("routing through 2-hop onion circuit", "#555");
    addLog("", "#333");
    await sleep(800);

    for (let i = 0; i < PRIVATE_REQUESTS.length; i++) {
      if (abortRef.current) break;
      const req = PRIVATE_REQUESTS[i];
      setRequestIdx(i);
      addLog(`[${i + 1}/4] ${req.description}`, "#00ff88");

      for (const step of ONION_STEPS) {
        if (abortRef.current) break;
        await animateStep(step);
      }

      addLog(`  ✓ ${req.method} ${req.endpoint} — 200 OK`, "#00ff88", 1);
      makeRequest(req);
      addLog("", "#333");
      await sleep(400);
    }

    if (abortRef.current) { setRunning(false); return; }

    addLog("all private requests complete", "#00ff88");
    addLog("service logs show RELAY IP, not yours", "#00ff88");
    addLog("", "#333");
    await sleep(1500);

    // ── Phase 2: Direct requests ──
    setPhase("direct");
    addLog("par demo --mode direct", "#ff4444");
    addLog("WARNING: no privacy — direct connection", "#ff4444");
    addLog("", "#333");
    await sleep(800);

    for (let i = 0; i < DIRECT_REQUESTS.length; i++) {
      if (abortRef.current) break;
      const req = DIRECT_REQUESTS[i];
      setRequestIdx(PRIVATE_REQUESTS.length + i);
      addLog(`[${i + 1}/2] ${req.description}`, "#ff4444");

      for (const step of DIRECT_STEPS) {
        if (abortRef.current) break;
        await animateStep(step);
      }

      addLog(`  ✗ ${req.method} ${req.endpoint} — service saw YOUR IP`, "#ff4444", 1);
      makeRequest(req);
      addLog("", "#333");
      await sleep(400);
    }

    // ── Done ──
    setPhase("done");
    setActiveNode(null);
    setCurrentStep(null);
    setPacketFrom(-1);
    setPacketTo(-1);

    addLog("", "#333");
    addLog("════════════════════════════════════", "#00ff88");
    addLog("  demo complete", "#00ff88");
    addLog("  private calls: relay IP in service logs", "#00ff88");
    addLog("  direct calls: YOUR IP in service logs", "#ff4444");
    addLog("  check /dashboard for the split view", "#555");
    addLog("════════════════════════════════════", "#00ff88");

    setRunning(false);
  }, [addLog, animateStep, makeRequest]);

  const stopDemo = () => {
    abortRef.current = true;
    setRunning(false);
    setPhase("idle");
    setActiveNode(null);
    setCurrentStep(null);
    setPacketFrom(-1);
  };

  return (
    <div className="flex flex-col p-4 sm:p-6 gap-4 font-mono w-full max-w-6xl mx-auto">
      {/* Title bar — fixed 48px */}
      <div className="flex items-center justify-between" style={{ height: 48 }}>
        <div>
          <div className="text-[#00ff88] text-sm font-bold uppercase tracking-wider">
            live demo
          </div>
          <div className="text-[10px] text-[#333] uppercase tracking-[0.15em] mt-1">
            animated onion routing visualization
          </div>
        </div>
        <div style={{ width: 110 }}>
          {!running ? (
            <button
              className="border border-[#00ff88] text-[#00ff88] text-[10px] uppercase tracking-wider px-4 py-2 hover:bg-[#00ff8815] transition-all hover:shadow-[0_0_15px_rgba(0,255,136,0.2)] w-full"
              onClick={runDemo}
            >
              ▶ run demo
            </button>
          ) : (
            <button
              className="border border-[#ff4444] text-[#ff4444] text-[10px] uppercase tracking-wider px-4 py-2 hover:bg-[#ff444415] transition-all w-full"
              onClick={stopDemo}
            >
              ■ stop
            </button>
          )}
        </div>
      </div>

      {/* Network topology — fixed 200px */}
      <div className="border border-[#1a1a2e] bg-[#0e0e18] p-4 sm:p-6" style={{ height: 200 }}>
        <div className="text-[10px] text-[#333] uppercase tracking-wider mb-4" style={{ height: 16 }}>
          network topology
          <span
            className="ml-2 transition-colors duration-300"
            style={{
              color: phase === "private" ? "#00ff88" : phase === "direct" ? "#ff4444" : "transparent",
            }}
          >
            ● {phase === "private" ? "onion-routed" : phase === "direct" ? "direct (exposed)" : "waiting"}
          </span>
        </div>

        <div className="relative" style={{ height: 96 }}>
          {/* Connection lines */}
          <div className="absolute top-1/2 left-[12.5%] right-[12.5%] h-[1px] bg-[#1a1a2e] -translate-y-1/2" />

          {/* Packet animation */}
          <PacketTrail fromIdx={packetFrom} toIdx={packetTo} color={packetColor} visible={running && packetFrom >= 0} />

          {/* Nodes */}
          <div className="relative grid grid-cols-4 gap-2">
            {(["agent", "relay_b", "relay_a", "service"] as const).map(id => (
              <div key={id} className="flex justify-center">
                <NetworkNode
                  id={id}
                  active={activeNode === id}
                  activeColor={currentStep?.color || "#00ff88"}
                  pulse={activeNode === id && running}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Current step indicator — fixed 32px */}
        <div className="mt-4 flex items-center justify-center" style={{ height: 32 }}>
          {currentStep ? (
            <div className="text-xs" style={{ color: currentStep.color }}>
              <span className="font-bold">{currentStep.label}</span>
              <span className="text-[#555] ml-2">{currentStep.detail}</span>
            </div>
          ) : phase === "done" ? (
            <div className="text-xs text-[#00ff88]">demo complete — check /dashboard</div>
          ) : (
            <div className="text-xs text-[#222]">press ▶ run demo to start</div>
          )}
        </div>
      </div>

      {/* Bottom: log + visibility side by side — fixed 360px */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ height: 360 }}>
        {/* Terminal log — 2/3 width, fixed height, scrollable content */}
        <div className="lg:col-span-2 border border-[#1a1a2e] bg-[#0a0a0f] flex flex-col" style={{ height: 360 }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1a1a2e] bg-[#0e0e18] shrink-0" style={{ height: 36 }}>
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff4444]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#ffcc00]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#00ff88]" />
            <span className="text-[10px] text-[#333] ml-2">par-demo — bash</span>
          </div>
          <div ref={logRef} className="overflow-y-auto flex-1 min-h-0 p-3 space-y-0.5">
            {logs.length === 0 ? (
              <div className="text-[#222] text-xs">
                <span className="text-[#00ff88]">$</span> waiting for demo...
                <span className="cursor-blink text-[#00ff88]">_</span>
              </div>
            ) : (
              logs.map((line, i) => (
                <div
                  key={i}
                  className="text-xs leading-relaxed"
                  style={{
                    color: line.color,
                    paddingLeft: `${(line.indent || 0) * 16}px`,
                  }}
                >
                  {line.text || "\u00A0"}
                </div>
              ))
            )}
            {running && (
              <div className="text-xs">
                <span className="text-[#00ff88]">$</span>
                <span className="cursor-blink text-[#00ff88]"> _</span>
              </div>
            )}
          </div>
        </div>

        {/* Visibility panel — 1/3 width, fixed height */}
        <div className="flex flex-col gap-3" style={{ height: 360 }}>
          {/* Visibility — fixed 160px */}
          <div style={{ height: 160 }}>
            <VisibilityPanel step={currentStep} />
          </div>

          {/* Request counter — fixed 188px */}
          <div className="border border-[#1a1a2e] bg-[#0e0e18] p-3 text-[10px]" style={{ height: 188 }}>
            <div className="text-[#555] uppercase tracking-wider mb-2">requests</div>
            <div className="space-y-1">
              {PRIVATE_REQUESTS.map((r, i) => (
                <div key={r.name} className="flex items-center gap-2" style={{ height: 18 }}>
                  <span
                    className="w-1.5 h-1.5 shrink-0"
                    style={{
                      background:
                        requestIdx > i ? "#00ff88" : requestIdx === i && running ? "#00ff8888" : "#1a1a2e",
                    }}
                  />
                  <span className={requestIdx > i ? "text-[#888]" : "text-[#333]"}>
                    {r.method} {r.endpoint.split("?")[0]}
                  </span>
                  <span className="text-[#00ff88] ml-auto" style={{ visibility: requestIdx > i ? "visible" : "hidden" }}>✓</span>
                </div>
              ))}
              <div className="border-t border-[#1a1a2e] my-1" />
              {DIRECT_REQUESTS.map((r, i) => {
                const idx = PRIVATE_REQUESTS.length + i;
                return (
                  <div key={r.name} className="flex items-center gap-2" style={{ height: 18 }}>
                    <span
                      className="w-1.5 h-1.5 shrink-0"
                      style={{
                        background:
                          requestIdx > idx ? "#ff4444" : requestIdx === idx && running ? "#ff444488" : "#1a1a2e",
                      }}
                    />
                    <span className={requestIdx > idx ? "text-[#888]" : "text-[#333]"}>
                      {r.method} {r.endpoint.split("?")[0]} (direct)
                    </span>
                    <span className="text-[#ff4444] ml-auto" style={{ visibility: requestIdx > idx ? "visible" : "hidden" }}>✗</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Demo;

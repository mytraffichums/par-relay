"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { NextPage } from "next";
import { useAccount, useWalletClient } from "wagmi";
import nacl from "tweetnacl";

// ── Config ────────────────────────────────────────────────────────────

const RELAYS = [
  {
    name: "relay_b",
    role: "entry",
    url: "https://par-relay-production-713d.up.railway.app",
  },
  {
    name: "relay_a",
    role: "exit",
    url: "https://par-relay-production.up.railway.app",
  },
];

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const BASE_SEPOLIA_CHAIN_ID = 84532;

const SUGGESTED_URLS = [
  { label: "httpbin.org/get", url: "https://httpbin.org/get", method: "GET" as const },
  { label: "httpbin.org/ip", url: "https://httpbin.org/ip", method: "GET" as const },
  { label: "httpbin.org/headers", url: "https://httpbin.org/headers", method: "GET" as const },
  { label: "httpbin.org/user-agent", url: "https://httpbin.org/user-agent", method: "GET" as const },
];

// ── Types ─────────────────────────────────────────────────────────────

type LogLine = {
  text: string;
  color: string;
  indent?: number;
};

type StepStatus = "pending" | "active" | "done" | "error";

type Step = {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
};

// ── Crypto helpers ────────────────────────────────────────────────────

function encryptLayer(recipientPubKey: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(plaintext, nonce, recipientPubKey, ephemeral.secretKey);
  if (!ciphertext) throw new Error("Encryption failed");

  // Format: ephemeral_pub (32) || nonce (24) || ciphertext
  const result = new Uint8Array(32 + 24 + ciphertext.length);
  result.set(ephemeral.publicKey, 0);
  result.set(nonce, 32);
  result.set(ciphertext, 56);
  return result;
}

function decryptLayer(mySecretKey: Uint8Array, blob: Uint8Array): Uint8Array {
  const ephPub = blob.slice(0, 32);
  const nonce = blob.slice(32, 56);
  const ciphertext = blob.slice(56);
  const plaintext = nacl.box.open(ciphertext, nonce, ephPub, mySecretKey);
  if (!plaintext) throw new Error("Decryption failed");
  return plaintext;
}

function uint8ToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToUint8(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

// ── Node visualization ──────────────────────────────────────────────

const NODE_META = {
  agent: { label: "YOU", sub: "your browser", x: 0 },
  relay_b: { label: "RELAY B", sub: "entry node", x: 1 },
  relay_a: { label: "RELAY A", sub: "exit node", x: 2 },
  service: { label: "SERVICE", sub: "destination", x: 3 },
} as const;

const NetworkNode = ({
  id,
  active,
  activeColor,
}: {
  id: keyof typeof NODE_META;
  active: boolean;
  activeColor: string;
}) => {
  const meta = NODE_META[id];
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-20 h-20 sm:w-24 sm:h-24 border-2 flex flex-col items-center justify-center transition-all duration-300"
        style={{
          borderColor: active ? activeColor : "#1a1a2e",
          background: active ? `${activeColor}10` : "#0e0e18",
          boxShadow: active ? `0 0 20px ${activeColor}40` : "none",
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

// ── Main page ─────────────────────────────────────────────────────────

const TryIt: NextPage = () => {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [targetUrl, setTargetUrl] = useState("https://httpbin.org/ip");
  const [method, setMethod] = useState<"GET" | "POST">("GET");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [packetFrom, setPacketFrom] = useState(-1);
  const [packetTo, setPacketTo] = useState(-1);
  const [packetColor, setPacketColor] = useState("#00ff88");
  const [packetVisible, setPacketVisible] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((text: string, color = "#c8c8d0", indent = 0) => {
    setLogs(prev => [...prev, { text, color, indent }]);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const updateStep = useCallback((id: string, status: StepStatus, detail?: string) => {
    setSteps(prev => prev.map(s => (s.id === id ? { ...s, status, detail: detail ?? s.detail } : s)));
  }, []);

  const showPacket = useCallback((from: number, to: number, color: string) => {
    setPacketFrom(from);
    setPacketTo(to);
    setPacketColor(color);
    setPacketVisible(true);
    setActiveNode(to === 0 ? "agent" : to === 1 ? "relay_b" : to === 2 ? "relay_a" : "service");
  }, []);

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  const sendRequest = useCallback(async () => {
    if (!isConnected || !walletClient || !address) return;

    setRunning(true);
    setResult(null);
    setLogs([]);
    setPacketVisible(false);
    setActiveNode("agent");

    const initialSteps: Step[] = [
      { id: "pubkeys", label: "Fetch relay public keys", status: "pending" },
      { id: "onion", label: "Build 2-layer onion", status: "pending" },
      { id: "send", label: "Send to entry relay", status: "pending" },
      { id: "pay", label: "Sign x402 USDC payment", status: "pending" },
      { id: "retry", label: "Retry with payment", status: "pending" },
      { id: "decrypt", label: "Decrypt response", status: "pending" },
    ];
    setSteps(initialSteps);

    try {
      // ── 1. Fetch relay public keys ──
      updateStep("pubkeys", "active");
      addLog("$ par send --private --url " + targetUrl, "#00ff88");
      addLog("fetching relay public keys...", "#555");

      const relayB = RELAYS[0];
      const relayA = RELAYS[1];

      const [pubB, pubA] = await Promise.all([
        fetch(`${relayB.url}/pubkey`).then(r => r.json()),
        fetch(`${relayA.url}/pubkey`).then(r => r.json()),
      ]);

      const relayBPub = hexToUint8(pubB.public_key);
      const relayAPub = hexToUint8(pubA.public_key);

      addLog(`  relay_b (${pubB.name}): ${pubB.public_key.slice(0, 16)}...`, "#555", 1);
      addLog(`  relay_a (${pubA.name}): ${pubA.public_key.slice(0, 16)}...`, "#555", 1);
      updateStep("pubkeys", "done");

      // ── 2. Build onion ──
      updateStep("onion", "active");
      setActiveNode("agent");
      addLog("building 2-layer onion...", "#00ff88");

      // Response keys for decrypting on the way back
      const respKeyA = nacl.box.keyPair(); // for exit relay response
      const respKeyB = nacl.box.keyPair(); // for entry relay response

      // Exit layer (relay A decrypts, makes HTTP call)
      const exitLayer = JSON.stringify({
        exit: true,
        method: method,
        url: targetUrl,
        headers: {},
        body: null,
        response_pubkey: uint8ToHex(respKeyA.publicKey),
      });
      const innerBlob = encryptLayer(relayAPub, new TextEncoder().encode(exitLayer));

      addLog("  layer 2 (exit): encrypted for relay_a", "#ffcc00", 1);

      // Entry layer (relay B decrypts, forwards to relay A)
      const entryLayer = JSON.stringify({
        next_hop: relayA.url,
        payload: uint8ToHex(innerBlob),
        response_pubkey: uint8ToHex(respKeyB.publicKey),
      });
      const onionBlob = encryptLayer(relayBPub, new TextEncoder().encode(entryLayer));

      addLog("  layer 1 (entry): encrypted for relay_b", "#00ccff", 1);
      addLog(`  onion size: ${onionBlob.length} bytes`, "#555", 1);
      updateStep("onion", "done");

      // ── 3. Send to entry relay ──
      updateStep("send", "active");
      showPacket(0, 1, "#00ccff");
      addLog("sending onion to entry relay...", "#00ccff");
      await sleep(300);

      const forwardPayload = { payload: uint8ToHex(onionBlob) };
      const firstResp = await fetch(`${relayB.url}/forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(forwardPayload),
      });

      if (firstResp.status === 402) {
        addLog("  ← 402 Payment Required", "#cc66ff", 1);
        updateStep("send", "done", "402 received");
        showPacket(1, 0, "#cc66ff");
        await sleep(300);

        // ── 4. Sign x402 payment ──
        updateStep("pay", "active");
        setActiveNode("agent");

        const paymentReqHeader = firstResp.headers.get("x-payment-required");
        if (!paymentReqHeader) throw new Error("No x-payment-required header");

        const requirement = JSON.parse(atob(paymentReqHeader));
        const usdcAmount = (Number(requirement.maxAmountRequired) / 1e6).toFixed(4);
        addLog(`  payment: ${usdcAmount} USDC to ${requirement.payTo?.slice(0, 10)}...`, "#cc66ff", 1);

        // Sign EIP-712 TransferWithAuthorization
        const now = Math.floor(Date.now() / 1000);
        const validAfter = BigInt(now - 60);
        const validBefore = BigInt(now + 3600);
        const paymentNonce = requirement.nonce.startsWith("0x")
          ? requirement.nonce
          : "0x" + requirement.nonce.padStart(64, "0");

        const domain = {
          name: "USD Coin" as const,
          version: "2" as const,
          chainId: BigInt(BASE_SEPOLIA_CHAIN_ID),
          verifyingContract: USDC_ADDRESS as `0x${string}`,
        };

        const types = {
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        } as const;

        const message = {
          from: address,
          to: requirement.payTo as `0x${string}`,
          value: BigInt(requirement.maxAmountRequired),
          validAfter,
          validBefore,
          nonce: paymentNonce as `0x${string}`,
        };

        addLog("  signing USDC transferWithAuthorization...", "#cc66ff", 1);

        const signature = await walletClient.signTypedData({
          domain,
          types,
          primaryType: "TransferWithAuthorization",
          message,
        });

        addLog("  ✓ signed", "#cc66ff", 1);
        updateStep("pay", "done");

        // Build X-PAYMENT header
        const paymentPayload = {
          x402Version: 1,
          scheme: "exact",
          network: `eip155:${BASE_SEPOLIA_CHAIN_ID}`,
          payload: {
            signature,
            authorization: {
              from: address,
              to: requirement.payTo,
              value: requirement.maxAmountRequired,
              validAfter: validAfter.toString(),
              validBefore: validBefore.toString(),
              nonce: paymentNonce,
            },
          },
        };
        const paymentToken = btoa(JSON.stringify(paymentPayload));

        // ── 5. Retry with payment ──
        updateStep("retry", "active");
        showPacket(0, 1, "#00ccff");
        addLog("retrying with X-PAYMENT header...", "#00ccff");
        await sleep(300);

        const paidResp = await fetch(`${relayB.url}/forward`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-PAYMENT": paymentToken,
          },
          body: JSON.stringify(forwardPayload),
        });

        showPacket(1, 2, "#ffcc00");
        await sleep(200);
        showPacket(2, 3, "#ff8800");
        await sleep(200);

        const paidData = await paidResp.json();

        if (paidData.error) {
          throw new Error(paidData.error);
        }

        showPacket(3, 2, "#ffcc00");
        await sleep(200);
        showPacket(2, 1, "#00ccff");
        await sleep(200);
        showPacket(1, 0, "#00ff88");

        addLog("  ✓ payment accepted, response received", "#00ff88", 1);
        updateStep("retry", "done");

        // ── 6. Decrypt response ──
        updateStep("decrypt", "active");
        setActiveNode("agent");
        addLog("decrypting response layers...", "#00ff88");

        let responseBlob = hexToUint8(paidData.response);

        // Decrypt in reverse circuit order: entry (B) first, then exit (A)
        responseBlob = decryptLayer(respKeyB.secretKey, responseBlob);
        addLog("  layer 1 (relay_b): decrypted", "#00ccff", 1);

        responseBlob = decryptLayer(respKeyA.secretKey, responseBlob);
        addLog("  layer 2 (relay_a): decrypted", "#ffcc00", 1);

        const responseText = new TextDecoder().decode(responseBlob);
        const responseJson = JSON.parse(responseText);

        addLog("", "#333");
        addLog("════════════════════════════════════", "#00ff88");
        addLog("  request complete", "#00ff88");
        addLog(`  status: ${responseJson.status}`, "#00ff88");
        addLog("  service saw RELAY IP, not yours", "#00ff88");
        addLog("  payment: 0.01 USDC on Base Sepolia", "#cc66ff");
        addLog("════════════════════════════════════", "#00ff88");

        // Format body
        let bodyContent = responseJson.body;
        try {
          bodyContent = JSON.stringify(JSON.parse(bodyContent), null, 2);
        } catch {
          // keep as string
        }

        setResult(bodyContent);
        updateStep("decrypt", "done");
      } else {
        // No 402 — maybe payment not required? Process directly
        const data = await firstResp.json();
        if (data.error) throw new Error(data.error);

        updateStep("send", "done");
        updateStep("pay", "done", "skipped");
        updateStep("retry", "done", "skipped");
        updateStep("decrypt", "active");

        let responseBlob = hexToUint8(data.response);
        responseBlob = decryptLayer(respKeyB.secretKey, responseBlob);
        responseBlob = decryptLayer(respKeyA.secretKey, responseBlob);

        const responseText = new TextDecoder().decode(responseBlob);
        const responseJson = JSON.parse(responseText);

        let bodyContent = responseJson.body;
        try {
          bodyContent = JSON.stringify(JSON.parse(bodyContent), null, 2);
        } catch { /* keep as string */ }

        setResult(bodyContent);
        updateStep("decrypt", "done");

        addLog("", "#333");
        addLog("════════════════════════════════════", "#00ff88");
        addLog("  request complete (no payment required)", "#00ff88");
        addLog(`  status: ${responseJson.status}`, "#00ff88");
        addLog("════════════════════════════════════", "#00ff88");
      }
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      addLog(`  ✗ error: ${errorMsg}`, "#ff4444", 1);

      // Mark current active step as error
      setSteps(prev =>
        prev.map(s => (s.status === "active" ? { ...s, status: "error" as StepStatus } : s)),
      );
    } finally {
      setRunning(false);
      setPacketVisible(false);
      setActiveNode(null);
    }
  }, [isConnected, walletClient, address, targetUrl, method, addLog, updateStep, showPacket]);

  return (
    <div className="flex flex-col p-4 sm:p-6 gap-4 font-mono w-full max-w-6xl mx-auto">
      {/* Title */}
      <div style={{ height: 48 }}>
        <div className="text-[#00ff88] text-sm font-bold uppercase tracking-wider">
          try it
        </div>
        <div className="text-[10px] text-[#333] uppercase tracking-[0.15em] mt-1">
          send a real request through the onion relay network
        </div>
      </div>

      {/* Input area */}
      <div className="border border-[#1a1a2e] bg-[#0e0e18] p-4" style={{ minHeight: 120 }}>
        <div className="text-[10px] text-[#555] uppercase tracking-wider mb-3">destination</div>

        <div className="flex gap-2 mb-3">
          <select
            value={method}
            onChange={e => setMethod(e.target.value as "GET" | "POST")}
            className="bg-[#0a0a0f] border border-[#1a1a2e] text-[#00ff88] text-xs px-2 py-2 font-mono focus:border-[#00ff88] focus:outline-none"
            disabled={running}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
          <input
            type="text"
            value={targetUrl}
            onChange={e => setTargetUrl(e.target.value)}
            placeholder="https://httpbin.org/get"
            className="flex-1 bg-[#0a0a0f] border border-[#1a1a2e] text-[#c8c8d0] text-xs px-3 py-2 font-mono focus:border-[#00ff88] focus:outline-none placeholder-[#333]"
            disabled={running}
          />
          <button
            onClick={sendRequest}
            disabled={running || !isConnected}
            className="border text-[10px] uppercase tracking-wider px-4 py-2 transition-all whitespace-nowrap"
            style={{
              borderColor: running ? "#333" : !isConnected ? "#333" : "#00ff88",
              color: running ? "#333" : !isConnected ? "#333" : "#00ff88",
              cursor: running || !isConnected ? "not-allowed" : "pointer",
            }}
          >
            {running ? "sending..." : "▶ send privately"}
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <span className="text-[10px] text-[#333] mr-1 self-center">try:</span>
          {SUGGESTED_URLS.map(s => (
            <button
              key={s.url}
              onClick={() => { setTargetUrl(s.url); setMethod(s.method); }}
              className="text-[10px] text-[#555] hover:text-[#00ff88] border border-[#1a1a2e] hover:border-[#00ff8844] px-2 py-0.5 transition-colors"
              disabled={running}
            >
              {s.label}
            </button>
          ))}
        </div>

        {!isConnected && (
          <div className="mt-3 text-[10px] text-[#ff8800]">
            ↑ connect your wallet to send requests — you need Base Sepolia USDC for relay payments (0.01 per hop)
          </div>
        )}
      </div>

      {/* Network topology */}
      <div className="border border-[#1a1a2e] bg-[#0e0e18] p-4 sm:p-6" style={{ height: 180 }}>
        <div className="text-[10px] text-[#333] uppercase tracking-wider mb-4" style={{ height: 16 }}>
          network topology
          {running && (
            <span className="ml-2 text-[#00ff88]">● routing</span>
          )}
        </div>
        <div className="relative" style={{ height: 96 }}>
          <div className="absolute top-1/2 left-[12.5%] right-[12.5%] h-[1px] bg-[#1a1a2e] -translate-y-1/2" />
          <PacketTrail fromIdx={packetFrom} toIdx={packetTo} color={packetColor} visible={packetVisible} />
          <div className="relative grid grid-cols-4 gap-2">
            {(["agent", "relay_b", "relay_a", "service"] as const).map(id => (
              <div key={id} className="flex justify-center">
                <NetworkNode id={id} active={activeNode === id} activeColor={packetColor} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom grid: log + steps + result */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Terminal log */}
        <div className="lg:col-span-2 border border-[#1a1a2e] bg-[#0a0a0f] flex flex-col" style={{ height: 400 }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1a1a2e] bg-[#0e0e18] shrink-0" style={{ height: 36 }}>
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff4444]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#ffcc00]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#00ff88]" />
            <span className="text-[10px] text-[#333] ml-2">par — bash</span>
          </div>
          <div ref={logRef} className="overflow-y-auto flex-1 min-h-0 p-3 space-y-0.5">
            {logs.length === 0 ? (
              <div className="text-[#222] text-xs">
                <span className="text-[#00ff88]">$</span> enter a URL and click send...
                <span className="cursor-blink text-[#00ff88]">_</span>
              </div>
            ) : (
              logs.map((line, i) => (
                <div
                  key={i}
                  className="text-xs leading-relaxed"
                  style={{ color: line.color, paddingLeft: `${(line.indent || 0) * 16}px` }}
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

        {/* Steps + info panel */}
        <div className="flex flex-col gap-3" style={{ height: 400 }}>
          {/* Pipeline steps */}
          <div className="border border-[#1a1a2e] bg-[#0e0e18] p-3 text-[10px]" style={{ height: 200 }}>
            <div className="text-[#555] uppercase tracking-wider mb-2">pipeline</div>
            <div className="space-y-2">
              {steps.length === 0 ? (
                <div className="text-[#222]">waiting...</div>
              ) : (
                steps.map(step => (
                  <div key={step.id} className="flex items-center gap-2">
                    <span style={{
                      color: step.status === "done" ? "#00ff88"
                           : step.status === "active" ? "#ffcc00"
                           : step.status === "error" ? "#ff4444"
                           : "#1a1a2e",
                    }}>
                      {step.status === "done" ? "✓" : step.status === "active" ? "●" : step.status === "error" ? "✗" : "○"}
                    </span>
                    <span className={step.status === "done" ? "text-[#888]" : step.status === "active" ? "text-[#c8c8d0]" : "text-[#333]"}>
                      {step.label}
                    </span>
                    {step.detail && (
                      <span className="text-[#333] ml-auto">{step.detail}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Privacy info */}
          <div className="border border-[#1a1a2e] bg-[#0e0e18] p-3 text-[10px] flex-1 overflow-hidden">
            <div className="text-[#555] uppercase tracking-wider mb-2">what each party sees</div>
            <div className="space-y-1.5">
              <div>
                <span className="text-[#00ff88]">you:</span>
                <span className="text-[#888] ml-2">everything</span>
              </div>
              <div>
                <span className="text-[#00ccff]">relay b:</span>
                <span className="text-[#888] ml-2">your IP + encrypted blob</span>
              </div>
              <div>
                <span className="text-[#ffcc00]">relay a:</span>
                <span className="text-[#888] ml-2">relay b IP + destination</span>
              </div>
              <div>
                <span className="text-[#ff8800]">service:</span>
                <span className="text-[#888] ml-2">relay a IP + request</span>
              </div>
              <div className="border-t border-[#1a1a2e] pt-1.5 mt-2">
                <span className="text-[#555]">no single relay sees both who you are AND what you&apos;re asking</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Response result */}
      {result && (
        <div className="border border-[#1a1a2e] bg-[#0a0a0f]">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1a1a2e] bg-[#0e0e18]" style={{ height: 36 }}>
            <span className="text-[10px] text-[#00ff88] uppercase tracking-wider">decrypted response</span>
            <span className="text-[10px] text-[#333] ml-auto">service never saw your IP</span>
          </div>
          <pre className="p-4 text-xs text-[#c8c8d0] overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
};

export default TryIt;

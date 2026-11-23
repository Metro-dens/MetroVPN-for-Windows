import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsQR from 'jsqr';
import {
  Home,
  Globe,
  Gauge,
  Settings,
  Plus,
  QrCode,
  Minus,
  X,
  Power,
  ShieldCheck,
  Shield,
  Copy,
  Check,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  Search,
  Star,
  ChevronRight,
  ChevronDown,
  Zap,
  Activity,
  Layers,
  Monitor,
  ClipboardPaste,
  Wifi,
  Sparkles,
  AlertCircle,
  MoreVertical,
  Trash2,
  Edit3,
  Share2,
  Terminal,
  Download,
  PanelRight,
  AppWindow,
  Camera,
  Pause,
  Play,
  ShieldAlert,
  FolderOpen,
  HelpCircle,
  RotateCcw,
  Send,
  ExternalLink,
  Cpu,
  Video,
  Compass,
  ScanLine,
  Info,
  Lock,
} from 'lucide-react';
import {
  IN_TAURI,
  copyClipboard,
  invokeCmd,
  isSnipWindowMode,
  isTrayWindowMode,
  listenEvent,
  openExternalUrl,
  pickExeFile,
  readClipboard,
  showMainWindowFromTray,
  windowHide,
  windowMinimize,
} from './tauriBridge';
import ispSltImg from './assets/isp_slt.jpg';
import ispDialogImg from './assets/isp_dialog.jpg';
import ispHutchImg from './assets/isp_hutch.jpg';
import ispAirtelImg from './assets/isp_airtel.jpg';
import ispMobitelImg from './assets/isp_mobitel.jpg';
import metrovpnWordmark from './assets/metrovpn_wordmark.png';
import metrovpnApkIcon from './assets/metrovpn_apk_icon.png';

const ISP_BRANDS = {
  SLT: { id: 'SLT', label: 'SLT', displayName: 'SLT Fiber', img: ispSltImg, bg: '#FFFFFF' },
  Dialog: { id: 'Dialog', label: 'Dialog', displayName: 'Dialog', img: ispDialogImg, bg: '#FFFFFF' },
  Hutch: { id: 'Hutch', label: 'Hutch', displayName: 'Hutch', img: ispHutchImg, bg: '#FF6600' },
  Airtel: { id: 'Airtel', label: 'Airtel', displayName: 'Airtel', img: ispAirtelImg, bg: '#FFFFFF' },
  Mobitel: { id: 'Mobitel', label: 'Mobitel', displayName: 'SLT-Mobitel', img: ispMobitelImg, bg: '#FFFFFF' },
};

function detectIspBrand(node) {
  if (!node) return null;
  const hay = `${node.isp || ''} ${node.name || ''} ${node.sni || ''} ${node.host || ''}`.toLowerCase();
  if (hay.includes('mobitel')) return ISP_BRANDS.Mobitel;
  if (hay.includes('dialog')) return ISP_BRANDS.Dialog;
  if (hay.includes('hutch')) return ISP_BRANDS.Hutch;
  if (hay.includes('airtel')) return ISP_BRANDS.Airtel;
  if (hay.includes('slt') || hay.includes('stl') || hay.includes('fiber')) return ISP_BRANDS.SLT;
  return null;
}

function IspBadge({ node, size = 40, isActive = false }) {
  const brand = detectIspBrand(node);
  if (brand) {
    return (
      <div
        className="rounded-full overflow-hidden flex items-center justify-center shrink-0 shadow-sm"
        style={{
          width: size,
          height: size,
          backgroundColor: brand.bg,
          border: `1.5px solid ${isActive ? '#FF5449' : 'rgba(255,255,255,0.16)'}`,
          padding: size >= 40 ? 3 : 2,
        }}
        title={brand.displayName}
      >
        <img
          src={brand.img}
          alt={brand.displayName}
          className="w-full h-full object-cover rounded-full"
        />
      </div>
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-jakarta font-bold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size >= 40 ? 13 : 10,
        backgroundColor: isActive ? '#281A1A' : '#151213',
        border: `1px solid ${isActive ? '#6A4745' : '#2E2627'}`,
        color: '#F4ECEC',
      }}
    >
      {node?.region || 'VL'}
    </div>
  );
}

// ============================================================================
// DESIGN TOKENS & SPRING PHYSICS (Material 3 Expressive — Dark Crimson)
// ============================================================================
const SPRING = {
  type: 'spring',
  stiffness: 380,
  damping: 28,
  mass: 0.9,
};

const SPRING_SOFT = {
  type: 'spring',
  stiffness: 320,
  damping: 30,
};

const COLORS = {
  stage: '#0A0708',
  obsidian: 'rgba(18, 13, 14, 0.72)',
  surface: 'rgba(31, 24, 26, 0.62)',
  surfaceBorder: 'rgba(255, 224, 222, 0.11)',
  surfaceActive: 'rgba(66, 33, 33, 0.64)',
  surfaceActiveBorder: 'rgba(255, 110, 100, 0.34)',
  crimson: '#9B0A12',
  crimsonHover: '#B50D17',
  coral: '#FF5449',
  neonDown: '#FF5B52',
  neonUp: '#FFC966',
  amber: '#E6C280',
  amberBg: 'rgba(62, 47, 24, 0.72)',
  taupe: 'rgba(79, 54, 53, 0.80)',
  taupeHover: '#5C4341',
  mint: '#6DD5B0',
  textPrimary: '#F4ECEC',
  textMuted: '#B2A1A2',
};

const GLASS_CARD = {
  backgroundColor: COLORS.surface,
  border: `1px solid ${COLORS.surfaceBorder}`,
  backdropFilter: 'blur(18px) saturate(145%)',
  WebkitBackdropFilter: 'blur(18px) saturate(145%)',
  boxShadow: 'inset 0 1px 0 rgba(255, 228, 226, 0.10), 0 12px 28px -14px rgba(0, 0, 0, 0.68)',
};

const GLASS_ACTIVE = {
  backgroundColor: COLORS.surfaceActive,
  border: `1px solid ${COLORS.surfaceActiveBorder}`,
  backdropFilter: 'blur(18px) saturate(150%)',
  WebkitBackdropFilter: 'blur(18px) saturate(150%)',
  boxShadow: 'inset 0 1px 0 rgba(255, 184, 178, 0.14), 0 12px 28px -12px rgba(155, 10, 18, 0.28)',
};

const GLASS_CONNECTED = {
  backgroundColor: 'rgba(19, 44, 35, 0.72)',
  border: '1.5px solid rgba(109, 213, 176, 0.65)',
  backdropFilter: 'blur(18px) saturate(155%)',
  WebkitBackdropFilter: 'blur(18px) saturate(155%)',
  boxShadow: 'inset 0 1px 0 rgba(160, 255, 220, 0.18), 0 12px 30px -10px rgba(109, 213, 176, 0.26)',
};

const GLASS_INSET = {
  backgroundColor: COLORS.obsidian,
  border: '1px solid rgba(255, 220, 218, 0.08)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
};

const GLASS_MODAL = {
  backgroundColor: 'rgba(29, 22, 24, 0.84)',
  border: '1px solid rgba(255, 224, 222, 0.15)',
  backdropFilter: 'blur(24px) saturate(155%)',
  WebkitBackdropFilter: 'blur(24px) saturate(155%)',
  boxShadow: 'inset 0 1px 0 rgba(255, 228, 226, 0.12), 0 28px 64px -16px rgba(0, 0, 0, 0.85)',
};

function useSmoothedNumber(target, durationMs = 260) {
  const [val, setVal] = useState(target);
  const currentRef = useRef(target);

  useEffect(() => {
    const startVal = currentRef.current;
    if (Math.abs(target - startVal) < 0.0005) {
      currentRef.current = target;
      setVal(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const ease = 1 - Math.pow(1 - p, 3);
      const next = startVal + (target - startVal) * ease;
      currentRef.current = next;
      setVal(next);
      if (p < 1) {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return val;
}

function useSmoothedSeries(targetSeries, durationMs = 280) {
  const [series, setSeries] = useState(targetSeries);
  const curRef = useRef(targetSeries);

  useEffect(() => {
    const len = targetSeries?.length || 0;
    if (len === 0) return;
    const start = curRef.current && curRef.current.length === len ? [...curRef.current] : [...targetSeries];
    let raf = 0;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const ease = 1 - Math.pow(1 - p, 3);
      const next = targetSeries.map((tgt, idx) => start[idx] + (tgt - start[idx]) * ease);
      curRef.current = next;
      setSeries(next);
      if (p < 1) {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [targetSeries, durationMs]);

  return series;
}

// ============================================================================
// MATHEMATICAL SVG PATH GENERATORS
// ============================================================================
function generateScallopedPath(cx, cy, baseR, amplitude, lobes = 12, samples = 120) {
  let d = '';
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * Math.PI * 2;
    const r = baseR + amplitude * Math.cos(lobes * theta);
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return `${d}Z`;
}

function generateWavyArcPath(
  cx,
  cy,
  radius,
  fraction,
  startDeg = 135,
  sweepDeg = 270,
  waveAmp = 3.2,
  totalWaves = 24,
  phaseOffset = 0
) {
  const clamped = Math.max(0, Math.min(1, fraction));
  if (clamped < 0.008) return { d: '', endPt: null };
  const steps = Math.max(18, Math.round(200 * clamped));
  let d = '';
  let lastPt = null;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * clamped;
    const deg = startDeg + t * sweepDeg;
    const rad = (deg * Math.PI) / 180;
    const endTaper =
      Math.sin(Math.min(1, (i / steps) * 6) * (Math.PI / 2)) *
      Math.sin(Math.min(1, ((steps - i) / steps) * 6) * (Math.PI / 2));
    const r = radius + waveAmp * endTaper * Math.sin(t * totalWaves * Math.PI * 2 - phaseOffset);
    const x = cx + r * Math.cos(rad);
    const y = cy + r * Math.sin(rad);
    lastPt = { x, y };
    d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return { d: d.trim(), endPt: lastPt };
}

function generateSmoothArcPath(cx, cy, radius, startDeg = 135, sweepDeg = 270) {
  const steps = 90;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const deg = startDeg + (i / steps) * sweepDeg;
    const rad = (deg * Math.PI) / 180;
    const x = cx + radius * Math.cos(rad);
    const y = cy + radius * Math.sin(rad);
    d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return d.trim();
}

function buildSparklineGeometry(values, width, height, padY = 5, padRight = 6) {
  if (!values || values.length < 2) {
    return { linePath: '', areaPath: '', endPt: null };
  }
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const peak = Math.max(...clean);
  const baseY = height - padY;
  const endX = Math.max(4, width - padRight);
  if (peak <= 0.001) {
    const linePath = `M 0 ${baseY.toFixed(1)} L ${endX.toFixed(1)} ${baseY.toFixed(1)}`;
    const areaPath = `${linePath} L ${endX.toFixed(1)} ${height} L 0 ${height} Z`;
    return { linePath, areaPath, endPt: { x: endX, y: baseY } };
  }
  const maxVal = peak * 1.18;
  const usableH = Math.max(4, height - padY * 2);
  const stepX = endX / (clean.length - 1);
  const clampY = (y) => Math.max(padY, Math.min(baseY, y));
  const pts = clean.map((v, i) => ({
    x: i * stepX,
    y: clampY(baseY - (v / maxVal) * usableH),
  }));

  // Smooth Catmull-Rom to cubic Bezier spline so lines glide without sharp corners
  let linePath = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = clampY(p2.y - (p3.y - p1.y) / 6);
    linePath += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  const last = pts[pts.length - 1];
  const areaPath = `${linePath} L ${last.x.toFixed(2)} ${height} L ${pts[0].x.toFixed(2)} ${height} Z`;
  return { linePath, areaPath, endPt: last };
}

// ============================================================================
// INITIAL FALLBACK DATA (Replaced immediately by Tauri IPC on mount)
// ============================================================================
const INITIAL_NODES = [];
const INITIAL_WINDOWS_APPS = [];

const DNS_OPTIONS = ['Cloudflare 1.1.1.1', 'Cloudflare 1.1.1.2', 'Google 8.8.8.8', 'Quad9 9.9.9.9', 'Custom DoH'];
const MTU_OPTIONS = [1500, 1420, 1360, 1280];

function formatTimer(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function formatThroughput(mbps) {
  if (!mbps || mbps <= 0.001) return { value: '0.0', unit: 'KB/s' };
  if (mbps < 1) {
    return { value: (mbps * 125).toFixed(1), unit: 'KB/s' };
  }
  return { value: mbps.toFixed(1), unit: 'Mbps' };
}

function formatUsageData(usedGB) {
  const bytes = Math.max(0, (usedGB || 0) * 1073741824);
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(usedGB || 0).toFixed(2)} GB`;
}

function parsePreviewNode(raw, mode = 'uri') {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (mode === 'json' || trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      const net = String(obj?.streamSettings?.network || 'tcp').toUpperCase();
      const sec = String(obj?.streamSettings?.security || 'tls').toUpperCase();
      const hasVcn = Boolean(obj?.streamSettings?.tlsSettings?.verifyPeerCertByName);
      return {
        name: obj.tag || 'Imported Xray JSON Node',
        isp: obj.isp || 'SLT Fiber',
        sni: obj.sni || obj?.streamSettings?.tlsSettings?.serverName || 'st1.zoom.us',
        protocol: hasVcn ? `${net}+TLS+VCN` : `${net}+${sec}`,
      };
    } catch {
      return null;
    }
  }
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith('vless://') && !lower.startsWith('vmess://') && !lower.startsWith('trojan://')) {
    return null;
  }
  const hashIdx = trimmed.indexOf('#');
  let name = 'Imported Tunnel Node';
  if (hashIdx !== -1 && hashIdx < trimmed.length - 1) {
    try {
      name = decodeURIComponent(trimmed.slice(hashIdx + 1));
    } catch {
      name = trimmed.slice(hashIdx + 1);
    }
  }
  const sniMatch = trimmed.match(/[?&](?:sni|serverName|peer)=([^&#]+)/i);
  const hostMatch = trimmed.match(/@(?:\[([^\]]+)\]|([^:/?#]+))/i);
  const host = hostMatch ? hostMatch[1] || hostMatch[2] || '' : '';
  const sni = sniMatch ? decodeURIComponent(sniMatch[1]) : host || 'st1.zoom.us';
  const typeMatch = trimmed.match(/[?&](?:type|network)=([^&#]+)/i);
  const secMatch = trimmed.match(/[?&]security=([^&#]+)/i);
  const rawTr = (typeMatch ? typeMatch[1] : 'tcp').toLowerCase();
  const trLabel =
    rawTr === 'ws'
      ? 'WS'
      : rawTr === 'grpc'
      ? 'gRPC'
      : rawTr === 'httpupgrade'
      ? 'HTTPUpgrade'
      : rawTr === 'xhttp' || rawTr === 'splithttp'
      ? 'XHTTP'
      : rawTr === 'h2' || rawTr === 'http'
      ? 'H2'
      : rawTr === 'kcp'
      ? 'mKCP'
      : 'TCP';
  const rawSec = (secMatch ? secMatch[1] : 'tls').toLowerCase();
  const hasExplicitVcn = /[?&](?:vcn|verifyPeerCertByName)=/i.test(trimmed);
  const baseProto =
    rawSec === 'reality'
      ? `${trLabel}+REALITY`
      : rawSec === 'none'
      ? trLabel
      : hasExplicitVcn
      ? `${trLabel}+TLS+VCN`
      : `${trLabel}+TLS`;
  const protocol = lower.startsWith('trojan://')
    ? `Trojan • ${baseProto}`
    : lower.startsWith('vmess://')
    ? 'VMess'
    : baseProto;

  return {
    name,
    isp: lower.includes('dialog')
      ? 'Dialog'
      : lower.includes('mobitel')
      ? 'Mobitel'
      : lower.includes('hutch')
      ? 'Hutch'
      : lower.includes('airtel')
      ? 'Airtel'
      : 'SLT Fiber',
    sni,
    protocol,
  };
}

// ============================================================================
// SHARED LIVE APPLICATION STATE STORE (Backed by Tauri v2 IPC)
// ============================================================================
const MetroContext = createContext(null);

function useMetro() {
  const ctx = useContext(MetroContext);
  if (!ctx) throw new Error('useMetro must be used inside MetroProvider');
  return ctx;
}

const DEFAULT_SETTINGS_STATE = {
  systemMode: 'TUN',
  tunnelProfile: 'Strict VCN',
  lanProxySharing: false,
  splitTunneling: true,
  bypassLan: true,
  dnsResolver: 'Cloudflare 1.1.1.1',
  customDohUrl: 'https://dns.quad9.net/dns-query',
  mtu: 1420,
  certPinning: true,
  startWithWindows: false,
  activeNodeId: null,
  windowsApps: INITIAL_WINDOWS_APPS,
  socksPort: 10808,
  httpPort: 10809,
  udpEnabled: true,
  sniffingEnabled: true,
  sniffingRouteOnly: false,
  systemProxyExceptions:
    '<local>;localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.2*;172.30.*;172.31.*;192.168.*',
  autoConnectOnLaunch: false,
  closeToTray: true,
  routingMode: 'rule',
  fragmentPackets: 'tlshello',
  fragmentLength: '10-20',
  fragmentInterval: '10-20',
  ipv6Enabled: false,
  tunStrictRoute: true,
  tunExcludeCidrs: '',
  bootstrapDns: '1.1.1.1',
  allowInsecureFallback: false,
  defaultFingerprint: 'chrome',
  muxEnabled: false,
  muxConcurrency: 8,
  logLevel: 'warning',
  savedSubscriptions: [],
  subUseProxy: false,
  subClearBeforeUpdate: false,
  latencyMode: 'http_204',
  latencyTestUrl: 'https://www.gstatic.com/generate_204',
  onboardingCompleted: false,
  autoCheckUpdates: true,
};

function MetroProvider({ children }) {
  const [activeRoute, setActiveRoute] = useState('home');
  const [railExpanded, setRailExpanded] = useState(false);
  const [windowMinimizedToTray, setWindowMinimizedToTray] = useState(false);
  const [trayFlyoutOpen, setTrayFlyoutOpen] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [sessionSeconds, setSessionSeconds] = useState(0);

  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [activeNodeId, setActiveNodeId] = useState(null);
  const [testingAllPings, setTestingAllPings] = useState(false);
  const [syncingQuotaIds, setSyncingQuotaIds] = useState({});

  const [downHistory, setDownHistory] = useState(Array(14).fill(0));
  const [upHistory, setUpHistory] = useState(Array(14).fill(0));
  const [totalSessionBytes, setTotalSessionBytes] = useState({ down: 0, up: 0 });

  const [speedTestActive, setSpeedTestActive] = useState(false);
  const [speedTestProgress, setSpeedTestProgress] = useState(null);
  const [speedHistory, setSpeedHistory] = useState([]);

  const [settingsState, setSettingsState] = useState(DEFAULT_SETTINGS_STATE);
  const [localLanIp, setLocalLanIp] = useState('127.0.0.1');
  const [settingsNeedsReconnect, setSettingsNeedsReconnect] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalTab, setAddModalTab] = useState('uri');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('general');
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [appsModalOpen, setAppsModalOpen] = useState(false);
  const [scanningApps, setScanningApps] = useState(false);
  const [logsDrawerOpen, setLogsDrawerOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [pendingTunNodeId, setPendingTunNodeId] = useState(null);
  const [shareNodeModal, setShareNodeModal] = useState(null);
  const [editNodeModal, setEditNodeModal] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(null);

  const [logs, setLogs] = useState([]);
  const [logsStreaming, setLogsStreaming] = useState(true);
  const [toasts] = useState([]);
  const [connectionError, setConnectionError] = useState('');

  const logsStreamingRef = useRef(true);
  useEffect(() => {
    logsStreamingRef.current = logsStreaming;
  }, [logsStreaming]);

  const settingsRef = useRef(settingsState);
  useEffect(() => {
    settingsRef.current = settingsState;
  }, [settingsState]);

  const appendLog = useCallback((tag, msg) => {
    const now = new Date();
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((v) => String(v).padStart(2, '0'))
      .join(':');
    setLogs((prev) => [...prev.slice(-499), { id: `l-${Date.now()}-${Math.random()}`, time, tag, msg }]);
  }, []);

  // Floating toast popups are intentionally silenced (only native Windows toast fires on VPN connect).
  const pushToast = useCallback(
    (message, tone = 'neutral') => {
      const clean = String(message || '').trim();
      if (!clean) return;
      if (tone === 'amber') {
        appendLog('Warning', clean);
      }
    },
    [appendLog]
  );

  const syncingAllRef = useRef(false);
  const lastAllSyncMsRef = useRef(0);
  const syncAllQuotas = useCallback(async (force = false) => {
    if (!IN_TAURI || syncingAllRef.current) return;
    const now = Date.now();
    if (!force && now - lastAllSyncMsRef.current < 4000) return;
    syncingAllRef.current = true;
    lastAllSyncMsRef.current = now;
    try {
      const updatedList = await invokeCmd('sync_all_quotas');
      if (Array.isArray(updatedList)) {
        setNodes(updatedList);
      }
    } catch {
      // ignore silent background quota sync failure
    } finally {
      syncingAllRef.current = false;
    }
  }, []);

  const applySettingsObject = useCallback((s) => {
    if (!s) return;
    setSettingsState((prev) => ({
      ...prev,
      ...s,
      socksPort: 10808,
      httpPort: 10809,
      windowsApps: Array.isArray(s.windowsApps) ? s.windowsApps : prev.windowsApps,
      savedSubscriptions: Array.isArray(s.savedSubscriptions) ? s.savedSubscriptions : prev.savedSubscriptions,
    }));
    if (s.activeNodeId !== undefined) {
      setActiveNodeId(s.activeNodeId || null);
    }
  }, []);

  useEffect(() => {
    if (!IN_TAURI) return;
    let mounted = true;
    const unsubs = [];

    (async () => {
      try {
        const [srvList, settings, status, initLogs, history] = await Promise.all([
          invokeCmd('list_servers'),
          invokeCmd('get_settings'),
          invokeCmd('get_status'),
          invokeCmd('get_logs'),
          invokeCmd('get_speed_history'),
        ]);
        if (!mounted) return;
        applySettingsObject(settings);
        if (Array.isArray(srvList)) {
          setNodes(srvList);
          if (!settings?.activeNodeId && srvList[0]) {
            setActiveNodeId(srvList[0].id);
            setSettingsState((prev) => ({ ...prev, activeNodeId: srvList[0].id }));
          }
          if (srvList.length > 0) {
            syncAllQuotas(true);
          }
        }
        if (settings && !settings.onboardingCompleted) {
          setOnboardingOpen(true);
        }
        if (status) {
          setConnectionStatus(status.status.toLowerCase());
          setSessionSeconds(status.elapsedSecs || 0);
          setLocalLanIp(status.localLanIp || '127.0.0.1');
          if (status.activeNodeId) {
            setActiveNodeId(status.activeNodeId);
            setSettingsState((prev) => ({ ...prev, activeNodeId: status.activeNodeId }));
          }
        }
        if (Array.isArray(initLogs)) setLogs(initLogs);
        if (Array.isArray(history)) setSpeedHistory(history);

        // Auto-check for updates on launch if enabled (matching Android MainViewModel)
        if (!settings || settings.autoCheckUpdates !== false) {
          invokeCmd('check_github_update')
            .then((info) => {
              if (!mounted || !info) return;
              setUpdateInfo(info);
              if (info.updateAvailable) {
                setUpdateModalOpen(true);
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        appendLog('Warning', `Initial backend hydration error: ${String(err)}`);
      }

      unsubs.push(
        await listenEvent('vpn://telemetry', (payload) => {
          if (!mounted || !payload) return;
          const downMbps = Number(((payload.downBps * 8) / 1_000_000).toFixed(2));
          const upMbps = Number(((payload.upBps * 8) / 1_000_000).toFixed(2));
          setSessionSeconds(payload.elapsedSecs || 0);
          setTotalSessionBytes({ down: payload.totalDown || 0, up: payload.totalUp || 0 });
          setDownHistory((prev) => [...prev.slice(1), downMbps]);
          setUpHistory((prev) => [...prev.slice(1), upMbps]);
          if (payload.activeNodeQuotaUsedGb != null) {
            const targetId = settingsRef.current?.activeNodeId;
            setNodes((prev) =>
              prev.map((n, idx) =>
                (targetId ? n.id === targetId : idx === 0)
                  ? { ...n, quotaUsedGB: payload.activeNodeQuotaUsedGb }
                  : n
              )
            );
          }
        })
      );

      unsubs.push(
        await listenEvent('vpn://quota-updated', (updatedNode) => {
          if (!mounted || !updatedNode) return;
          setNodes((prev) => prev.map((n) => (n.id === updatedNode.id ? { ...n, ...updatedNode } : n)));
        })
      );

      unsubs.push(
        await listenEvent('update://progress', (prog) => {
          if (!mounted || !prog) return;
          setUpdateDownloadProgress(prog);
          if (prog.phase === 'error' || prog.phase === 'ready') {
            setDownloadingUpdate(false);
          }
        })
      );

      unsubs.push(
        await listenEvent('vpn://log', (entry) => {
          if (!mounted || !entry || !logsStreamingRef.current) return;
          setLogs((prev) => [...prev.slice(-499), entry]);
        })
      );

      unsubs.push(
        await listenEvent('vpn://status', (status) => {
          if (!mounted || !status) return;
          const norm = (status.status || 'Disconnected').toLowerCase();
          setConnectionStatus(norm === 'error' ? 'disconnected' : norm);
          setSessionSeconds(status.elapsedSecs || 0);
          if (status.systemMode) {
            setSettingsState((prev) => ({ ...prev, systemMode: status.systemMode }));
          }
          if (status.activeNodeId !== undefined) {
            const nextId = status.activeNodeId || null;
            setActiveNodeId(nextId);
            setSettingsState((prev) => ({ ...prev, activeNodeId: nextId }));
          }
          if (status.localLanIp) setLocalLanIp(status.localLanIp);
          if (norm === 'connected') {
            setConnectionError(status.message ? String(status.message) : '');
          }
          if (norm === 'disconnected') {
            setDownHistory(Array(14).fill(0));
            setUpHistory(Array(14).fill(0));
            setSettingsNeedsReconnect(false);
          }
          if (status.status === 'Error' && status.message) {
            setConnectionError(String(status.message));
          }
        })
      );

      unsubs.push(
        await listenEvent('vpn://ping-updated', (res) => {
          if (!mounted || !res) return;
          setNodes((prev) =>
            prev.map((n) =>
              n.id === res.id ? { ...n, ping: res.pingMs ?? null, online: Boolean(res.online) } : n
            )
          );
        })
      );

      unsubs.push(
        await listenEvent('speedtest://progress', (prog) => {
          if (!mounted || !prog) return;
          setSpeedTestProgress(prog);
        })
      );
    })();

    const quotaTimer = setInterval(() => {
      syncAllQuotas(false);
    }, 60000);

    return () => {
      mounted = false;
      clearInterval(quotaTimer);
      unsubs.forEach((u) => typeof u === 'function' && u());
    };
  }, [applySettingsObject, appendLog, syncAllQuotas]);

  const activeNode = useMemo(
    () => nodes.find((n) => n.id === activeNodeId) || nodes[0] || null,
    [nodes, activeNodeId]
  );

  const persistSettingsPatch = useCallback(
    async (patch, options = {}) => {
      const { reconnect = false, affectsTunnel = true } = options;
      const next = {
        ...settingsRef.current,
        activeNodeId,
        ...patch,
        socksPort: 10808,
        httpPort: 10809,
      };
      applySettingsObject(next);
      if (connectionStatus === 'connected' && affectsTunnel && !reconnect) {
        setSettingsNeedsReconnect(true);
      }
      if (IN_TAURI) {
        try {
          await invokeCmd('update_settings', { settings: next, reconnect });
          if (reconnect) setSettingsNeedsReconnect(false);
        } catch (err) {
          pushToast(`Settings error: ${String(err)}`, 'amber');
        }
      }
    },
    [activeNodeId, connectionStatus, applySettingsObject, pushToast]
  );

  const applySettingsAndReconnect = useCallback(async () => {
    if (!IN_TAURI) {
      setSettingsNeedsReconnect(false);
      return;
    }
    try {
      await invokeCmd('reconnect_active');
      setSettingsNeedsReconnect(false);
    } catch (err) {
      setConnectionError(String(err));
      pushToast(`Reconnect failed: ${String(err)}`, 'amber');
    }
  }, [pushToast]);

  const resetSettingsToDefault = useCallback(async () => {
    if (!IN_TAURI) {
      applySettingsObject(DEFAULT_SETTINGS_STATE);
      return;
    }
    try {
      const fresh = await invokeCmd('reset_settings');
      applySettingsObject(fresh);
      if (connectionStatus === 'connected') setSettingsNeedsReconnect(true);
    } catch (err) {
      pushToast(`Reset failed: ${String(err)}`, 'amber');
    }
  }, [connectionStatus, applySettingsObject, pushToast]);

  const completeOnboarding = useCallback(
    async (openImportTab = null) => {
      await persistSettingsPatch({ onboardingCompleted: true }, { affectsTunnel: false });
      setOnboardingOpen(false);
      if (openImportTab) {
        setAddModalTab(openImportTab);
        setAddModalOpen(true);
      }
    },
    [persistSettingsPatch]
  );

  const syncNodeQuota = useCallback(
    async (nodeId, silent = false) => {
      if (!nodeId || !IN_TAURI) return;
      setSyncingQuotaIds((prev) => ({ ...prev, [nodeId]: true }));
      try {
        const updated = await invokeCmd('sync_node_quota', { id: nodeId });
        if (updated) {
          setNodes((prev) => prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n)));
        }
      } catch (err) {
        if (!silent) {
          pushToast(`Quota sync: ${String(err)}`, 'amber');
        }
      } finally {
        setSyncingQuotaIds((prev) => {
          const copy = { ...prev };
          delete copy[nodeId];
          return copy;
        });
      }
    },
    [pushToast]
  );

  const connectToNode = useCallback(
    async (nodeId, forcedMode) => {
      const target = nodes.find((n) => n.id === nodeId);
      if (!target) {
        setAddModalTab('uri');
        setAddModalOpen(true);
        return;
      }
      const modeToUse = forcedMode || settingsRef.current.systemMode;
      setConnectionError('');
      setActiveNodeId(nodeId);
      setSettingsState((prev) => ({ ...prev, activeNodeId: nodeId }));
      setConnectionStatus('connecting');
      setSettingsNeedsReconnect(false);

      if (!IN_TAURI) {
        setTimeout(() => {
          setConnectionStatus('connected');
          setSessionSeconds(1);
        }, 500);
        return;
      }

      try {
        await invokeCmd('connect_server', { id: nodeId, mode: modeToUse });
      } catch (err) {
        const msg = String(err);
        setConnectionStatus('disconnected');
        if (msg.includes('ADMIN_REQUIRED')) {
          setPendingTunNodeId(nodeId);
          setAdminModalOpen(true);
        } else {
          setConnectionError(msg);
          pushToast(`Connection failed: ${msg}`, 'amber');
        }
      }
    },
    [nodes, pushToast]
  );

  const toggleConnection = useCallback(async () => {
    if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
      if (IN_TAURI) {
        try {
          await invokeCmd('disconnect');
        } catch (err) {
          pushToast(`Disconnect error: ${String(err)}`, 'amber');
        }
      }
      setConnectionError('');
      setConnectionStatus('disconnected');
      setSessionSeconds(0);
      setSettingsNeedsReconnect(false);
    } else if (activeNode) {
      await connectToNode(activeNode.id, settingsRef.current.systemMode);
    } else {
      setAddModalTab('uri');
      setAddModalOpen(true);
    }
  }, [connectionStatus, activeNode, connectToNode, pushToast]);

  const toggleStarNode = useCallback(
    async (nodeId) => {
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, starred: !n.starred } : n)));
      if (IN_TAURI) {
        try {
          await invokeCmd('toggle_star', { id: nodeId });
        } catch (err) {
          pushToast(String(err), 'amber');
        }
      }
    },
    [pushToast]
  );

  const deleteNode = useCallback(
    async (nodeId) => {
      const target = nodes.find((n) => n.id === nodeId);
      if (IN_TAURI) {
        try {
          const updated = await invokeCmd('delete_server', { id: nodeId });
          setNodes(updated);
          if (activeNodeId === nodeId) {
            setActiveNodeId(updated[0]?.id || null);
          }
          pushToast(`Removed ${target?.name || 'node'}`, 'neutral');
          return;
        } catch (err) {
          pushToast(String(err), 'amber');
          return;
        }
      }
      const remaining = nodes.filter((n) => n.id !== nodeId);
      setNodes(remaining);
      if (activeNodeId === nodeId) setActiveNodeId(remaining[0]?.id || null);
    },
    [nodes, activeNodeId, pushToast]
  );

  const updateNodeDetails = useCallback(
    async (updated) => {
      if (IN_TAURI) {
        try {
          const saved = await invokeCmd('update_server', updated);
          setNodes((prev) => prev.map((n) => (n.id === saved.id ? saved : n)));
          pushToast(`Updated ${saved.name}`, 'success');
          return;
        } catch (err) {
          pushToast(String(err), 'amber');
          return;
        }
      }
      setNodes((prev) => prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n)));
    },
    [pushToast]
  );

  const testAllPings = useCallback(async () => {
    if (testingAllPings || nodes.length === 0) return;
    setTestingAllPings(true);
    if (IN_TAURI) {
      try {
        await invokeCmd('ping_all_servers');
        invokeCmd('sync_all_quotas')
          .then((list) => Array.isArray(list) && setNodes(list))
          .catch(() => {});
        pushToast('Latency & 3x-ui quota probe complete', 'success');
      } catch (err) {
        pushToast(`Ping failed: ${String(err)}`, 'amber');
      } finally {
        setTestingAllPings(false);
      }
    } else {
      setTimeout(() => setTestingAllPings(false), 600);
    }
  }, [testingAllPings, nodes.length, pushToast]);

  const syncAllSubscriptions = useCallback(async () => {
    if (!IN_TAURI) return;
    try {
      const updated = await invokeCmd('update_all_subscriptions');
      setNodes(updated);
      const s = await invokeCmd('get_settings');
      applySettingsObject(s);
      pushToast(`Subscriptions synced (${updated.length} total nodes)`, 'success');
    } catch (err) {
      pushToast(String(err), 'amber');
    }
  }, [applySettingsObject, pushToast]);

  const checkForUpdates = useCallback(async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      if (!IN_TAURI) {
        const mockInfo = {
          currentVersion: '2.7.5',
          latestVersion: '2.7.5',
          updateAvailable: false,
          releaseUrl: 'https://github.com/Metro-dens/MetroVPN-for-Windows/releases',
          downloadUrl: 'https://github.com/Metro-dens/MetroVPN-for-Windows/releases/latest/download/Metrovpn-standalone-x64.exe',
          assetName: 'Metrovpn-standalone-x64.exe',
          title: 'Metrovpn v2.7.5',
          message: 'You are running the latest version of Metrovpn for Windows.',
        };
        setUpdateInfo(mockInfo);
        pushToast('You are on the latest version (v2.7.5)', 'success');
        return;
      }
      const info = await invokeCmd('check_github_update');
      setUpdateInfo(info);
      if (info.updateAvailable) {
        setUpdateModalOpen(true);
      }
      pushToast(
        info.updateAvailable
          ? `New version v${info.latestVersion} available!`
          : `You are on the latest version (v${info.currentVersion})`,
        info.updateAvailable ? 'amber' : 'success'
      );
    } catch (err) {
      pushToast(`Update check failed: ${String(err)}`, 'amber');
    } finally {
      setCheckingUpdate(false);
    }
  }, [checkingUpdate, pushToast]);

  const downloadAndInstallUpdate = useCallback(async () => {
    if (!updateInfo?.downloadUrl || downloadingUpdate) return;
    if (!IN_TAURI) {
      openExternalUrl(updateInfo.downloadUrl);
      return;
    }
    setDownloadingUpdate(true);
    setUpdateDownloadProgress({ percent: 0, downloadedBytes: 0, totalBytes: 0, phase: 'downloading' });
    try {
      await invokeCmd('download_and_install_update', {
        downloadUrl: updateInfo.downloadUrl,
        assetName: updateInfo.assetName || 'Metrovpn-Update-Setup.exe',
      });
    } catch (err) {
      setDownloadingUpdate(false);
      pushToast(`Update install failed: ${String(err)}`, 'amber');
    }
  }, [updateInfo, downloadingUpdate, pushToast]);

  const toggleSystemMode = useCallback(
    async (forcedMode) => {
      const next = forcedMode || (settingsRef.current.systemMode === 'TUN' ? 'PROXY' : 'TUN');
      if (next === 'TUN' && IN_TAURI) {
        try {
          const elevated = await invokeCmd('is_admin');
          if (!elevated) {
            setPendingTunNodeId(activeNode?.id || null);
            setAdminModalOpen(true);
            return;
          }
        } catch {
          // ignore
        }
      }
      await persistSettingsPatch({ systemMode: next }, { reconnect: connectionStatus === 'connected' });
      pushToast(
        next === 'TUN'
          ? 'TUN Mode selected (Wintun NIC)'
          : 'System Proxy selected (127.0.0.1:10809)',
        'neutral'
      );
    },
    [activeNode, connectionStatus, persistSettingsPatch, pushToast]
  );

  const openAddModal = useCallback((tab = 'uri') => {
    setAddModalTab(tab);
    setAddModalOpen(true);
  }, []);

  const minimizeToTray = useCallback(async () => {
    if (IN_TAURI) {
      await windowHide();
    } else {
      setWindowMinimizedToTray(true);
      setTrayFlyoutOpen(true);
      pushToast('Minimized to Windows System Tray — Tunnel stays active', 'amber');
    }
  }, [pushToast]);

  const restoreFromTray = useCallback(async () => {
    if (IN_TAURI) {
      await showMainWindowFromTray();
    } else {
      setWindowMinimizedToTray(false);
    }
  }, []);

  const clearSpeedHistory = useCallback(async () => {
    setSpeedHistory([]);
    if (IN_TAURI) {
      try {
        await invokeCmd('clear_speed_history');
      } catch {
        // ignore
      }
    }
    pushToast('Cleared recent speed test history', 'neutral');
  }, [pushToast]);

  const toggleWindowsAppBypass = useCallback(
    async (appId) => {
      const nextApps = settingsRef.current.windowsApps.map((a) =>
        a.id === appId ? { ...a, bypassed: !a.bypassed } : a
      );
      await persistSettingsPatch({ windowsApps: nextApps });
    },
    [persistSettingsPatch]
  );

  const scanWindowsApps = useCallback(async () => {
    if (!IN_TAURI) return;
    setScanningApps(true);
    try {
      const scanned = await invokeCmd('scan_windows_apps');
      if (Array.isArray(scanned)) {
        applySettingsObject({ ...settingsRef.current, windowsApps: scanned });
      }
    } catch (err) {
      pushToast(`App scan error: ${String(err)}`, 'amber');
    } finally {
      setScanningApps(false);
    }
  }, [applySettingsObject, pushToast]);

  const setSystemMode = useCallback(
    (mode) => persistSettingsPatch({ systemMode: mode }, { reconnect: connectionStatus === 'connected' }),
    [persistSettingsPatch, connectionStatus]
  );

  const resolvedActiveNodeId = activeNode?.id || activeNodeId || null;

  const value = {
    // Spread persisted settings first so live state values (especially activeNodeId) always win
    ...settingsState,
    settings: settingsState,

    activeRoute,
    setActiveRoute,
    railExpanded,
    setRailExpanded,
    windowMinimizedToTray,
    setWindowMinimizedToTray,
    trayFlyoutOpen,
    setTrayFlyoutOpen,
    minimizeToTray,
    restoreFromTray,
    connectionStatus,
    sessionSeconds,
    toggleConnection,
    nodes,
    setNodes,
    activeNode,
    activeNodeId: resolvedActiveNodeId,
    setActiveNodeId,
    connectToNode,
    toggleStarNode,
    deleteNode,
    updateNodeDetails,
    testingAllPings,
    testAllPings,
    syncNodeQuota,
    syncAllQuotas,
    syncingQuotaIds,
    connectionError,
    setConnectionError,
    downHistory,
    upHistory,
    totalSessionBytes,
    speedTestActive,
    setSpeedTestActive,
    speedTestProgress,
    speedHistory,
    setSpeedHistory,
    clearSpeedHistory,
    localLanIp,
    setLocalLanIp,
    settingsNeedsReconnect,
    applySettingsAndReconnect,
    resetSettingsToDefault,
    syncAllSubscriptions,
    checkForUpdates,
    checkingUpdate,
    updateInfo,
    updateModalOpen,
    setUpdateModalOpen,
    downloadingUpdate,
    updateDownloadProgress,
    downloadAndInstallUpdate,
    persistSettingsPatch,
    applySettingsObject,

    socksPort: 10808,
    httpPort: 10809,
    systemMode: settingsState.systemMode,
    setSystemMode,
    toggleSystemMode,
    setTunnelProfile: (v) => persistSettingsPatch({ tunnelProfile: v }),
    setLanProxySharing: (v) => persistSettingsPatch({ lanProxySharing: v }),
    setSplitTunneling: (v) => persistSettingsPatch({ splitTunneling: v }),
    setWindowsApps: (apps) => persistSettingsPatch({ windowsApps: apps }),
    toggleWindowsAppBypass,
    scanWindowsApps,
    scanningApps,
    setBypassLan: (v) => persistSettingsPatch({ bypassLan: v }),
    setDnsResolver: (v) => persistSettingsPatch({ dnsResolver: v }),
    setCustomDohUrl: (v) => persistSettingsPatch({ customDohUrl: v }),
    setMtu: (v) => persistSettingsPatch({ mtu: v }),
    setCertPinning: (v) => persistSettingsPatch({ certPinning: v }),
    setStartWithWindows: (v) => persistSettingsPatch({ startWithWindows: v }, { affectsTunnel: false }),
    setAutoCheckUpdates: (v) => persistSettingsPatch({ autoCheckUpdates: v }, { affectsTunnel: false }),

    addModalOpen,
    setAddModalOpen,
    addModalTab,
    setAddModalTab,
    openAddModal,
    qrModalOpen,
    setQrModalOpen,
    settingsTab,
    setSettingsTab,
    onboardingOpen,
    setOnboardingOpen,
    completeOnboarding,
    appsModalOpen,
    setAppsModalOpen,
    logsDrawerOpen,
    setLogsDrawerOpen,
    adminModalOpen,
    setAdminModalOpen,
    pendingTunNodeId,
    logs,
    logsStreaming,
    setLogsStreaming,
    appendLog,
    shareNodeModal,
    setShareNodeModal,
    editNodeModal,
    setEditNodeModal,
    toasts,
    pushToast,
  };

  return <MetroContext.Provider value={value}>{children}</MetroContext.Provider>;
}

// ============================================================================
// CUSTOM GEOMETRIC WHITE WOLF EMBLEM SVG
// ============================================================================
function WolfEmblem({ className = 'w-5 h-5' }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M6.2 4.4L11.7 10.6H20.3L25.8 4.4L27.1 13.8L23.7 19.1L16 27.8L8.3 19.1L4.9 13.8L6.2 4.4Z"
        fill="#F4ECEC"
      />
      <path d="M8.3 7.8L10.7 11.4L7.2 13.3L8.3 7.8Z" fill="#141112" />
      <path d="M23.7 7.8L21.3 11.4L24.8 13.3L23.7 7.8Z" fill="#141112" />
      <path d="M10.3 15.2L14.2 16.8L11.2 17.9L10.3 15.2Z" fill="#9B0A12" />
      <path d="M21.7 15.2L17.8 16.8L20.8 17.9L21.7 15.2Z" fill="#9B0A12" />
      <path d="M16 14.2L18.3 21.8L16 24.4L13.7 21.8L16 14.2Z" fill="#141112" fillOpacity="0.18" />
      <path d="M14.3 21.8H17.7L16 24.3L14.3 21.8Z" fill="#141112" />
    </svg>
  );
}

// ============================================================================
// MATERIAL 3 EXPRESSIVE SWITCH
// ============================================================================
function M3ExpressiveSwitch({ checked, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className="relative inline-flex items-center w-[50px] h-[28px] rounded-full transition-colors duration-200 cursor-pointer shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5449]/60"
      style={{
        backgroundColor: checked ? COLORS.coral : '#2E2627',
        border: checked ? '1px solid #FF7970' : '1px solid #453A3B',
      }}
    >
      <motion.span
        layout
        transition={SPRING}
        className="flex items-center justify-center rounded-full shadow-sm"
        style={{
          width: checked ? 22 : 16,
          height: checked ? 22 : 16,
          backgroundColor: checked ? '#FFF5F5' : '#968788',
          marginLeft: checked ? 24 : 5,
        }}
      >
        {checked && <Check className="w-3 h-3" strokeWidth={3.2} style={{ color: COLORS.crimson }} />}
      </motion.span>
    </button>
  );
}

// ============================================================================
// HERO 12-LOBE SCALLOPED CONNECT BUTTON
// ============================================================================
function ScallopedConnectButton({ size = 220, status, onClick }) {
  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';
  const isActive = isConnected || isConnecting;

  const innerScallop = useMemo(() => generateScallopedPath(110, 110, 74, 5.4, 12, 144), []);
  const innerCircle = useMemo(() => generateScallopedPath(110, 110, 74, 0, 12, 144), []);
  const outerWavyRing = useMemo(() => generateScallopedPath(110, 110, 96, 4.0, 14, 168), []);

  const iconSize = size >= 180 ? 'w-14 h-14' : 'w-7 h-7';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      transition={SPRING}
      aria-label={isConnected ? 'Disconnect VPN' : 'Connect VPN'}
      className="relative flex items-center justify-center cursor-pointer select-none focus:outline-none group"
      style={{ width: size, height: size }}
    >
      {/* Static idle outer track circle */}
      <svg viewBox="0 0 220 220" className="absolute inset-0 w-full h-full pointer-events-none">
        <circle
          cx="110"
          cy="110"
          r="94"
          fill="none"
          stroke="#3B2E2F"
          strokeWidth="2"
          strokeOpacity={isActive ? 0 : 0.65}
          style={{ transition: 'stroke-opacity 220ms ease' }}
        />
      </svg>

      {/* Fixed-position outer wavy ring rotating strictly around its own 50% 50% center */}
      <motion.svg
        viewBox="0 0 220 220"
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ transformOrigin: '50% 50%' }}
        animate={{
          rotate: isActive ? 360 : 0,
          opacity: isActive ? 1 : 0,
        }}
        transition={{
          rotate: isActive
            ? {
                repeat: Infinity,
                duration: isConnecting ? 6 : 18,
                ease: 'linear',
              }
            : { duration: 0.25 },
          opacity: { duration: 0.22 },
        }}
      >
        <path
          d={outerWavyRing}
          fill="none"
          stroke={isConnected ? COLORS.coral : COLORS.amber}
          strokeOpacity={0.95}
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>

      {/* Fixed-position inner scalloped shield button */}
      <svg viewBox="0 0 220 220" className="relative w-full h-full pointer-events-none">
        <path
          d={isActive ? innerScallop : innerCircle}
          fill={isConnected ? COLORS.crimson : isConnecting ? '#6E1419' : '#261F20'}
          stroke={isConnected ? '#BA1D25' : isConnecting ? COLORS.amber : '#4A3637'}
          strokeWidth={1.8}
          style={{ transition: 'fill 220ms ease, stroke 220ms ease' }}
        />
      </svg>

      <motion.div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        animate={isConnecting ? { opacity: [0.65, 1, 0.65] } : { opacity: 1 }}
        transition={isConnecting ? { repeat: Infinity, duration: 1.1 } : {}}
      >
        {isConnected ? (
          <ShieldCheck className={iconSize} strokeWidth={1.85} style={{ color: '#F8E3E3' }} />
        ) : isConnecting ? (
          <Shield className={iconSize} strokeWidth={1.85} style={{ color: COLORS.amber }} />
        ) : (
          <Power
            className={size >= 180 ? 'w-12 h-12' : size >= 130 ? 'w-9 h-9' : 'w-6 h-6'}
            strokeWidth={1.9}
            style={{ color: COLORS.coral }}
          />
        )}
      </motion.div>
    </motion.button>
  );
}

// ============================================================================
// CUSTOM 42px WINDOWS 11 FRAMELESS TITLEBAR (Compact NetMod-Inspired)
// ============================================================================
function Titlebar() {
  const {
    openAddModal,
    setQrModalOpen,
    setOnboardingOpen,
    minimizeToTray,
  } = useMetro();

  return (
    <header
      className="h-[42px] w-full flex items-center justify-between pl-3 pr-2 select-none shrink-0 border-b relative z-30"
      style={{
        backgroundColor: 'rgba(20, 15, 16, 0.72)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        borderColor: 'rgba(255, 224, 222, 0.09)',
        boxShadow: 'inset 0 -1px 0 rgba(255, 255, 255, 0.03)',
      }}
    >
      <div data-tauri-drag-region="" className="flex-1 flex items-center gap-2 min-w-0 h-full">
        <div
          className="w-6 h-6 rounded-[8px] flex items-center justify-center shrink-0 pointer-events-none overflow-hidden"
          style={{
            backgroundColor: 'rgba(42, 26, 28, 0.75)',
            border: '1px solid rgba(255, 140, 130, 0.25)',
          }}
        >
          <img src={metrovpnApkIcon} alt="Metrovpn" className="w-4 h-4 object-contain" />
        </div>
        <img
          src={metrovpnWordmark}
          alt="Metrovpn"
          className="h-[18px] w-auto object-contain pointer-events-none select-none"
        />
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium pointer-events-none shrink-0"
          style={{
            ...GLASS_CARD,
            color: COLORS.textMuted,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.coral }} />
          v2.7.5
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => openAddModal('uri')}
          title="Paste VLESS / VMess Config"
          className="h-[28px] px-2.5 rounded-full flex items-center gap-1 text-[11.5px] font-semibold cursor-pointer transition-colors duration-150 hover:bg-[#5C4341]"
          style={{
            backgroundColor: COLORS.taupe,
            color: COLORS.textPrimary,
            border: '1px solid rgba(255, 200, 196, 0.20)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.12)',
          }}
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          <span>Add</span>
        </button>

        <button
          type="button"
          onClick={() => setQrModalOpen(true)}
          title="Scan QR (Snip Screen or Camera)"
          className="w-[28px] h-[28px] rounded-full flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-[#322628]"
          style={{
            ...GLASS_CARD,
            color: COLORS.textPrimary,
          }}
        >
          <QrCode className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setOnboardingOpen(true)}
          title="Step-by-Step Setup Guide"
          className="w-[28px] h-[28px] rounded-full flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-[#322628]"
          style={{
            ...GLASS_CARD,
            color: COLORS.amber,
          }}
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 mx-0.5" style={{ backgroundColor: 'rgba(255, 220, 218, 0.12)' }} />

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Minimize"
            onClick={() => windowMinimize()}
            className="w-7 h-7 rounded-[7px] flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-[#2A2022]"
            style={{ color: COLORS.textMuted }}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            title="Hide to System Tray"
            onClick={minimizeToTray}
            className="w-7 h-7 rounded-[7px] flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-[#9B0A12] hover:text-[#F4ECEC]"
            style={{ color: COLORS.textMuted }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}

// ============================================================================
// LEFT FLOATING VERTICAL PILL RAIL
// ============================================================================
const NAV_ROUTES = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'servers', label: 'Servers', icon: Globe },
  { id: 'speed', label: 'Speed', icon: Gauge },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function NavigationRail() {
  const {
    activeRoute,
    setActiveRoute,
    connectionStatus,
    systemMode,
    toggleSystemMode,
  } = useMetro();

  const statusColor =
    connectionStatus === 'connected'
      ? COLORS.mint
      : connectionStatus === 'connecting'
      ? COLORS.amber
      : '#7B6D6E';

  const statusLabel =
    connectionStatus === 'connected'
      ? 'Protected'
      : connectionStatus === 'connecting'
      ? 'Connecting'
      : 'Offline';

  return (
    <aside
      className="w-[62px] h-full rounded-[22px] flex flex-col justify-between py-2.5 px-2 shrink-0 relative z-20 select-none"
      style={GLASS_CARD}
    >
      <nav className="flex flex-col gap-1.5" aria-label="Main navigation">
        {NAV_ROUTES.map((item) => {
          const Icon = item.icon;
          const active = activeRoute === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveRoute(item.id)}
              title={item.label}
              aria-label={item.label}
              className="relative w-full py-2 rounded-[14px] flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors duration-150 hover:bg-[#2F2325]"
              style={{
                backgroundColor: active ? COLORS.crimson : 'transparent',
                color: active ? COLORS.textPrimary : COLORS.textMuted,
                border: `1px solid ${active ? 'rgba(255, 130, 120, 0.45)' : 'transparent'}`,
                boxShadow: active ? '0 6px 18px -6px rgba(255, 84, 73, 0.55)' : 'none',
              }}
            >
              <Icon className="w-[17px] h-[17px] shrink-0" strokeWidth={active ? 2.25 : 1.9} />
              <span className="text-[9.5px] font-semibold tracking-tight leading-none">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: 'rgba(255, 224, 222, 0.08)' }}>
        <div
          className="flex flex-col items-center justify-center rounded-[12px] py-1.5 gap-1"
          style={GLASS_INSET}
          title={`Tunnel Status: ${statusLabel}`}
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {connectionStatus !== 'disconnected' && (
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-55"
                style={{ backgroundColor: statusColor }}
              />
            )}
            <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: statusColor }} />
          </span>
          <span className="text-[8.5px] font-semibold uppercase tracking-wider" style={{ color: COLORS.textMuted }}>
            {connectionStatus === 'connected' ? 'ON' : connectionStatus === 'connecting' ? '...' : 'OFF'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => toggleSystemMode()}
          title={
            systemMode === 'TUN'
              ? 'TUN Mode Active (All PC apps & games • Default Admin) — Click to switch to System Proxy'
              : 'System Proxy Mode Active (Browsers & chat apps) — Click to switch to TUN Mode'
          }
          className="w-full rounded-[14px] py-2 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors duration-150"
          style={
            systemMode === 'TUN'
              ? GLASS_ACTIVE
              : {
                  ...GLASS_INSET,
                  border: `1px solid ${COLORS.surfaceBorder}`,
                }
          }
        >
          <Layers className="w-3.5 h-3.5 shrink-0" style={{ color: systemMode === 'TUN' ? COLORS.coral : COLORS.amber }} />
          <span
            className="font-mono text-[9.5px] font-semibold tracking-wider"
            style={{ color: systemMode === 'TUN' ? COLORS.textPrimary : COLORS.amber }}
          >
            {systemMode === 'TUN' ? 'TUN' : 'PRX'}
          </span>
        </button>
      </div>
    </aside>
  );
}

// ============================================================================
// SCREEN 1: HOME DASHBOARD (Compact NetMod-Inspired 520x620 Layout)
// ============================================================================
function HomeScreen() {
  const {
    connectionStatus,
    sessionSeconds,
    toggleConnection,
    activeNode,
    downHistory,
    upHistory,
    tunnelProfile,
    systemMode,
    localLanIp,
    socksPort,
    setActiveRoute,
    openAddModal,
    setQrModalOpen,
    setOnboardingOpen,
    setLogsDrawerOpen,
    connectionError,
    setConnectionError,
    pushToast,
  } = useMetro();

  const [copiedProxy, setCopiedProxy] = useState(false);

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  const smoothDownSeries = useSmoothedSeries(downHistory, 300);
  const smoothUpSeries = useSmoothedSeries(upHistory, 300);
  const downNow = formatThroughput(downHistory[downHistory.length - 1] || 0);
  const upNow = formatThroughput(upHistory[upHistory.length - 1] || 0);

  const downGeo = useMemo(() => buildSparklineGeometry(smoothDownSeries, 180, 28, 6, 7), [smoothDownSeries]);
  const upGeo = useMemo(() => buildSparklineGeometry(smoothUpSeries, 180, 28, 6, 7), [smoothUpSeries]);

  const handleCopyLocalProxy = async () => {
    const addr = `${localLanIp}:${socksPort || 10808}`;
    await copyClipboard(addr);
    setCopiedProxy(true);
    pushToast(`Copied local SOCKS5 proxy ${addr}`, 'success');
    setTimeout(() => setCopiedProxy(false), 1800);
  };

  return (
    <motion.div
      key="screen-home"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      className="flex flex-col gap-2.5 pb-1"
    >
      {/* Hero Orb Glass Card */}
      <div
        className="rounded-[22px] px-4 py-3.5 flex flex-col items-center justify-center relative overflow-hidden"
        style={GLASS_CARD}
      >
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11.5px] font-semibold"
          style={{
            ...GLASS_INSET,
            color: COLORS.textPrimary,
          }}
        >
          <span className="relative flex h-2 w-2">
            {connectionStatus !== 'disconnected' && (
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                style={{ backgroundColor: isConnected ? COLORS.mint : COLORS.amber }}
              />
            )}
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{
                backgroundColor: isConnected ? COLORS.mint : isConnecting ? COLORS.amber : '#7B6D6E',
              }}
            />
          </span>
          <span>
            {isConnected
              ? `Protected • ${activeNode?.protocol || 'Encrypted'}`
              : isConnecting
              ? 'Connecting...'
              : activeNode
              ? 'Disconnected'
              : 'Ready • Add Config'}
          </span>
        </div>

        <div
          className="mt-2 mb-2.5 font-mono tabular-nums text-[32px] font-bold tracking-[-0.03em] leading-none"
          style={{ color: isConnected ? COLORS.textPrimary : '#6E6162' }}
        >
          {isConnected ? formatTimer(sessionSeconds) : '00:00:00'}
        </div>

        <ScallopedConnectButton size={146} status={connectionStatus} onClick={toggleConnection} />

        <p
          className="mt-2.5 text-[11.5px] font-medium text-center"
          style={{ color: isConnected ? '#CBBBBC' : COLORS.textMuted }}
        >
          {isConnected
            ? 'Encrypted tunnel active • Click orb to disconnect'
            : isConnecting
            ? `Performing Xray ${tunnelProfile} handshake...`
            : activeNode
            ? 'Click orb to connect'
            : 'No server yet • Paste link or scan QR to start'}
        </p>

        {connectionError && (
          <div
            className="mt-2 w-full rounded-[12px] px-3 py-1.5 flex items-center justify-between gap-2 text-[11px]"
            style={{ backgroundColor: 'rgba(84, 24, 29, 0.72)', border: '1px solid rgba(255, 84, 73, 0.45)', color: '#FFD4D0' }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: COLORS.coral }} />
              <span className="truncate" title={connectionError}>{connectionError}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setLogsDrawerOpen(true)}
                className="px-2 h-5 rounded-full text-[10px] font-semibold cursor-pointer hover:bg-black/35"
                style={{ backgroundColor: 'rgba(0,0,0,0.28)', color: '#FFE2DF', border: '1px solid rgba(255,180,171,0.28)' }}
              >
                Logs
              </button>
              <button
                type="button"
                onClick={() => setConnectionError('')}
                className="w-5 h-5 rounded-full flex items-center justify-center cursor-pointer hover:bg-black/25"
                style={{ color: COLORS.textMuted }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {!activeNode && (
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={() => openAddModal('uri')}
              className="h-[28px] px-3 rounded-full text-[11px] font-semibold cursor-pointer transition-colors duration-150 hover:bg-[#5C4341]"
              style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary, border: '1px solid rgba(255,200,196,0.2)' }}
            >
              + Add Config
            </button>
            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              className="h-[28px] px-3 rounded-full text-[11px] font-semibold cursor-pointer transition-colors duration-150 hover:bg-[#2A2324]"
              style={{ ...GLASS_INSET, color: COLORS.textPrimary }}
            >
              Scan QR
            </button>
            <button
              type="button"
              onClick={() => setOnboardingOpen(true)}
              className="h-[28px] px-3 rounded-full text-[11px] font-semibold cursor-pointer transition-colors duration-150 hover:bg-[#2A2324]"
              style={{ ...GLASS_INSET, color: COLORS.amber }}
            >
              Setup Guide
            </button>
          </div>
        )}
      </div>

      {/* Live Neon Speed Pair */}
      <div className="grid grid-cols-2 gap-2.5">
        <div
          className="rounded-[18px] pt-3 px-3.5 pb-0 flex flex-col justify-between overflow-hidden"
          style={{
            ...GLASS_CARD,
            minHeight: 90,
          }}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold" style={{ color: COLORS.textMuted }}>
                Download
              </span>
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(84, 24, 29, 0.72)', border: '1px solid rgba(255, 91, 82, 0.45)', color: COLORS.neonDown }}
              >
                <ArrowDown className="w-3.5 h-3.5" strokeWidth={2.4} />
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span
                className="font-mono tabular-nums text-[20px] font-bold tracking-tight leading-none"
                style={{ color: COLORS.textPrimary }}
              >
                {downNow.value}
              </span>
              <span className="font-mono text-[11px] font-medium" style={{ color: COLORS.neonDown }}>
                {downNow.unit}
              </span>
            </div>
          </div>

          <div className="h-[28px] mt-1 -mx-3.5" style={{ width: 'calc(100% + 1.75rem)' }}>
            <svg viewBox="0 0 180 28" preserveAspectRatio="none" className="w-full h-full block overflow-visible">
              <defs>
                <linearGradient id="homeDownSpark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.neonDown} stopOpacity="0.34" />
                  <stop offset="100%" stopColor={COLORS.neonDown} stopOpacity="0" />
                </linearGradient>
                <filter id="neonDownGlow" x="-20%" y="-40%" width="140%" height="180%">
                  <feGaussianBlur stdDeviation="2.1" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {downGeo.linePath && (
                <>
                  <path d={downGeo.areaPath} fill="url(#homeDownSpark)" />
                  <path
                    d={downGeo.linePath}
                    fill="none"
                    stroke={COLORS.neonDown}
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#neonDownGlow)"
                  />
                  {downGeo.endPt && (
                    <g filter="url(#neonDownGlow)">
                      <circle cx={downGeo.endPt.x} cy={downGeo.endPt.y} r="4.6" fill={COLORS.neonDown} fillOpacity="0.34" />
                      <circle cx={downGeo.endPt.x} cy={downGeo.endPt.y} r="2.7" fill={COLORS.neonDown} />
                      <circle cx={downGeo.endPt.x} cy={downGeo.endPt.y} r="1.2" fill="#FFF2F1" />
                    </g>
                  )}
                </>
              )}
            </svg>
          </div>
        </div>

        <div
          className="rounded-[18px] pt-3 px-3.5 pb-0 flex flex-col justify-between overflow-hidden"
          style={{
            ...GLASS_CARD,
            minHeight: 90,
          }}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold" style={{ color: COLORS.textMuted }}>
                Upload
              </span>
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(72, 54, 24, 0.72)', border: '1px solid rgba(255, 201, 102, 0.42)', color: COLORS.neonUp }}
              >
                <ArrowUp className="w-3.5 h-3.5" strokeWidth={2.4} />
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span
                className="font-mono tabular-nums text-[20px] font-bold tracking-tight leading-none"
                style={{ color: COLORS.textPrimary }}
              >
                {upNow.value}
              </span>
              <span className="font-mono text-[11px] font-medium" style={{ color: COLORS.neonUp }}>
                {upNow.unit}
              </span>
            </div>
          </div>

          <div className="h-[28px] mt-1 -mx-3.5" style={{ width: 'calc(100% + 1.75rem)' }}>
            <svg viewBox="0 0 180 28" preserveAspectRatio="none" className="w-full h-full block overflow-visible">
              <defs>
                <linearGradient id="homeUpSpark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.neonUp} stopOpacity="0.32" />
                  <stop offset="100%" stopColor={COLORS.neonUp} stopOpacity="0" />
                </linearGradient>
                <filter id="neonUpGlow" x="-20%" y="-40%" width="140%" height="180%">
                  <feGaussianBlur stdDeviation="2.1" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {upGeo.linePath && (
                <>
                  <path d={upGeo.areaPath} fill="url(#homeUpSpark)" />
                  <path
                    d={upGeo.linePath}
                    fill="none"
                    stroke={COLORS.neonUp}
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#neonUpGlow)"
                  />
                  {upGeo.endPt && (
                    <g filter="url(#neonUpGlow)">
                      <circle cx={upGeo.endPt.x} cy={upGeo.endPt.y} r="4.6" fill={COLORS.neonUp} fillOpacity="0.34" />
                      <circle cx={upGeo.endPt.x} cy={upGeo.endPt.y} r="2.7" fill={COLORS.neonUp} />
                      <circle cx={upGeo.endPt.x} cy={upGeo.endPt.y} r="1.2" fill="#FFFBF0" />
                    </g>
                  )}
                </>
              )}
            </svg>
          </div>
        </div>
      </div>

      {/* Active Server Glass Card */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => (activeNode ? setActiveRoute('servers') : openAddModal('uri'))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            activeNode ? setActiveRoute('servers') : openAddModal('uri');
          }
        }}
        className="rounded-[18px] p-3.5 cursor-pointer flex flex-col gap-2 transition-colors duration-150 hover:border-[#FF7369]"
        style={GLASS_ACTIVE}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <IspBadge node={activeNode} size={36} isActive={Boolean(activeNode)} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="font-jakarta font-bold text-[13.5px] leading-tight truncate" style={{ color: COLORS.textPrimary }}>
                  {activeNode?.name || 'No Exit Server Selected'}
                </h2>
                {activeNode?.vcn && (
                  <span
                    className="px-1.5 py-0.5 rounded-[5px] font-mono text-[9.5px] font-bold shrink-0"
                    style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}
                  >
                    VCN
                  </span>
                )}
              </div>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: '#CEB4B3' }}>
                {activeNode
                  ? `${activeNode.protocol} • Quota: ${formatUsageData(activeNode.quotaUsedGB || 0)}${
                      activeNode.quotaTotalGB > 0
                        ? ` / ${activeNode.quotaTotalGB.toFixed(1)} GB`
                        : activeNode.quotaUpdatedAtMs > 0
                        ? ' / Unlimited'
                        : ''
                    }`
                  : 'Click to paste VLESS / VMess URI'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="px-2 py-0.5 rounded-full font-mono tabular-nums text-[11px] font-semibold"
              style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}
            >
              {activeNode?.ping != null ? `${activeNode.ping}ms` : activeNode ? 'Ping' : 'Setup'}
            </span>
            <ChevronRight className="w-4 h-4" style={{ color: COLORS.textMuted }} />
          </div>
        </div>
      </div>

      {/* Compact Tunneling Mode & Local Proxy Footer */}
      <div
        className="rounded-[16px] px-3.5 py-2.5 flex items-center justify-between gap-2"
        style={GLASS_CARD}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <span className="text-[9.5px] uppercase tracking-wider block" style={{ color: COLORS.textMuted }}>
              Profile
            </span>
            <span className="font-jakarta font-semibold text-[12px] truncate block" style={{ color: COLORS.textPrimary }}>
              {tunnelProfile}
            </span>
          </div>
          <div className="w-px h-6 shrink-0" style={{ backgroundColor: 'rgba(255, 224, 222, 0.10)' }} />
          <div>
            <span className="text-[9.5px] uppercase tracking-wider block" style={{ color: COLORS.textMuted }}>
              Mode
            </span>
            <span
              className="inline-flex items-center gap-1 font-jakarta font-semibold text-[12px]"
              style={{ color: isConnected ? COLORS.mint : COLORS.textMuted }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: isConnected ? COLORS.mint : COLORS.textMuted }}
              />
              {systemMode === 'TUN' ? 'TUN' : 'Proxy'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyLocalProxy}
          className="h-[30px] px-3 rounded-full text-[11.5px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors duration-150 hover:bg-[#5C4341] shrink-0"
          style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary, border: '1px solid #634947' }}
        >
          {copiedProxy ? <Check className="w-3.5 h-3.5" style={{ color: COLORS.mint }} /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedProxy ? 'Copied' : ':10808 / :10809'}</span>
        </button>
      </div>
    </motion.div>
  );
}

// ============================================================================
// SMOOTH DATA USAGE / QUOTA PROGRESS BAR (No Crazy Zigzag!)
// ============================================================================
function WavyQuotaBar({ usedGB, totalGB, isConnectedCard }) {
  const [hovered, setHovered] = useState(false);
  const hasLimit = totalGB > 0;
  const pct = hasLimit
    ? Math.max(usedGB > 0 ? 3 : 0, Math.min(100, (usedGB / totalGB) * 100))
    : usedGB > 0
    ? 25
    : 0;
  const remainingGB = hasLimit ? Math.max(0, totalGB - usedGB) : 0;

  return (
    <div
      className="relative pt-1.5 pb-0.5 cursor-help"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="w-full h-[5px] rounded-full overflow-hidden"
        style={{ backgroundColor: isConnectedCard ? '#563D3B' : '#2E2627' }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: hasLimit && pct > 85 ? COLORS.amber : COLORS.coral,
          }}
        />
      </div>

      {hovered && (
        <div
          className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-[8px] font-mono tabular-nums text-[10.5px] font-medium whitespace-nowrap z-30 shadow-xl pointer-events-none"
          style={{ backgroundColor: '#231C1D', border: '1px solid #493839', color: COLORS.textPrimary }}
        >
          <span style={{ color: COLORS.coral }}>{formatUsageData(usedGB)}</span> used
          {hasLimit ? (
            <>
              {' '}• <span style={{ color: COLORS.mint }}>{remainingGB.toFixed(1)} GB</span> left
            </>
          ) : (
            ' • 3x-ui Unlimited Plan'
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SCREEN 2: SERVERS & TUNNEL NODES
// ============================================================================
function ServersScreen() {
  const {
    nodes,
    activeNode,
    activeNodeId,
    connectionStatus,
    connectToNode,
    toggleStarNode,
    deleteNode,
    testingAllPings,
    testAllPings,
    syncNodeQuota,
    syncAllQuotas,
    syncingQuotaIds,
    setShareNodeModal,
    setEditNodeModal,
    pushToast,
    openAddModal,
  } = useMetro();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [openMenuId, setOpenMenuId] = useState(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (nodes.length > 0) {
      syncAllQuotas(false);
    }
  }, [syncAllQuotas, nodes.length]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const closeMenu = () => setOpenMenuId(null);
    if (openMenuId) {
      window.addEventListener('click', closeMenu);
      return () => window.removeEventListener('click', closeMenu);
    }
  }, [openMenuId]);

  const filterChips = useMemo(
    () => [
      { id: 'all', label: 'All' },
      { id: 'starred', label: 'Starred' },
      { id: 'lowping', label: 'Low Ping' },
      { id: 'tlsvcn', label: 'TLS+VCN' },
      { id: 'isp:SLT', label: 'SLT', brand: ISP_BRANDS.SLT },
      { id: 'isp:Dialog', label: 'Dialog', brand: ISP_BRANDS.Dialog },
      { id: 'isp:Hutch', label: 'Hutch', brand: ISP_BRANDS.Hutch },
      { id: 'isp:Airtel', label: 'Airtel', brand: ISP_BRANDS.Airtel },
      { id: 'isp:Mobitel', label: 'Mobitel', brand: ISP_BRANDS.Mobitel },
    ],
    []
  );

  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = nodes.filter((node) => {
      const ispBrand = detectIspBrand(node);
      const matchesQuery =
        !q ||
        node.name.toLowerCase().includes(q) ||
        node.isp.toLowerCase().includes(q) ||
        (ispBrand && ispBrand.displayName.toLowerCase().includes(q)) ||
        node.sni.toLowerCase().includes(q) ||
        node.protocol.toLowerCase().includes(q) ||
        node.region.toLowerCase().includes(q);
      if (!matchesQuery) return false;

      if (selectedFilter === 'starred') return node.starred;
      if (selectedFilter === 'lowping') return node.online && node.ping != null;
      if (selectedFilter === 'tlsvcn') return node.vcn;
      if (selectedFilter.startsWith('isp:')) {
        return ispBrand?.id === selectedFilter.slice(4);
      }
      return true;
    });

    if (selectedFilter === 'lowping') {
      return [...list].sort((a, b) => (a.ping ?? 9999) - (b.ping ?? 9999));
    }
    return list;
  }, [nodes, searchQuery, selectedFilter]);

  const onlineCount = nodes.filter((n) => n.online).length;

  const handleSinglePing = async (e, nodeId) => {
    e.stopPropagation();
    if (!IN_TAURI) return;
    try {
      await invokeCmd('ping_server', { id: nodeId });
    } catch (err) {
      pushToast(String(err), 'amber');
    }
  };

  const handleSyncQuota = async (e, nodeId) => {
    e.stopPropagation();
    await syncNodeQuota(nodeId, false);
  };

  return (
    <motion.div
      key="screen-servers"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={SPRING_SOFT}
      className="flex flex-col gap-3.5 pb-12"
    >
      <div
        className="rounded-[24px] px-5 py-4 flex items-center justify-between gap-4"
        style={connectionStatus === 'connected' ? GLASS_CONNECTED : GLASS_CARD}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <span className="relative flex h-3 w-3 shrink-0">
            {connectionStatus === 'connected' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-55" style={{ backgroundColor: COLORS.mint }} />
            )}
            <span
              className="relative inline-flex rounded-full h-3 w-3"
              style={{
                backgroundColor:
                  connectionStatus === 'connected'
                    ? COLORS.mint
                    : connectionStatus === 'connecting'
                    ? COLORS.amber
                    : '#7B6D6E',
              }}
            />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.13em]" style={{ color: COLORS.textMuted }}>
                {connectionStatus === 'connected' ? 'CONNECTED SERVER' : 'SELECTED SERVER'}
              </span>
              {connectionStatus === 'connected' && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase"
                  style={{ backgroundColor: 'rgba(26, 62, 48, 0.92)', border: '1px solid rgba(109, 213, 176, 0.5)', color: COLORS.mint }}
                >
                  ACTIVE
                </span>
              )}
            </div>
            <div className="font-jakarta font-bold text-[15.5px] leading-snug truncate mt-0.5" style={{ color: COLORS.textPrimary }}>
              {activeNode?.name || 'No Server'}
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="font-mono tabular-nums text-[15px] font-bold leading-tight" style={{ color: COLORS.amber }}>
            {activeNode?.ping != null ? `${activeNode.ping} ms` : '— ms'}
          </div>
          <div className="text-[11px] font-mono font-semibold mt-0.5" style={{ color: COLORS.textMuted }}>
            {activeNode?.protocol}
          </div>
        </div>
      </div>

      <div
        className="rounded-[24px] p-4 flex flex-col gap-3"
        style={GLASS_CARD}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="flex-1 min-w-[230px] h-[40px] rounded-full px-4 flex items-center gap-2.5 transition-colors focus-within:border-[#FF7369]"
            style={GLASS_INSET}
          >
            <Search className="w-4 h-4 shrink-0" style={{ color: COLORS.textMuted }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search locations, ISPs, or SNI..."
              className="w-full bg-transparent text-[13px] focus:outline-none placeholder-[#7E6F70]"
              style={{ color: COLORS.textPrimary }}
            />
            <kbd
              className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[10px] shrink-0"
              style={{ ...GLASS_CARD, color: COLORS.textMuted }}
            >
              Ctrl+K
            </kbd>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={testAllPings}
              disabled={testingAllPings}
              className="h-[34px] px-3 rounded-full text-[11.5px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors duration-150 hover:bg-[#5C4341] disabled:opacity-70"
              style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary, border: '1px solid rgba(255,200,196,0.2)' }}
            >
              <Zap className={`w-3.5 h-3.5 ${testingAllPings ? 'animate-pulse' : ''}`} style={{ color: COLORS.amber }} />
              <span>{testingAllPings ? 'Testing...' : 'Test Pings'}</span>
            </button>

            <button
              type="button"
              onClick={testAllPings}
              className="h-[34px] px-3 rounded-full text-[11.5px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors duration-150 hover:bg-[#1E1A1B]"
              style={{ ...GLASS_INSET, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.textPrimary }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.mint }} />
              <span className="font-mono tabular-nums">{onlineCount} Online</span>
              <RefreshCw className={`w-3 h-3 ${testingAllPings ? 'animate-spin' : ''}`} style={{ color: COLORS.textMuted }} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {filterChips.map((chip) => {
            const isActive = selectedFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setSelectedFilter(chip.id)}
                className="h-[28px] px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors duration-150"
                style={{
                  backgroundColor: isActive ? COLORS.taupe : 'rgba(18, 13, 14, 0.7)',
                  color: isActive ? COLORS.textPrimary : COLORS.textMuted,
                  border: `1px solid ${isActive ? 'rgba(255, 195, 190, 0.25)' : COLORS.surfaceBorder}`,
                }}
              >
                {chip.brand ? (
                  <span
                    className="w-3.5 h-3.5 rounded-full overflow-hidden flex items-center justify-center shrink-0"
                    style={{ backgroundColor: chip.brand.bg, padding: 1 }}
                  >
                    <img src={chip.brand.img} alt={chip.label} className="w-full h-full object-cover rounded-full" />
                  </span>
                ) : (
                  isActive && <Check className="w-3 h-3" strokeWidth={2.6} />
                )}
                <span>{chip.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filteredNodes.length === 0 ? (
        <div
          className="rounded-[22px] p-8 text-center flex flex-col items-center gap-2.5"
          style={GLASS_CARD}
        >
          <Globe className="w-7 h-7" style={{ color: COLORS.textMuted }} />
          <p className="font-jakarta font-semibold text-[14px]" style={{ color: COLORS.textPrimary }}>
            No servers match your filter
          </p>
          <button
            type="button"
            onClick={() => openAddModal('uri')}
            className="px-4 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer transition-colors duration-150 hover:bg-[#5C4341]"
            style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary }}
          >
            + Add Tunnel Node
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredNodes.map((node, idx) => {
            const effectiveActiveId = activeNode?.id || activeNodeId;
            const isActiveNode = Boolean(effectiveActiveId && node.id === effectiveActiveId);
            const isConnectedCard = isActiveNode && connectionStatus === 'connected';
            const isConnectingCard = isActiveNode && connectionStatus === 'connecting';
            const isSyncingQuota = Boolean(syncingQuotaIds?.[node.id]);
            const hasQuotaSynced = (node.quotaUpdatedAtMs || 0) > 0;
            const remainingGB =
              node.quotaTotalGB > 0 ? Math.max(0, node.quotaTotalGB - (node.quotaUsedGB || 0)) : null;
            const isMenuOpen = openMenuId === node.id;
            const openMenuUpward = idx >= filteredNodes.length - 1 && filteredNodes.length > 1;

            return (
              <div
                key={node.id}
                role="button"
                tabIndex={0}
                data-connected={isConnectedCard ? 'true' : 'false'}
                data-active={isActiveNode ? 'true' : 'false'}
                onClick={() => connectToNode(node.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') connectToNode(node.id);
                }}
                className="rounded-[20px] p-3.5 cursor-pointer flex flex-col justify-between gap-2.5 relative transition-colors duration-150 hover:border-[#FF7369]"
                style={{
                  ...(isConnectedCard ? GLASS_CONNECTED : isActiveNode ? GLASS_ACTIVE : GLASS_CARD),
                  zIndex: isMenuOpen ? 50 : 1,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <IspBadge node={node} size={36} isActive={isConnectedCard || isActiveNode} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="font-jakarta font-bold text-[13.5px] truncate min-w-0 flex-1" style={{ color: COLORS.textPrimary }}>
                          {node.name}
                        </h3>
                        {isConnectedCard && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold tracking-wider uppercase shrink-0"
                            style={{
                              backgroundColor: 'rgba(18, 66, 48, 0.96)',
                              border: '1px solid rgba(109, 213, 176, 0.85)',
                              color: COLORS.mint,
                              boxShadow: '0 0 12px rgba(109, 213, 176, 0.35)',
                            }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: COLORS.mint }} />
                            CONNECTED
                          </span>
                        )}
                        {isConnectingCard && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[9.5px] font-bold tracking-wider uppercase shrink-0"
                            style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}
                          >
                            CONNECTING
                          </span>
                        )}
                        {isActiveNode && !isConnectedCard && !isConnectingCard && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase shrink-0"
                            style={{
                              backgroundColor: 'rgba(92, 34, 38, 0.85)',
                              border: '1px solid rgba(255, 130, 120, 0.45)',
                              color: '#FFD4D0',
                            }}
                          >
                            SELECTED
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] truncate mt-0.5" style={{ color: isConnectedCard ? '#BCE3D4' : isActiveNode ? '#D2B7B6' : COLORS.textMuted }}>
                        {node.isp} — <span className="font-mono text-[10.5px]">{node.sni}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0 relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => handleSyncQuota(e, node.id)}
                      title="Sync 3x-ui Inbound Data Quota"
                      className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-black/20"
                      style={{ color: hasQuotaSynced ? COLORS.mint : COLORS.textMuted }}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingQuota ? 'animate-spin' : ''}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleStarNode(node.id)}
                      title={node.starred ? 'Unstar node' : 'Star node'}
                      className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-black/20"
                    >
                      <Star
                        className="w-3.5 h-3.5"
                        fill={node.starred ? COLORS.amber : 'none'}
                        style={{ color: node.starred ? COLORS.amber : COLORS.textMuted }}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => setOpenMenuId(isMenuOpen ? null : node.id)}
                      title="Node options"
                      className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-black/20"
                      style={{ color: COLORS.textMuted }}
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>

                    <AnimatePresence>
                      {isMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.96, y: openMenuUpward ? 4 : -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.96, y: openMenuUpward ? 4 : -4 }}
                          transition={{ duration: 0.12 }}
                          className={`absolute right-0 ${openMenuUpward ? 'bottom-8' : 'top-8'} w-[162px] rounded-[14px] p-1 z-50 shadow-2xl`}
                          style={GLASS_MODAL}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              setOpenMenuId(null);
                              handleSyncQuota(e, node.id);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-[9px] text-[11.5px] font-medium flex items-center gap-2 cursor-pointer hover:bg-[#312829]"
                            style={{ color: COLORS.textPrimary }}
                          >
                            <RefreshCw className="w-3.5 h-3.5" style={{ color: COLORS.mint }} />
                            <span>Sync 3x-ui Quota</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              setEditNodeModal(node);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-[9px] text-[11.5px] font-medium flex items-center gap-2 cursor-pointer hover:bg-[#312829]"
                            style={{ color: COLORS.textPrimary }}
                          >
                            <Edit3 className="w-3.5 h-3.5" style={{ color: COLORS.textMuted }} />
                            <span>Edit Node</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              setShareNodeModal(node);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-[9px] text-[11.5px] font-medium flex items-center gap-2 cursor-pointer hover:bg-[#312829]"
                            style={{ color: COLORS.textPrimary }}
                          >
                            <Share2 className="w-3.5 h-3.5" style={{ color: COLORS.amber }} />
                            <span>Share QR</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setOpenMenuId(null);
                              await copyClipboard(node.uri);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-[9px] text-[11.5px] font-medium flex items-center gap-2 cursor-pointer hover:bg-[#312829]"
                            style={{ color: COLORS.textPrimary }}
                          >
                            <Copy className="w-3.5 h-3.5" style={{ color: COLORS.textMuted }} />
                            <span>Copy URI</span>
                          </button>
                          <div className="my-1 h-px" style={{ backgroundColor: '#342A2B' }} />
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              deleteNode(node.id);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-[9px] text-[11.5px] font-medium flex items-center gap-2 cursor-pointer hover:bg-[#3F1B1D]"
                            style={{ color: COLORS.coral }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => handleSinglePing(e, node.id)}
                    title="Click to test real node latency"
                    className="px-2 py-0.5 rounded-[7px] font-mono tabular-nums text-[11px] font-semibold cursor-pointer transition-colors duration-150 hover:opacity-90"
                    style={{
                      backgroundColor: COLORS.amberBg,
                      color: node.online || node.ping != null ? COLORS.amber : COLORS.textMuted,
                    }}
                  >
                    {testingAllPings
                      ? '...ms'
                      : node.ping != null
                      ? `${node.ping}ms`
                      : node.online
                      ? 'Online'
                      : 'Ping'}
                  </button>
                  <span
                    className="px-2 py-0.5 rounded-[7px] font-mono text-[10.5px] font-semibold"
                    style={{
                      backgroundColor: node.vcn
                        ? COLORS.amberBg
                        : isConnectedCard
                        ? 'rgba(20, 48, 37, 0.9)'
                        : isActiveNode
                        ? '#2A1C1C'
                        : '#151213',
                      border: `1px solid ${
                        node.vcn
                          ? 'rgba(230, 194, 128, 0.35)'
                          : isConnectedCard
                          ? 'rgba(109, 213, 176, 0.38)'
                          : isActiveNode
                          ? '#523837'
                          : '#2A2324'
                      }`,
                      color: node.vcn ? COLORS.amber : isConnectedCard ? COLORS.mint : isActiveNode ? '#DFC7C6' : COLORS.textMuted,
                    }}
                  >
                    {node.protocol}
                  </span>
                  {node.quotaEmail && (
                    <span
                      className="px-2 py-0.5 rounded-[7px] font-mono text-[10px] truncate max-w-[130px]"
                      style={{ backgroundColor: '#1E2C27', color: COLORS.mint }}
                    >
                      {node.quotaEmail}
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10px] font-mono tabular-nums mb-0.5">
                    <span style={{ color: isConnectedCard ? '#BCE3D4' : isActiveNode ? '#CCB1B0' : COLORS.textMuted }}>
                      {isSyncingQuota
                        ? 'Syncing 3x-ui Quota...'
                        : `Used: ${formatUsageData(node.quotaUsedGB || 0)}`}
                    </span>
                    <span style={{ color: COLORS.textPrimary }}>
                      {node.quotaTotalGB > 0
                        ? `Left: ${remainingGB.toFixed(1)} GB / ${node.quotaTotalGB.toFixed(1)} GB`
                        : hasQuotaSynced
                        ? 'Unlimited Plan'
                        : isSyncingQuota
                        ? 'Updating...'
                        : 'Auto-Sync'}
                    </span>
                  </div>
                  <WavyQuotaBar
                    usedGB={node.quotaUsedGB || 0}
                    totalGB={node.quotaTotalGB || 0}
                    isConnectedCard={isActiveNode || isConnectedCard}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ============================================================================
// SCREEN 3: SPEED & TELEMETRY
// ============================================================================
function SpeedScreen() {
  const {
    nodes,
    activeNode,
    speedHistory,
    setSpeedHistory,
    clearSpeedHistory,
    speedTestActive,
    setSpeedTestActive,
    speedTestProgress,
    downHistory,
    upHistory,
    totalSessionBytes,
    connectionStatus,
    pushToast,
  } = useMetro();

  const [selectedTestNodeId, setSelectedTestNodeId] = useState(activeNode?.id || '');
  const [serverDropdownOpen, setServerDropdownOpen] = useState(false);

  useEffect(() => {
    if (!nodes.some((n) => n.id === selectedTestNodeId)) {
      setSelectedTestNodeId(activeNode?.id || nodes[0]?.id || '');
    }
  }, [nodes, activeNode, selectedTestNodeId]);

  const testNode = useMemo(
    () => nodes.find((n) => n.id === selectedTestNodeId) || activeNode,
    [nodes, selectedTestNodeId, activeNode]
  );

  const [phase, setPhase] = useState('ready');
  const [gaugeSpeed, setGaugeSpeed] = useState(0);
  const [gaugeFraction, setGaugeFraction] = useState(0.06);
  const [metrics, setMetrics] = useState({
    ping: testNode?.ping ?? 0,
    jitter: 0,
    download: 0,
    upload: 0,
  });

  const smoothGaugeSpeed = useSmoothedNumber(gaugeSpeed, 280);
  const smoothGaugeFraction = useSmoothedNumber(gaugeFraction, 300);
  const [wavePhase, setWavePhase] = useState(0);

  useEffect(() => {
    if (!speedTestActive) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setWavePhase((p) => (p + dt * 4.2) % (Math.PI * 2));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speedTestActive]);

  const [bars, setBars] = useState(() => Array(22).fill(12));

  useEffect(() => {
    if (!speedTestProgress) return;
    setPhase(speedTestProgress.phase);
    if (speedTestProgress.mbps != null) {
      setGaugeSpeed(speedTestProgress.mbps);
      const maxScale = speedTestProgress.phase === 'upload' ? 50 : 100;
      setGaugeFraction(Math.min(0.98, Math.max(0.06, speedTestProgress.mbps / maxScale)));
    }
    setMetrics((prev) => ({
      ping: speedTestProgress.pingMs ?? prev.ping,
      jitter: speedTestProgress.jitterMs ?? prev.jitter,
      download: speedTestProgress.downloadMbps ?? prev.download,
      upload: speedTestProgress.uploadMbps ?? prev.upload,
    }));
  }, [speedTestProgress]);

  const latestDownMbps = downHistory[downHistory.length - 1] || 0;
  const latestUpMbps = upHistory[upHistory.length - 1] || 0;
  const liveThroughputRef = useRef({ mbps: 0, active: false });
  useEffect(() => {
    liveThroughputRef.current = {
      mbps: speedTestActive ? gaugeSpeed : latestDownMbps + latestUpMbps,
      active: connectionStatus === 'connected' || speedTestActive,
    };
  }, [latestDownMbps, latestUpMbps, speedTestActive, gaugeSpeed, connectionStatus]);

  // Rolling 22-bar live telemetry ring fed every 350ms from real Xray throughput
  useEffect(() => {
    const tick = () => {
      const { mbps, active } = liveThroughputRef.current;
      let nextHeight = 10;
      if (active) {
        if (mbps > 0.002) {
          // Logarithmic scaling so KB/s browsing AND 100+ Mbps speed tests both read clearly
          const norm = Math.log10(1 + mbps * 25) / Math.log10(1 + 100 * 25);
          nextHeight = Math.max(20, Math.min(96, Math.round(18 + norm * 78)));
        } else {
          nextHeight = 16;
        }
      }
      setBars((prev) => [...prev.slice(1), nextHeight]);
    };
    tick();
    const id = setInterval(tick, 350);
    return () => clearInterval(id);
  }, []);

  const downReadout = formatThroughput(latestDownMbps);
  const upReadout = formatThroughput(latestUpMbps);
  const totalBytesGB = ((totalSessionBytes?.down || 0) + (totalSessionBytes?.up || 0)) / 1073741824;

  const startSpeedTest = async () => {
    if (speedTestActive || !testNode) return;
    if (!IN_TAURI) {
      pushToast('Speed test requires Windows Tauri backend', 'amber');
      return;
    }

    setSpeedTestActive(true);
    setPhase('ping');
    setGaugeSpeed(0);
    setGaugeFraction(0.06);
    setMetrics({ ping: testNode.ping ?? 0, jitter: 0, download: 0, upload: 0 });

    try {
      const entry = await invokeCmd('run_speed_test', { serverId: testNode.id });
      setPhase('complete');
      setGaugeSpeed(entry.download);
      setGaugeFraction(Math.min(0.96, entry.download / 100));
      setMetrics({
        ping: entry.ping,
        jitter: entry.jitter,
        download: entry.download,
        upload: entry.upload,
      });
      setSpeedHistory((prev) => [entry, ...prev].slice(0, 10));
      pushToast(`Speed test complete: ↓ ${entry.download} / ↑ ${entry.upload} Mbps`, 'success');
    } catch (err) {
      setPhase('ready');
      pushToast(`Speed test failed: ${String(err)}`, 'amber');
    } finally {
      setSpeedTestActive(false);
    }
  };

  const statusPillLabel =
    phase === 'ping'
      ? 'TESTING PING'
      : phase === 'download'
      ? 'TESTING DOWNLOAD'
      : phase === 'upload'
      ? 'TESTING UPLOAD'
      : phase === 'complete'
      ? 'TEST COMPLETE'
      : 'READY';

  const trackArcPath = useMemo(() => generateSmoothArcPath(130, 130, 102, 135, 270), []);
  const wavyArc = useMemo(
    () =>
      generateWavyArcPath(
        130,
        130,
        102,
        smoothGaugeFraction,
        135,
        270,
        speedTestActive ? 3.4 : 2.5,
        20,
        wavePhase
      ),
    [smoothGaugeFraction, speedTestActive, wavePhase]
  );
  const gaugeStrokeColor = phase === 'upload' ? COLORS.neonUp : COLORS.neonDown;

  return (
    <motion.div
      key="screen-speed"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      className="flex flex-col gap-2.5 pb-2"
    >
      {/* Server selector */}
      <div
        className="rounded-[18px] p-3 flex items-center justify-between gap-2 relative"
        style={GLASS_CARD}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <IspBadge node={testNode} size={36} isActive={Boolean(testNode)} />
          <div className="min-w-0">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.1em]" style={{ color: COLORS.textMuted }}>
              Test Server
            </div>
            <div className="font-jakarta font-bold text-[13px] truncate" style={{ color: COLORS.textPrimary }}>
              {testNode?.name || 'No Server Selected'}
            </div>
            <div className="text-[11px] font-mono tabular-nums truncate" style={{ color: COLORS.textMuted }}>
              {testNode ? (
                <>
                  {testNode.isp} • <span style={{ color: COLORS.amber }}>{testNode.ping != null ? `${testNode.ping} ms` : '— ms'}</span>
                </>
              ) : (
                'Add a server to test speed'
              )}
            </div>
          </div>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setServerDropdownOpen((o) => !o)}
            className="h-[30px] px-3 rounded-full text-[11.5px] font-semibold flex items-center gap-1 cursor-pointer transition-colors duration-150 hover:bg-[#5C4341]"
            style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary, border: '1px solid rgba(255,200,196,0.2)' }}
          >
            <span>Change</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <AnimatePresence>
            {serverDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-9 w-[230px] max-h-[200px] overflow-y-auto custom-scrollbar rounded-[16px] p-1.5 z-40 shadow-2xl"
                style={GLASS_MODAL}
              >
                {nodes.length === 0 ? (
                  <div className="px-3 py-2 text-[11px]" style={{ color: COLORS.textMuted }}>
                    No servers imported yet
                  </div>
                ) : (
                  nodes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        setSelectedTestNodeId(n.id);
                        setServerDropdownOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-[10px] flex items-center justify-between text-left text-[11.5px] cursor-pointer hover:bg-[#312728]"
                      style={{
                        backgroundColor: n.id === testNode?.id ? COLORS.surfaceActive : 'transparent',
                        color: COLORS.textPrimary,
                      }}
                    >
                      <span className="truncate font-medium pr-2">{n.name}</span>
                      <span className="font-mono tabular-nums text-[10.5px]" style={{ color: COLORS.amber }}>
                        {n.ping != null ? `${n.ping}ms` : '—'}
                      </span>
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Smooth Neon Gauge + Test Button */}
      <div
        className="rounded-[22px] px-4 py-3.5 flex flex-col items-center justify-center relative"
        style={GLASS_CARD}
      >
        <div className="relative w-[196px] h-[178px] flex items-center justify-center">
          <svg viewBox="0 0 260 245" className="w-full h-full overflow-visible">
            <defs>
              <filter id="gaugeNeonGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path d={trackArcPath} fill="none" stroke="rgba(255,224,222,0.09)" strokeWidth="8" strokeLinecap="round" />
            {wavyArc.d && (
              <>
                <path
                  d={wavyArc.d}
                  fill="none"
                  stroke={gaugeStrokeColor}
                  strokeWidth="4.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#gaugeNeonGlow)"
                />
                {wavyArc.endPt && (
                  <g filter="url(#gaugeNeonGlow)">
                    <circle cx={wavyArc.endPt.x} cy={wavyArc.endPt.y} r="7" fill={gaugeStrokeColor} fillOpacity="0.32" />
                    <circle cx={wavyArc.endPt.x} cy={wavyArc.endPt.y} r="4" fill={gaugeStrokeColor} />
                    <circle cx={wavyArc.endPt.x} cy={wavyArc.endPt.y} r="1.7" fill="#FFF7F6" />
                  </g>
                )}
              </>
            )}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center pt-3">
            <span
              className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-[0.1em] uppercase"
              style={{
                backgroundColor: speedTestActive ? COLORS.surfaceActive : 'rgba(26, 20, 21, 0.78)',
                border: `1px solid ${speedTestActive ? COLORS.surfaceActiveBorder : 'rgba(255,224,222,0.12)'}`,
                color: phase === 'upload' ? COLORS.amber : speedTestActive ? COLORS.coral : COLORS.textMuted,
              }}
            >
              {statusPillLabel}
            </span>
            <div
              className="mt-1.5 font-mono tabular-nums text-[38px] font-bold leading-none tracking-[-0.03em]"
              style={{ color: COLORS.textPrimary }}
            >
              {smoothGaugeSpeed.toFixed(1)}
            </div>
            <span className="mt-0.5 font-mono text-[11.5px] font-medium" style={{ color: COLORS.textMuted }}>
              Mbps
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={startSpeedTest}
          disabled={speedTestActive || !testNode}
          className="-mt-1 h-[34px] px-5 rounded-full font-jakarta font-semibold text-[12.5px] flex items-center gap-2 cursor-pointer transition-colors duration-150 hover:bg-[#5C4341] disabled:opacity-60"
          style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary, border: '1px solid rgba(255,200,196,0.22)' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${speedTestActive ? 'animate-spin' : ''}`} />
          <span>{speedTestActive ? 'Running Test...' : 'Run Speed Test'}</span>
        </button>
      </div>

      {/* 4 Compact Stat Cards */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-[14px] p-2.5" style={GLASS_CARD}>
          <span className="text-[9px] font-bold uppercase tracking-wider block" style={{ color: COLORS.textMuted }}>
            Ping
          </span>
          <div className="mt-1 font-mono tabular-nums text-[15px] font-bold leading-none" style={{ color: COLORS.textPrimary }}>
            {metrics.ping}
            <span className="text-[10px] font-medium ml-0.5" style={{ color: COLORS.amber }}>
              ms
            </span>
          </div>
        </div>

        <div className="rounded-[14px] p-2.5" style={GLASS_CARD}>
          <span className="text-[9px] font-bold uppercase tracking-wider block" style={{ color: COLORS.textMuted }}>
            Jitter
          </span>
          <div className="mt-1 font-mono tabular-nums text-[15px] font-bold leading-none" style={{ color: COLORS.textPrimary }}>
            {metrics.jitter.toFixed(1)}
            <span className="text-[10px] font-medium ml-0.5" style={{ color: COLORS.textMuted }}>
              ms
            </span>
          </div>
        </div>

        <div className="rounded-[14px] p-2.5" style={GLASS_CARD}>
          <span className="text-[9px] font-bold uppercase tracking-wider block" style={{ color: COLORS.coral }}>
            Down
          </span>
          <div className="mt-1 font-mono tabular-nums text-[15px] font-bold leading-none" style={{ color: COLORS.textPrimary }}>
            {metrics.download.toFixed(1)}
          </div>
        </div>

        <div className="rounded-[14px] p-2.5" style={GLASS_CARD}>
          <span className="text-[9px] font-bold uppercase tracking-wider block" style={{ color: COLORS.amber }}>
            Up
          </span>
          <div className="mt-1 font-mono tabular-nums text-[15px] font-bold leading-none" style={{ color: COLORS.textPrimary }}>
            {metrics.upload.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Live Rolling Telemetry Stream */}
      <div className="rounded-[20px] p-3.5 flex flex-col gap-2.5" style={GLASS_CARD}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded-[9px] flex items-center justify-center shrink-0"
              style={{ backgroundColor: '#361A1C', color: COLORS.coral }}
            >
              <Activity className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-jakarta font-bold text-[13px] truncate" style={{ color: COLORS.textPrimary }}>
                Realtime Telemetry Stream
              </h3>
              <p className="text-[10.5px] font-mono tabular-nums truncate" style={{ color: COLORS.textMuted }}>
                ↓ {downReadout.value} {downReadout.unit} • ↑ {upReadout.value} {upReadout.unit} • Session {formatUsageData(totalBytesGB)}
              </p>
            </div>
          </div>

          <span
            className="px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold shrink-0 inline-flex items-center gap-1"
            style={{
              backgroundColor: COLORS.obsidian,
              border: `1px solid ${COLORS.surfaceBorder}`,
              color: connectionStatus === 'connected' || speedTestActive ? COLORS.mint : COLORS.textMuted,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: connectionStatus === 'connected' || speedTestActive ? COLORS.mint : '#7B6D6E' }}
            />
            {speedTestActive ? 'Benchmark' : connectionStatus === 'connected' ? 'Live' : 'Idle'}
          </span>
        </div>

        <div
          className="h-[64px] rounded-[14px] px-3 py-2 flex items-end justify-between gap-1"
          style={{ backgroundColor: COLORS.obsidian, border: '1px solid #262021' }}
        >
          {bars.map((pct, idx) => {
            const isCoral = idx % 2 === 0;
            return (
              <div
                key={idx}
                className="flex-1 rounded-full transition-all duration-200"
                style={{
                  height: `${pct}%`,
                  backgroundColor: isCoral ? COLORS.coral : COLORS.amber,
                  opacity: connectionStatus === 'connected' || speedTestActive ? 0.92 : 0.35,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Recent History */}
      <div
        className="rounded-[20px] p-3.5 flex flex-col"
        style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}
      >
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <h3 className="font-jakarta font-bold text-[13px]" style={{ color: COLORS.textPrimary }}>
              Recent Tests
            </h3>
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ backgroundColor: '#272122', color: COLORS.textMuted }}
            >
              {speedHistory.length}
            </span>
          </div>
          {speedHistory.length > 0 && (
            <button
              type="button"
              onClick={clearSpeedHistory}
              className="text-[11px] font-semibold cursor-pointer hover:underline"
              style={{ color: COLORS.coral }}
            >
              Clear
            </button>
          )}
        </div>

        {speedHistory.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-[11.5px]" style={{ color: COLORS.textMuted }}>
              No speed tests recorded yet.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {speedHistory.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="rounded-[14px] px-3 py-2 flex items-center justify-between gap-2"
                style={{ backgroundColor: '#161314', border: '1px solid #282122' }}
              >
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold truncate" style={{ color: COLORS.textPrimary }}>
                    {item.serverName}
                  </div>
                  <div className="text-[10.5px] font-mono tabular-nums" style={{ color: COLORS.textMuted }}>
                    {item.timestamp} • <span style={{ color: COLORS.amber }}>{item.ping}ms</span>
                  </div>
                </div>

                <div className="text-right font-mono tabular-nums shrink-0 text-[11px]">
                  <div className="font-bold" style={{ color: COLORS.coral }}>
                    ↓ {item.download.toFixed(1)} Mbps
                  </div>
                  <div className="font-semibold" style={{ color: COLORS.amber }}>
                    ↑ {item.upload.toFixed(1)} Mbps
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// SCREEN 4: SETTINGS
// ============================================================================
const TUNNEL_PROFILES = [
  { id: 'Strict VCN', subtitle: 'Recommended', detail: 'uTLS + Strict VCN framing' },
  { id: 'TLS Frag', subtitle: 'DPI Bypass', detail: 'Chunked ClientHello packets' },
  { id: 'Standard', subtitle: 'Direct TLS', detail: 'Native Xray TLS 1.3 stream' },
];

function SectionHeader({ title, badge }) {
  return (
    <div className="flex items-center justify-between mb-2.5 px-1">
      <h2 className="font-jakarta font-bold text-[15px]" style={{ color: COLORS.textPrimary }}>
        {title}
      </h2>
      <span
        className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
        style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}
      >
        {badge}
      </span>
    </div>
  );
}

const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'tun', label: 'TUN & DNS' },
  { id: 'about', label: 'About & Guide' },
];

function SettingsScreen() {
  const {
    connectionStatus,
    settingsNeedsReconnect,
    applySettingsAndReconnect,
    resetSettingsToDefault,
    persistSettingsPatch,
    systemMode,
    setSystemMode,
    lanProxySharing,
    setLanProxySharing,
    localLanIp,
    setLocalLanIp,
    autoConnectOnLaunch,
    closeToTray,
    autoCheckUpdates,
    setAutoCheckUpdates,
    tunnelProfile,
    setTunnelProfile,
    splitTunneling,
    setSplitTunneling,
    windowsApps,
    setAppsModalOpen,
    bypassLan,
    setBypassLan,
    dnsResolver,
    setDnsResolver,
    customDohUrl,
    setCustomDohUrl,
    mtu,
    setMtu,
    certPinning,
    setCertPinning,
    startWithWindows,
    setStartWithWindows,
    checkForUpdates,
    checkingUpdate,
    updateInfo,
    setUpdateModalOpen,
    downloadingUpdate,
    updateDownloadProgress,
    downloadAndInstallUpdate,
    setLogsDrawerOpen,
    setOnboardingOpen,
    settingsTab,
    setSettingsTab,
    appendLog,
    pushToast,
  } = useMetro();

  const [refreshingIp, setRefreshingIp] = useState(false);
  const bypassedCount = windowsApps.filter((a) => a.bypassed).length;
  const activeTab = SETTINGS_TABS.some((t) => t.id === settingsTab) ? settingsTab : 'general';

  const handleRefreshIp = async () => {
    if (refreshingIp) return;
    setRefreshingIp(true);
    try {
      const nextIp = IN_TAURI ? await invokeCmd('refresh_local_ip') : localLanIp;
      setLocalLanIp(nextIp);
      appendLog('Info', `Adapter IP refreshed -> ${nextIp}:10808 (SOCKS5) / :10809 (HTTP)`);
      pushToast(`Active adapter IP: ${nextIp}`, 'success');
    } catch (err) {
      pushToast(String(err), 'amber');
    } finally {
      setRefreshingIp(false);
    }
  };

  const handleCopyProxy = async (port) => {
    const proxy = `${localLanIp}:${port}`;
    await copyClipboard(proxy);
    pushToast(`Copied LAN proxy ${proxy}`, 'success');
  };

  return (
    <motion.div
      key="screen-settings"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      className="flex flex-col gap-3 pb-4"
    >
      {/* Clean 3-Tab Switcher */}
      <div
        className="rounded-[16px] p-1 grid grid-cols-3 gap-1 sticky top-0 z-20"
        style={GLASS_CARD}
      >
        {SETTINGS_TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSettingsTab(t.id)}
              className="py-1.5 px-2 rounded-[12px] text-[12px] font-semibold flex items-center justify-center cursor-pointer transition-colors duration-150"
              style={{
                backgroundColor: active ? COLORS.crimson : 'transparent',
                color: active ? COLORS.textPrimary : COLORS.textMuted,
                border: `1px solid ${active ? 'rgba(255, 130, 120, 0.45)' : 'transparent'}`,
                boxShadow: active ? '0 4px 14px -4px rgba(255, 84, 73, 0.5)' : 'none',
              }}
            >
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Pending Reconnect Banner */}
      {settingsNeedsReconnect && connectionStatus === 'connected' && (
        <div
          className="rounded-[16px] px-3.5 py-2.5 flex items-center justify-between gap-2"
          style={{ backgroundColor: 'rgba(58, 47, 27, 0.78)', border: '1px solid rgba(230, 194, 128, 0.35)', backdropFilter: 'blur(16px)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" style={{ color: COLORS.amber }} />
            <span className="text-[11.5px] font-medium truncate" style={{ color: COLORS.textPrimary }}>
              Reconnect tunnel to apply changes
            </span>
          </div>
          <button
            type="button"
            onClick={applySettingsAndReconnect}
            className="h-[28px] px-3 rounded-full text-[11px] font-semibold cursor-pointer shrink-0"
            style={{ backgroundColor: COLORS.crimson, color: COLORS.textPrimary, border: '1px solid #BC1F27' }}
          >
            Reconnect
          </button>
        </div>
      )}

      {/* TAB 1: GENERAL */}
      {activeTab === 'general' && (
        <div className="flex flex-col gap-3">
          {/* Tunneling Profile */}
          <div className="rounded-[20px] p-3.5 flex flex-col gap-2.5" style={GLASS_CARD}>
            <div className="flex items-center justify-between">
              <span className="font-jakarta font-bold text-[13.5px]" style={{ color: COLORS.textPrimary }}>
                Tunneling Profile
              </span>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}>
                DPI Bypass
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TUNNEL_PROFILES.map((prof) => {
                const active = tunnelProfile === prof.id;
                return (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => setTunnelProfile(prof.id)}
                    className="rounded-[14px] p-2.5 text-left cursor-pointer transition-colors duration-150"
                    style={active ? GLASS_ACTIVE : GLASS_INSET}
                  >
                    <div className="font-jakarta font-bold text-[12px] truncate" style={{ color: COLORS.textPrimary }}>
                      {prof.id}
                    </div>
                    <div className="text-[10px] mt-0.5 leading-tight" style={{ color: active ? COLORS.amber : COLORS.textMuted }}>
                      {prof.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Startup & Tray Behavior */}
          <div className="rounded-[20px] p-3.5 flex flex-col gap-3" style={GLASS_CARD}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold" style={{ color: COLORS.textPrimary }}>
                  Auto-Connect on Launch
                </div>
                <p className="text-[11px]" style={{ color: COLORS.textMuted }}>
                  Connect last selected server automatically
                </p>
              </div>
              <M3ExpressiveSwitch
                checked={autoConnectOnLaunch}
                onChange={(v) => persistSettingsPatch({ autoConnectOnLaunch: v }, { affectsTunnel: false })}
                ariaLabel="Auto-Connect on Launch"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2.5 border-t" style={{ borderColor: '#292223' }}>
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold" style={{ color: COLORS.textPrimary }}>
                  Start with Windows
                </div>
                <p className="text-[11px]" style={{ color: COLORS.textMuted }}>
                  Launch silently in system tray at sign-in
                </p>
              </div>
              <M3ExpressiveSwitch
                checked={startWithWindows}
                onChange={setStartWithWindows}
                ariaLabel="Start with Windows"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2.5 border-t" style={{ borderColor: '#292223' }}>
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold" style={{ color: COLORS.textPrimary }}>
                  Minimize to Tray on Close
                </div>
                <p className="text-[11px]" style={{ color: COLORS.textMuted }}>
                  Keep VPN running when clicking X
                </p>
              </div>
              <M3ExpressiveSwitch
                checked={closeToTray}
                onChange={(v) => persistSettingsPatch({ closeToTray: v }, { affectsTunnel: false })}
                ariaLabel="Minimize to Tray on Close"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2.5 border-t" style={{ borderColor: '#292223' }}>
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold" style={{ color: COLORS.textPrimary }}>
                  Bypass LAN &amp; Local IPs
                </div>
                <p className="text-[11px]" style={{ color: COLORS.textMuted }}>
                  Keep router &amp; printer traffic direct
                </p>
              </div>
              <M3ExpressiveSwitch checked={bypassLan} onChange={setBypassLan} ariaLabel="Bypass LAN" />
            </div>
          </div>

          {/* Fixed Inbound Ports (10808 SOCKS5 & 10809 HTTP) & LAN Sharing */}
          <div className="rounded-[20px] p-3.5 flex flex-col gap-3" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}>
            <div className="flex items-center justify-between">
              <span className="font-jakarta font-bold text-[12.5px]" style={{ color: COLORS.textPrimary }}>
                Fixed Inbound Proxy Ports
              </span>
              <span
                className="px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase"
                style={{ backgroundColor: '#1E332B', color: COLORS.mint }}
              >
                FIXED • ANDROID SYNCED
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div
                className="rounded-[12px] px-3 py-2 flex items-center justify-between"
                style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}` }}
              >
                <div>
                  <span className="text-[10px] font-semibold uppercase block" style={{ color: COLORS.textMuted }}>
                    SOCKS5 Inbound
                  </span>
                  <span className="font-mono text-[13px] font-bold" style={{ color: COLORS.textPrimary }}>
                    127.0.0.1:10808
                  </span>
                </div>
                <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: COLORS.amber }} />
              </div>

              <div
                className="rounded-[12px] px-3 py-2 flex items-center justify-between"
                style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}` }}
              >
                <div>
                  <span className="text-[10px] font-semibold uppercase block" style={{ color: COLORS.textMuted }}>
                    HTTP Inbound
                  </span>
                  <span className="font-mono text-[13px] font-bold" style={{ color: COLORS.textPrimary }}>
                    127.0.0.1:10809
                  </span>
                </div>
                <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: COLORS.amber }} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t" style={{ borderColor: '#292223' }}>
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold" style={{ color: COLORS.textPrimary }}>
                  Share VPN on LAN / Wi-Fi
                </div>
                <p className="text-[11px]" style={{ color: COLORS.textMuted }}>
                  Allow phone/PS5 on same Wi-Fi to connect
                </p>
              </div>
              <M3ExpressiveSwitch checked={lanProxySharing} onChange={setLanProxySharing} ariaLabel="LAN Proxy Sharing" />
            </div>

            {lanProxySharing && (
              <div className="rounded-[12px] p-2.5 flex items-center justify-between gap-2" style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}` }}>
                <span className="font-mono text-[11px] truncate" style={{ color: COLORS.amber }}>
                  SOCKS {localLanIp}:10808 • HTTP :10809
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleRefreshIp}
                    className="p-1.5 rounded-full cursor-pointer hover:bg-[#241E1F]"
                    style={{ color: COLORS.textMuted }}
                    title="Refresh LAN IP"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingIp ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyProxy(10808)}
                    className="px-2.5 py-1 rounded-full text-[10.5px] font-semibold cursor-pointer"
                    style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Core Tools */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setLogsDrawerOpen(true)}
              className="flex-1 h-[34px] px-3 rounded-full text-[11.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 hover:bg-[#5C4341]"
              style={{ backgroundColor: COLORS.taupe, border: '1px solid #634947', color: COLORS.textPrimary }}
            >
              <Terminal className="w-3.5 h-3.5" style={{ color: COLORS.amber }} />
              <span>Xray Core Logs</span>
            </button>

            <button
              type="button"
              onClick={resetSettingsToDefault}
              className="h-[34px] px-3.5 rounded-full text-[11.5px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors duration-150 hover:bg-[#241E1F]"
              style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.coral }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: TUN & DNS (With Simple Plain-English Proxy vs TUN Knowledge) */}
      {activeTab === 'tun' && (
        <div className="flex flex-col gap-3">
          {/* Plain-English Guide: System Proxy vs TUN Mode */}
          <div className="rounded-[20px] p-3.5 flex flex-col gap-2.5" style={GLASS_CARD}>
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" style={{ color: COLORS.amber }} />
              <span className="font-jakarta font-bold text-[13px]" style={{ color: COLORS.textPrimary }}>
                Which Windows Mode Should You Use?
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setSystemMode('TUN')}
                className="rounded-[14px] p-3 text-left cursor-pointer transition-colors duration-150"
                style={systemMode === 'TUN' ? GLASS_ACTIVE : GLASS_INSET}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-jakarta font-bold text-[12.5px]" style={{ color: COLORS.textPrimary }}>
                    TUN Mode (Full PC Tunnel)
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold" style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}>
                    DEFAULT • ADMIN • WINTUN
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: systemMode === 'TUN' ? '#DFC7C6' : COLORS.textMuted }}>
                  Creates a virtual network adapter (<span className="font-mono">Metrovpn-TUN</span>) so 100% of apps, games &amp; UDP traffic go through the VPN.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSystemMode('PROXY')}
                className="rounded-[14px] p-3 text-left cursor-pointer transition-colors duration-150"
                style={systemMode === 'PROXY' ? GLASS_ACTIVE : GLASS_INSET}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-jakarta font-bold text-[12.5px]" style={{ color: COLORS.textPrimary }}>
                    System Proxy Mode
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold" style={{ backgroundColor: '#1E332B', color: COLORS.mint }}>
                    BROWSERS &amp; CHAT
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: systemMode === 'PROXY' ? '#DFC7C6' : COLORS.textMuted }}>
                  Routes Chrome, Edge, Telegram &amp; Discord instantly on fixed HTTP port <span className="font-mono">10809</span> without creating a virtual adapter.
                </p>
              </button>
            </div>
          </div>

          {/* MTU & Split Tunneling */}
          <div className="rounded-[20px] p-3.5 flex flex-col gap-3" style={GLASS_CARD}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold" style={{ color: COLORS.textPrimary }}>
                  Split Tunneling (Bypass Apps)
                </div>
                <p className="text-[11px]" style={{ color: COLORS.textMuted }}>
                  Let selected games/apps use direct Wi-Fi
                </p>
              </div>
              <M3ExpressiveSwitch checked={splitTunneling} onChange={setSplitTunneling} ariaLabel="Split Tunneling" />
            </div>

            {splitTunneling && (
              <button
                type="button"
                onClick={() => setAppsModalOpen(true)}
                className="w-full h-[36px] px-3.5 rounded-[12px] flex items-center justify-between cursor-pointer transition-colors duration-150 hover:bg-[#2A2223]"
                style={GLASS_INSET}
              >
                <div className="flex items-center gap-2">
                  <AppWindow className="w-4 h-4" style={{ color: COLORS.coral }} />
                  <span className="text-[12px] font-semibold" style={{ color: COLORS.textPrimary }}>
                    Scan PC &amp; Select Apps (.exe)
                  </span>
                </div>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}>
                  {bypassedCount} Bypassed
                </span>
              </button>
            )}

            <div className="pt-2 border-t flex items-center justify-between gap-2" style={{ borderColor: 'rgba(255,224,222,0.08)' }}>
              <span className="text-[12px] font-semibold" style={{ color: COLORS.textPrimary }}>
                TUN Adapter MTU
              </span>
              <div className="flex items-center gap-1">
                {MTU_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMtu(m)}
                    className="px-2 py-1 rounded-full font-mono text-[11px] font-semibold cursor-pointer transition-colors duration-150"
                    style={{
                      backgroundColor: mtu === m ? COLORS.crimson : COLORS.obsidian,
                      color: mtu === m ? COLORS.textPrimary : COLORS.textMuted,
                      border: `1px solid ${mtu === m ? '#BC1F27' : COLORS.surfaceBorder}`,
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* DNS & VCN Security */}
          <div className="rounded-[20px] p-3.5 flex flex-col gap-3" style={GLASS_CARD}>
            <div>
              <div className="text-[12.5px] font-semibold mb-2" style={{ color: COLORS.textPrimary }}>
                DNS Resolver (Zero-Rating Safe)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DNS_OPTIONS.map((opt) => {
                  const active = dnsResolver === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setDnsResolver(opt)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors duration-150"
                      style={{
                        backgroundColor: active ? COLORS.taupe : COLORS.obsidian,
                        color: active ? COLORS.textPrimary : COLORS.textMuted,
                        border: `1px solid ${active ? 'rgba(255,200,196,0.28)' : COLORS.surfaceBorder}`,
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {dnsResolver === 'Custom DoH' && (
                <input
                  type="url"
                  value={customDohUrl}
                  onChange={(e) => setCustomDohUrl(e.target.value)}
                  placeholder="https://dns.quad9.net/dns-query"
                  className="mt-2 w-full h-[34px] rounded-[10px] px-2.5 font-mono text-[11.5px] focus:outline-none"
                  style={{ ...GLASS_INSET, color: COLORS.textPrimary }}
                />
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: 'rgba(255,224,222,0.08)' }}>
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold" style={{ color: COLORS.textPrimary }}>
                  Strict VCN Cert Pinning
                </div>
                <p className="text-[11px]" style={{ color: COLORS.textMuted }}>
                  Verify SNI &amp; peer certificate hostname
                </p>
              </div>
              <M3ExpressiveSwitch checked={certPinning} onChange={setCertPinning} ariaLabel="Strict VCN Cert Pinning" />
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ABOUT & GUIDE */}
      {activeTab === 'about' && (
        <div className="flex flex-col gap-3">
          <div className="rounded-[20px] p-4 flex flex-col gap-3.5" style={GLASS_CARD}>
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-[14px] flex items-center justify-center overflow-hidden shrink-0"
                style={{ backgroundColor: 'rgba(42, 26, 28, 0.78)', border: '1px solid rgba(255, 160, 150, 0.25)' }}
              >
                <img src={metrovpnApkIcon} alt="Metrovpn" className="w-7 h-7 object-contain" />
              </div>
              <div className="min-w-0">
                <img src={metrovpnWordmark} alt="Metrovpn" className="h-[20px] w-auto object-contain mb-0.5" />
                <div className="font-mono text-[11px] truncate" style={{ color: COLORS.textMuted }}>
                  v2.7.5 • Xray v26.11.9 • Fixed :10808/:10809
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-[14px]" style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}` }}>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold" style={{ color: COLORS.textPrimary }}>
                  Auto-Check for Updates
                </div>
                <p className="text-[10.5px]" style={{ color: COLORS.textMuted }}>
                  Automatically check GitHub Releases on launch
                </p>
              </div>
              <M3ExpressiveSwitch
                checked={autoCheckUpdates !== false}
                onChange={setAutoCheckUpdates}
                ariaLabel="Auto-Check for Updates"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOnboardingOpen(true)}
                className="h-[36px] px-3 rounded-full text-[11.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 hover:bg-[#241E1F]"
                style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.amber }}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Step-by-Step Tour</span>
              </button>
              <button
                type="button"
                onClick={checkForUpdates}
                disabled={checkingUpdate || downloadingUpdate}
                className="h-[36px] px-3 rounded-full text-[11.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 hover:bg-[#B50D17]"
                style={{ backgroundColor: COLORS.crimson, color: COLORS.textPrimary, border: '1px solid #BC1F27' }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                <span>{checkingUpdate ? 'Checking...' : 'Check Updates'}</span>
              </button>
            </div>

            {updateInfo && (
              <div
                className="rounded-[14px] p-3 flex flex-col gap-2"
                style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${updateInfo.updateAvailable ? COLORS.coral : COLORS.surfaceBorder}` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-semibold" style={{ color: updateInfo.updateAvailable ? COLORS.amber : COLORS.mint }}>
                    {updateInfo.updateAvailable
                      ? `New Update v${updateInfo.latestVersion} Ready!`
                      : `Up to date (v${updateInfo.currentVersion})`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateInfo.updateAvailable ? setUpdateModalOpen(true) : openExternalUrl(updateInfo.releaseUrl)
                    }
                    className="text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer hover:underline"
                    style={{ color: COLORS.coral }}
                  >
                    <span>{updateInfo.updateAvailable ? 'Details' : 'Releases'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                {updateInfo.updateAvailable && (
                  <button
                    type="button"
                    onClick={downloadAndInstallUpdate}
                    disabled={downloadingUpdate}
                    className="w-full h-[32px] px-3 rounded-full text-[11.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{ backgroundColor: COLORS.crimson, color: COLORS.textPrimary, border: '1px solid #BC1F27' }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {downloadingUpdate
                        ? `Downloading Update (${updateDownloadProgress?.percent || 0}%)...`
                        : `Auto-Update to v${updateInfo.latestVersion}`}
                    </span>
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: '#292223' }}>
              <button
                type="button"
                onClick={() => openExternalUrl('https://t.me/MetroVpnPaidProof')}
                className="rounded-[14px] p-3 flex items-center justify-between cursor-pointer transition-colors duration-150 hover:bg-[#241E1F]"
                style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}` }}
              >
                <div className="flex items-center gap-2.5 text-left">
                  <Send className="w-4 h-4 shrink-0" style={{ color: COLORS.coral }} />
                  <div>
                    <div className="font-jakarta font-semibold text-[12.5px]" style={{ color: COLORS.textPrimary }}>
                      Telegram Channel
                    </div>
                    <div className="font-mono text-[11px]" style={{ color: COLORS.textMuted }}>
                      @MetroVpnPaidProof
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5" style={{ color: COLORS.textMuted }} />
              </button>

              <button
                type="button"
                onClick={() => openExternalUrl('https://t.me/Metrodens_bot')}
                className="rounded-[14px] p-3 flex items-center justify-between cursor-pointer transition-colors duration-150 hover:bg-[#241E1F]"
                style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}` }}
              >
                <div className="flex items-center gap-2.5 text-left">
                  <Cpu className="w-4 h-4 shrink-0" style={{ color: COLORS.amber }} />
                  <div>
                    <div className="font-jakarta font-semibold text-[12.5px]" style={{ color: COLORS.textPrimary }}>
                      Telegram Bot
                    </div>
                    <div className="font-mono text-[11px]" style={{ color: COLORS.textMuted }}>
                      @Metrodens_bot
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5" style={{ color: COLORS.textMuted }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ============================================================================
// ADD CONFIG MODAL (VLESS / VMess / Trojan URI — Add Manually)
// ============================================================================
function AddConfigModal() {
  const {
    addModalOpen,
    setAddModalOpen,
    setNodes,
    setActiveNodeId,
    setActiveRoute,
    connectionStatus,
  } = useMetro();

  const [uriText, setUriText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const parsedUri = useMemo(() => parsePreviewNode(uriText, 'uri'), [uriText]);

  const handleClipboardPaste = async () => {
    setErrorMsg('');
    const text = await readClipboard();
    const low = String(text || '').toLowerCase();
    if (low.includes('vless://') || low.includes('vmess://') || low.includes('trojan://')) {
      setUriText(text.trim());
    } else {
      setErrorMsg('Clipboard does not contain a vless://, vmess://, or trojan:// link.');
    }
  };

  const handleConfirm = async () => {
    setErrorMsg('');
    try {
      if (!uriText.trim()) {
        setErrorMsg('Paste a valid vless://, vmess://, or trojan:// link first.');
        return;
      }
      if (!IN_TAURI) {
        if (!parsedUri) {
          setErrorMsg('Paste a valid vless://, vmess://, or trojan:// link first.');
          return;
        }
        const localNode = {
          id: `node-${Date.now()}`,
          name: parsedUri.name,
          region: 'SG',
          isp: parsedUri.isp,
          address: parsedUri.sni,
          port: 443,
          uuid: '',
          sni: parsedUri.sni,
          protocol: parsedUri.protocol,
          transport: 'tcp',
          tlsMode: 'tls',
          vcn: parsedUri.protocol.includes('VCN'),
          quotaUsedGB: 0,
          quotaTotalGB: 0,
          quotaUpdatedAtMs: 0,
          starred: false,
          online: false,
          uri: uriText.trim(),
        };
        setNodes((prev) => [localNode, ...prev]);
        if (connectionStatus !== 'connected') {
          setActiveNodeId(localNode.id);
        }
        setUriText('');
        setAddModalOpen(false);
        setActiveRoute('servers');
        return;
      }
      const imported = await invokeCmd('import_uri', { input: uriText.trim(), mode: 'uri' });
      const all = await invokeCmd('list_servers');
      setNodes(all);
      if (imported[0] && connectionStatus !== 'connected') {
        setActiveNodeId(imported[0].id);
      }
      setUriText('');
      setAddModalOpen(false);
      setActiveRoute('servers');
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  return (
    <AnimatePresence>
      {addModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center p-3"
          style={{ backgroundColor: 'rgba(12, 10, 11, 0.78)', backdropFilter: 'blur(5px)' }}
          onClick={() => setAddModalOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[440px] rounded-[22px] p-4 shadow-2xl"
            style={GLASS_MODAL}
          >
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                  style={{ backgroundColor: COLORS.surfaceActive, border: `1px solid ${COLORS.surfaceActiveBorder}`, color: COLORS.coral }}
                >
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-jakarta font-bold text-[14.5px]" style={{ color: COLORS.textPrimary }}>
                    Add Server Config
                  </h3>
                  <p className="text-[11px]" style={{ color: COLORS.textMuted }}>
                    Paste your vless://, vmess://, or trojan:// link
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#2A2223]"
                style={{ color: COLORS.textMuted }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleClipboardPaste}
                className="w-full h-[34px] px-3 rounded-[11px] text-[11.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 hover:bg-[#5C4341]"
                style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary, border: '1px solid rgba(255,200,196,0.2)' }}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Paste from Clipboard</span>
              </button>

              <textarea
                rows={4}
                value={uriText}
                onChange={(e) => {
                  setUriText(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="vless://uuid@host:443?security=tls&sni=st1.zoom.us#NodeName"
                className="w-full rounded-[14px] p-3 font-mono text-[11px] leading-relaxed resize-none focus:outline-none focus:border-[#FF7369]"
                style={{ ...GLASS_INSET, color: COLORS.textPrimary }}
              />

              {parsedUri && (
                <div
                  className="rounded-[13px] p-2.5 flex items-center justify-between gap-2"
                  style={{ backgroundColor: COLORS.surfaceActive, border: `1px solid ${COLORS.surfaceActiveBorder}` }}
                >
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold truncate" style={{ color: COLORS.textPrimary }}>
                      {parsedUri.name}
                    </div>
                    <div className="text-[10.5px] font-mono truncate" style={{ color: '#D0B4B3' }}>
                      {parsedUri.isp} — {parsedUri.sni}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold shrink-0" style={{ backgroundColor: '#1E332B', color: COLORS.mint }}>
                    {parsedUri.protocol}
                  </span>
                </div>
              )}
            </div>

            {errorMsg && (
              <p className="mt-2.5 text-[11.5px] flex items-center gap-1.5" style={{ color: COLORS.coral }}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer hover:bg-[#2A2223]"
                style={{ color: COLORS.textMuted }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-5 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer transition-colors duration-150 hover:bg-[#B50D17]"
                style={{ backgroundColor: COLORS.crimson, color: COLORS.textPrimary, border: '1px solid #BC1F27' }}
              >
                Add
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// DEDICATED QR SCANNER MODAL (NetMod Screen Capture + Live Camera — No Upload)
// ============================================================================
function QrScannerModal() {
  const {
    qrModalOpen,
    setQrModalOpen,
    setNodes,
    setActiveNodeId,
    setActiveRoute,
    connectionStatus,
  } = useMetro();

  const [scanTab, setScanTab] = useState('screen'); // 'screen' | 'camera'
  const [capturing, setCapturing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [decodedUri, setDecodedUri] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    if (!qrModalOpen) {
      stopCamera();
      setDecodedUri('');
      setErrorMsg('');
    }
  }, [qrModalOpen, stopCamera]);

  const importDecodedQr = useCallback(
    async (rawQrText) => {
      try {
        if (!IN_TAURI) {
          setDecodedUri(rawQrText);
          return;
        }
        const imported = await invokeCmd('import_uri', { input: rawQrText.trim(), mode: 'uri' });
        const all = await invokeCmd('list_servers');
        setNodes(all);
        if (imported[0] && connectionStatus !== 'connected') {
          setActiveNodeId(imported[0].id);
        }
        stopCamera();
        setQrModalOpen(false);
        setActiveRoute('servers');
      } catch (err) {
        setErrorMsg(String(err));
      }
    },
    [setNodes, setActiveNodeId, connectionStatus, stopCamera, setQrModalOpen, setActiveRoute]
  );

  // Live Camera QR Loop using jsQR
  useEffect(() => {
    if (!qrModalOpen || scanTab !== 'camera') {
      stopCamera();
      return;
    }

    let cancelled = false;
    let timerId = null;

    (async () => {
      setErrorMsg('');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMsg('Camera access is not available on this system.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraActive(true);

        const scanFrame = () => {
          if (cancelled || !videoRef.current || !canvasRef.current) return;
          const v = videoRef.current;
          if (v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) {
            const c = canvasRef.current;
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, c.width, c.height);
              const imgData = ctx.getImageData(0, 0, c.width, c.height);
              const hit = jsQR(imgData.data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
              if (hit && hit.data) {
                setDecodedUri(hit.data);
                importDecodedQr(hit.data);
                return;
              }
            }
          }
          timerId = setTimeout(scanFrame, 140);
        };
        timerId = setTimeout(scanFrame, 250);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(`Camera error: ${err?.message || String(err)}`);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      stopCamera();
    };
  }, [qrModalOpen, scanTab, stopCamera, importDecodedQr]);

  useEffect(() => {
    if (!IN_TAURI) return undefined;
    let unsubResult = null;
    let unsubCancel = null;
    let active = true;

    (async () => {
      try {
        unsubResult = await listenEvent('vpn://snip-result', async (payload) => {
          if (!active) return;
          setCapturing(false);
          if (payload?.ok && payload?.text) {
            setDecodedUri(payload.text);
            await importDecodedQr(payload.text);
          } else if (payload?.error) {
            setErrorMsg(String(payload.error));
          }
        });
        unsubCancel = await listenEvent('vpn://snip-cancelled', () => {
          if (!active) return;
          setCapturing(false);
        });
      } catch {
        // ignore listener setup error
      }
    })();

    return () => {
      active = false;
      if (typeof unsubResult === 'function') unsubResult();
      if (typeof unsubCancel === 'function') unsubCancel();
    };
  }, [importDecodedQr]);

  const handleScreenCaptureQr = async () => {
    setErrorMsg('');
    setDecodedUri('');
    setCapturing(true);
    try {
      if (!IN_TAURI) {
        setErrorMsg('Mouse Snip Screen QR requires the Windows desktop app.');
        setCapturing(false);
        return;
      }
      await invokeCmd('start_screen_snip');
    } catch (err) {
      setErrorMsg(String(err));
      setCapturing(false);
    }
  };

  return (
    <AnimatePresence>
      {qrModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center p-3"
          style={{ backgroundColor: 'rgba(12, 10, 11, 0.78)', backdropFilter: 'blur(6px)' }}
          onClick={() => setQrModalOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[430px] rounded-[22px] p-4 shadow-2xl"
            style={GLASS_MODAL}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                  style={{ backgroundColor: COLORS.surfaceActive, border: `1px solid ${COLORS.surfaceActiveBorder}`, color: COLORS.coral }}
                >
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-jakarta font-bold text-[14.5px]" style={{ color: COLORS.textPrimary }}>
                    Scan QR Config
                  </h3>
                  <p className="text-[11px]" style={{ color: COLORS.textMuted }}>
                    Snip QR region on screen or scan with webcam
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#2A2223]"
                style={{ color: COLORS.textMuted }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Strictly 2 QR Modes: Screen Snip & Camera */}
            <div
              className="grid grid-cols-2 p-1 rounded-[14px] mb-3.5 gap-1"
              style={GLASS_INSET}
            >
              <button
                type="button"
                onClick={() => {
                  setScanTab('screen');
                  setErrorMsg('');
                }}
                className="py-1.5 px-2 rounded-[10px] text-[11.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150"
                style={{
                  backgroundColor: scanTab === 'screen' ? COLORS.taupe : 'transparent',
                  color: scanTab === 'screen' ? COLORS.textPrimary : COLORS.textMuted,
                }}
              >
                <ScanLine className="w-3.5 h-3.5" />
                <span>Screen Capture</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setScanTab('camera');
                  setErrorMsg('');
                }}
                className="py-1.5 px-2 rounded-[10px] text-[11.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150"
                style={{
                  backgroundColor: scanTab === 'camera' ? COLORS.taupe : 'transparent',
                  color: scanTab === 'camera' ? COLORS.textPrimary : COLORS.textMuted,
                }}
              >
                <Video className="w-3.5 h-3.5" />
                <span>Camera</span>
              </button>
            </div>

            {scanTab === 'screen' && (
              <div
                className="rounded-[16px] p-5 flex flex-col items-center text-center gap-3"
                style={GLASS_INSET}
              >
                <div
                  className="w-12 h-12 rounded-[15px] flex items-center justify-center"
                  style={{ backgroundColor: COLORS.surfaceActive, border: `1px solid ${COLORS.surfaceActiveBorder}`, color: COLORS.coral }}
                >
                  <ScanLine className={`w-6 h-6 ${capturing ? 'animate-pulse' : ''}`} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: COLORS.textPrimary }}>
                    {capturing ? 'Drag across the QR code on screen...' : 'Snip QR Area With Your Mouse'}
                  </p>
                  <p className="text-[11px] mt-1 leading-relaxed max-w-[310px]" style={{ color: COLORS.textMuted }}>
                    Works like Windows Snipping Tool: click below, then drag a box around any QR code on your desktop or browser and release to import.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={capturing}
                  onClick={handleScreenCaptureQr}
                  className="h-[36px] px-5 rounded-full text-[12px] font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors duration-150 hover:bg-[#B50D17] disabled:opacity-60"
                  style={{ backgroundColor: COLORS.crimson, color: COLORS.textPrimary, border: '1px solid #BC1F27' }}
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  <span>{capturing ? 'Snipping Tool Active...' : 'Snip QR from Screen'}</span>
                </button>
              </div>
            )}

            {scanTab === 'camera' && (
              <div
                className="rounded-[16px] p-3 flex flex-col items-center gap-2.5"
                style={GLASS_INSET}
              >
                <div className="relative w-full h-[210px] rounded-[12px] overflow-hidden bg-black flex items-center justify-center">
                  <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                  <div
                    className="absolute w-[140px] h-[140px] rounded-[16px] pointer-events-none"
                    style={{ border: `2px solid ${cameraActive ? COLORS.coral : COLORS.textMuted}` }}
                  />
                  {!cameraActive && !errorMsg && (
                    <span className="absolute text-[11.5px] font-medium" style={{ color: COLORS.textMuted }}>
                      Starting webcam...
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-center" style={{ color: COLORS.textMuted }}>
                  Hold a phone or printed QR code in front of your camera to import automatically.
                </p>
              </div>
            )}

            {decodedUri && (
              <div
                className="mt-2.5 rounded-[12px] p-2.5 text-[11px] font-mono truncate"
                style={{ backgroundColor: '#1E332B', color: COLORS.mint }}
              >
                Decoded: {decodedUri}
              </div>
            )}

            {errorMsg && (
              <p className="mt-2.5 text-[11.5px] flex items-center gap-1.5" style={{ color: COLORS.coral }}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// FULLSCREEN MOUSE SNIPPING OVERLAY WINDOW (?window=snip)
// ============================================================================
function SnipOverlayView() {
  const [previewUrl, setPreviewUrl] = useState('');
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    let unsub = null;

    if (IN_TAURI) {
      invokeCmd('get_snip_preview')
        .then((url) => {
          if (active && url) setPreviewUrl(url);
        })
        .catch(() => {});

      listenEvent('vpn://snip-ready', (url) => {
        if (!active) return;
        setDragStart(null);
        setDragCurrent(null);
        setSubmitting(false);
        if (url) setPreviewUrl(url);
      })
        .then((fn) => {
          unsub = fn;
        })
        .catch(() => {});
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setDragStart(null);
        setDragCurrent(null);
        if (IN_TAURI) invokeCmd('cancel_screen_snip').catch(() => {});
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      active = false;
      window.removeEventListener('keydown', onKeyDown);
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const selRect = useMemo(() => {
    if (!dragStart || !dragCurrent) return null;
    const x = Math.min(dragStart.x, dragCurrent.x);
    const y = Math.min(dragStart.y, dragCurrent.y);
    const w = Math.abs(dragCurrent.x - dragStart.x);
    const h = Math.abs(dragCurrent.y - dragStart.y);
    return { x, y, w, h };
  }, [dragStart, dragCurrent]);

  const handleCancel = (e) => {
    if (e) e.preventDefault();
    setDragStart(null);
    setDragCurrent(null);
    if (IN_TAURI) invokeCmd('cancel_screen_snip').catch(() => {});
  };

  const handlePointerDown = (e) => {
    if (submitting) return;
    if (e.button === 2) {
      handleCancel(e);
      return;
    }
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore pointer capture fallback
    }
    const pt = { x: e.clientX, y: e.clientY };
    setDragStart(pt);
    setDragCurrent(pt);
  };

  const handlePointerMove = (e) => {
    if (!dragStart || submitting) return;
    setDragCurrent({ x: e.clientX, y: e.clientY });
  };

  const handlePointerUp = async (e) => {
    if (!dragStart || submitting) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const x = Math.min(dragStart.x, e.clientX);
    const y = Math.min(dragStart.y, e.clientY);
    const w = Math.abs(e.clientX - dragStart.x);
    const h = Math.abs(e.clientY - dragStart.y);
    setDragStart(null);
    setDragCurrent(null);

    if (w < 12 || h < 12) return;
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    setSubmitting(true);
    try {
      if (IN_TAURI) {
        await invokeCmd('finish_screen_snip', {
          xRatio: x / vw,
          yRatio: y / vh,
          wRatio: w / vw,
          hRatio: h / vh,
        });
      }
    } catch {
      // error emitted back to main window
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 w-screen h-screen overflow-hidden select-none cursor-crosshair bg-black"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={handleCancel}
    >
      {previewUrl && (
        <img
          src={previewUrl}
          alt="Desktop snip surface"
          draggable={false}
          className="w-full h-full object-fill pointer-events-none select-none"
        />
      )}

      {!selRect ? (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{ backgroundColor: 'rgba(10, 7, 9, 0.52)' }}
        />
      ) : (
        <>
          <div
            className="fixed left-0 right-0 top-0 pointer-events-none"
            style={{ height: selRect.y, backgroundColor: 'rgba(10, 7, 9, 0.58)' }}
          />
          <div
            className="fixed left-0 right-0 bottom-0 pointer-events-none"
            style={{ top: selRect.y + selRect.h, backgroundColor: 'rgba(10, 7, 9, 0.58)' }}
          />
          <div
            className="fixed left-0 pointer-events-none"
            style={{
              top: selRect.y,
              height: selRect.h,
              width: selRect.x,
              backgroundColor: 'rgba(10, 7, 9, 0.58)',
            }}
          />
          <div
            className="fixed right-0 pointer-events-none"
            style={{
              top: selRect.y,
              height: selRect.h,
              left: selRect.x + selRect.w,
              backgroundColor: 'rgba(10, 7, 9, 0.58)',
            }}
          />

          <div
            className="fixed pointer-events-none"
            style={{
              left: selRect.x,
              top: selRect.y,
              width: selRect.w,
              height: selRect.h,
              border: '1.5px solid #FF5449',
              boxShadow: '0 0 18px rgba(255, 84, 73, 0.55), inset 0 0 0 1px rgba(255, 255, 255, 0.35)',
            }}
          >
            <div className="absolute -top-0.5 -left-0.5 w-3 h-3 border-t-2 border-l-2 border-white" />
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 border-t-2 border-r-2 border-white" />
            <div className="absolute -bottom-0.5 -left-0.5 w-3 h-3 border-b-2 border-l-2 border-white" />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 border-b-2 border-r-2 border-white" />

            <div
              className="absolute left-0 px-2 py-0.5 rounded-full font-mono text-[10.5px] font-semibold whitespace-nowrap"
              style={{
                top: selRect.y > 28 ? -24 : selRect.h + 6,
                backgroundColor: 'rgba(18, 13, 14, 0.88)',
                border: '1px solid rgba(255, 84, 73, 0.55)',
                color: '#F4ECEC',
              }}
            >
              {Math.round(selRect.w)} × {Math.round(selRect.h)} px
            </div>
          </div>
        </>
      )}

      {/* Top Glass HUD */}
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-full shadow-2xl"
        style={GLASS_MODAL}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ScanLine className="w-4 h-4 shrink-0" style={{ color: COLORS.coral }} />
        <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: COLORS.textPrimary }}>
          Drag mouse around the QR code &amp; release to scan
        </span>
        <button
          type="button"
          onClick={handleCancel}
          className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer hover:bg-[#3A2224]"
          style={{ backgroundColor: 'rgba(255, 84, 73, 0.18)', color: COLORS.coral, border: '1px solid rgba(255, 84, 73, 0.4)' }}
        >
          Cancel (Esc)
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// WINDOWS APPS (.EXE) SPLIT TUNNELING PICKER MODAL (Scans Real PC Executables)
// ============================================================================
function WindowsAppsModal() {
  const {
    appsModalOpen,
    setAppsModalOpen,
    windowsApps,
    setWindowsApps,
    toggleWindowsAppBypass,
    scanWindowsApps,
    scanningApps,
    pushToast,
  } = useMetro();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (appsModalOpen) {
      scanWindowsApps();
    }
  }, [appsModalOpen, scanWindowsApps]);

  const filtered = windowsApps.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.exe.toLowerCase().includes(search.toLowerCase())
  );

  const handleBrowseExe = async () => {
    try {
      const path = await pickExeFile();
      if (!path) return;
      const updated = await invokeCmd('add_custom_windows_app', { path });
      setWindowsApps(updated);
      pushToast('Added executable to Split Tunneling bypass list', 'success');
    } catch (err) {
      pushToast(String(err), 'amber');
    }
  };

  return (
    <AnimatePresence>
      {appsModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center p-3"
          style={{ backgroundColor: 'rgba(12, 10, 11, 0.78)', backdropFilter: 'blur(5px)' }}
          onClick={() => setAppsModalOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[440px] rounded-[22px] p-4 shadow-2xl"
            style={{ backgroundColor: COLORS.surface, border: '1px solid #3D3132' }}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-jakarta font-bold text-[14.5px]" style={{ color: COLORS.textPrimary }}>
                  Split Tunneling Apps (.exe)
                </h3>
                <p className="text-[11px]" style={{ color: COLORS.textMuted }}>
                  Checked apps bypass VPN and use direct internet
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAppsModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#2A2223]"
                style={{ color: COLORS.textMuted }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 mb-2.5">
              <div
                className="flex-1 h-[34px] rounded-full px-3 flex items-center gap-1.5"
                style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}` }}
              >
                <Search className="w-3.5 h-3.5 shrink-0" style={{ color: COLORS.textMuted }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search installed / running .exe..."
                  className="w-full bg-transparent text-[11.5px] focus:outline-none"
                  style={{ color: COLORS.textPrimary }}
                />
              </div>
              <button
                type="button"
                onClick={scanWindowsApps}
                disabled={scanningApps}
                title="Rescan PC executables"
                className="h-[34px] px-2.5 rounded-full text-[11px] font-semibold flex items-center gap-1 cursor-pointer shrink-0 transition-colors duration-150 hover:bg-[#2A2223]"
                style={{ backgroundColor: COLORS.obsidian, color: COLORS.amber, border: `1px solid ${COLORS.surfaceBorder}` }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scanningApps ? 'animate-spin' : ''}`} />
                <span>Scan</span>
              </button>
              <button
                type="button"
                onClick={handleBrowseExe}
                className="h-[34px] px-2.5 rounded-full text-[11px] font-semibold flex items-center gap-1 cursor-pointer shrink-0 transition-colors duration-150 hover:bg-[#5C4341]"
                style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary, border: '1px solid #634947' }}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Browse</span>
              </button>
            </div>

            <div className="max-h-[250px] overflow-y-auto flex flex-col gap-1.5 pr-1 custom-scrollbar">
              {scanningApps && filtered.length === 0 ? (
                <div className="py-8 text-center text-[12px]" style={{ color: COLORS.textMuted }}>
                  Scanning installed &amp; running apps on your PC...
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-8 text-center text-[12px]" style={{ color: COLORS.textMuted }}>
                  No executables found. Click Scan or Browse to pick an .exe file.
                </div>
              ) : (
                filtered.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => toggleWindowsAppBypass(app.id)}
                    className="w-full rounded-[12px] px-3 py-2 flex items-center justify-between cursor-pointer transition-colors duration-150"
                    style={{
                      backgroundColor: app.bypassed ? COLORS.surfaceActive : '#151213',
                      border: `1px solid ${app.bypassed ? COLORS.surfaceActiveBorder : '#272021'}`,
                    }}
                  >
                    <div className="text-left min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold truncate" style={{ color: COLORS.textPrimary }}>
                          {app.name}
                        </span>
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: app.category === 'Running' ? '#1E332B' : '#262021',
                            color: app.category === 'Running' ? COLORS.mint : COLORS.textMuted,
                          }}
                        >
                          {app.category}
                        </span>
                      </div>
                      <div className="font-mono text-[10.5px] truncate" style={{ color: COLORS.textMuted }}>
                        {app.exe}
                      </div>
                    </div>
                    <div
                      className="w-4.5 h-4.5 rounded-[5px] flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: app.bypassed ? COLORS.coral : '#2A2223',
                        border: `1px solid ${app.bypassed ? '#FF7970' : '#443839'}`,
                      }}
                    >
                      {app.bypassed && <Check className="w-3 h-3 text-[#141112]" strokeWidth={3} />}
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="mt-3.5 flex justify-end">
              <button
                type="button"
                onClick={() => setAppsModalOpen(false)}
                className="px-4 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer"
                style={{ backgroundColor: COLORS.crimson, color: COLORS.textPrimary }}
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// ADMIN ELEVATION MODAL (UAC Restart for Windows TUN Mode)
// ============================================================================
function AdminElevationModal() {
  const { adminModalOpen, setAdminModalOpen, pushToast } = useMetro();

  const handleRestartAsAdmin = async () => {
    try {
      await invokeCmd('restart_as_admin');
    } catch (err) {
      pushToast(String(err), 'amber');
      setAdminModalOpen(false);
    }
  };

  return (
    <AnimatePresence>
      {adminModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(12, 10, 11, 0.78)', backdropFilter: 'blur(5px)' }}
          onClick={() => setAdminModalOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={SPRING}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] rounded-[24px] p-5 shadow-2xl"
            style={{ backgroundColor: COLORS.surface, border: '1px solid #4A3334' }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-[13px] flex items-center justify-center shrink-0"
                style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}
              >
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-jakarta font-bold text-[15px]" style={{ color: COLORS.textPrimary }}>
                  Administrator Elevation Required
                </h3>
                <p className="text-[11.5px]" style={{ color: COLORS.textMuted }}>
                  Full Windows TUN Mode (Wintun virtual NIC)
                </p>
              </div>
            </div>

            <p className="text-[12.5px] leading-relaxed mb-4" style={{ color: '#D3C2C2' }}>
              Creating the <span className="font-mono text-[#E6C280]">Metrovpn-TUN</span> Wintun network adapter and configuring Windows IP routes requires Administrator privileges. You can restart Metrovpn elevated via UAC, or use <span className="font-semibold text-[#F4ECEC]">System Proxy Mode</span> without elevation.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdminModalOpen(false)}
                className="px-4 py-2 rounded-full text-[12.5px] font-semibold cursor-pointer hover:bg-[#2A2223]"
                style={{ color: COLORS.textMuted }}
              >
                Stay in Proxy Mode
              </button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleRestartAsAdmin}
                className="px-4 py-2 rounded-full text-[12.5px] font-semibold cursor-pointer"
                style={{ backgroundColor: COLORS.crimson, color: COLORS.textPrimary, border: '1px solid #BC1F27' }}
              >
                Restart as Administrator
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// NODE EDIT & SHARE QR MINI MODALS
// ============================================================================
function NodeUtilityModals() {
  const {
    shareNodeModal,
    setShareNodeModal,
    editNodeModal,
    setEditNodeModal,
    updateNodeDetails,
    pushToast,
  } = useMetro();

  const [editName, setEditName] = useState('');
  const [editIsp, setEditIsp] = useState('');
  const [editSni, setEditSni] = useState('');

  useEffect(() => {
    if (editNodeModal) {
      setEditName(editNodeModal.name);
      setEditIsp(editNodeModal.isp);
      setEditSni(editNodeModal.sni);
    }
  }, [editNodeModal]);

  return (
    <>
      <AnimatePresence>
        {shareNodeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(12, 10, 11, 0.75)', backdropFilter: 'blur(5px)' }}
            onClick={() => setShareNodeModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={SPRING}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[340px] rounded-[24px] p-5 text-center shadow-2xl"
              style={{ backgroundColor: COLORS.surface, border: '1px solid #3D3132' }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-jakarta font-bold text-[14.5px]" style={{ color: COLORS.textPrimary }}>
                  Share Node URI
                </span>
                <button
                  type="button"
                  onClick={() => setShareNodeModal(null)}
                  className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#2A2223]"
                  style={{ color: COLORS.textMuted }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div
                className="w-[172px] h-[172px] mx-auto rounded-[18px] p-3.5 flex items-center justify-center"
                style={{ backgroundColor: '#F4ECEC' }}
              >
                <svg viewBox="0 0 21 21" className="w-full h-full">
                  <rect width="21" height="21" fill="#F4ECEC" />
                  {[
                    [0, 0],
                    [14, 0],
                    [0, 14],
                  ].map(([x, y], idx) => (
                    <g key={idx}>
                      <rect x={x} y={y} width="7" height="7" rx="1" fill="#141112" />
                      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#F4ECEC" />
                      <rect x={x + 2} y={y + 2} width="3" height="3" fill="#9B0A12" />
                    </g>
                  ))}
                  {Array.from({ length: 100 }).map((_, idx) => {
                    const gx = 2 + (idx % 17);
                    const gy = 2 + Math.floor(idx / 17) * 2;
                    if ((gx < 8 && gy < 8) || (gx > 12 && gy < 8) || (gx < 8 && gy > 12) || gy > 19) {
                      return null;
                    }
                    const seed = (shareNodeModal.name.charCodeAt(idx % shareNodeModal.name.length) + idx * 7) % 3;
                    if (seed === 0) return null;
                    return <rect key={idx} x={gx} y={gy} width="1" height="1" fill={seed === 1 ? '#141112' : '#3B2827'} />;
                  })}
                </svg>
              </div>

              <div className="mt-3.5 font-jakarta font-bold text-[14px]" style={{ color: COLORS.textPrimary }}>
                {shareNodeModal.name}
              </div>
              <div className="text-[11.5px] font-mono mt-0.5" style={{ color: COLORS.textMuted }}>
                {shareNodeModal.isp} — {shareNodeModal.sni}
              </div>

              <button
                type="button"
                onClick={async () => {
                  await copyClipboard(shareNodeModal.uri);
                  pushToast(`Copied share URI for ${shareNodeModal.name}`, 'success');
                  setShareNodeModal(null);
                }}
                className="mt-4 w-full h-[38px] rounded-full text-[12.5px] font-semibold flex items-center justify-center gap-2 cursor-pointer"
                style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary }}
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy VLESS/VMess URI</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editNodeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(12, 10, 11, 0.75)', backdropFilter: 'blur(5px)' }}
            onClick={() => setEditNodeModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={SPRING}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[400px] rounded-[24px] p-5 shadow-2xl"
              style={{ backgroundColor: COLORS.surface, border: '1px solid #3D3132' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-jakarta font-bold text-[15px]" style={{ color: COLORS.textPrimary }}>
                  Edit Tunnel Node
                </h3>
                <button
                  type="button"
                  onClick={() => setEditNodeModal(null)}
                  className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#2A2223]"
                  style={{ color: COLORS.textMuted }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[11.5px] font-medium block mb-1" style={{ color: COLORS.textMuted }}>
                    Node Display Title
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full h-[38px] rounded-[12px] px-3 text-[13px] focus:outline-none"
                    style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[11.5px] font-medium block mb-1" style={{ color: COLORS.textMuted }}>
                    ISP Tag
                  </label>
                  <input
                    type="text"
                    value={editIsp}
                    onChange={(e) => setEditIsp(e.target.value)}
                    className="w-full h-[38px] rounded-[12px] px-3 text-[13px] focus:outline-none"
                    style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[11.5px] font-medium block mb-1" style={{ color: COLORS.textMuted }}>
                    SNI Hostname
                  </label>
                  <input
                    type="text"
                    value={editSni}
                    onChange={(e) => setEditSni(e.target.value)}
                    className="w-full h-[38px] rounded-[12px] px-3 font-mono text-[12.5px] focus:outline-none"
                    style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.textPrimary }}
                  />
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditNodeModal(null)}
                  className="px-4 py-2 rounded-full text-[12.5px] font-semibold cursor-pointer"
                  style={{ color: COLORS.textMuted }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateNodeDetails({
                      id: editNodeModal.id,
                      name: editName.trim() || editNodeModal.name,
                      isp: editIsp.trim() || editNodeModal.isp,
                      sni: editSni.trim() || editNodeModal.sni,
                    });
                    setEditNodeModal(null);
                  }}
                  className="px-5 py-2 rounded-full text-[12.5px] font-semibold cursor-pointer"
                  style={{ backgroundColor: COLORS.crimson, color: COLORS.textPrimary }}
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ============================================================================
// INTERACTIVE STEP-BY-STEP USER GUIDE (Navigates Real App Tabs Live)
// ============================================================================
function OnboardingGuideModal() {
  const {
    onboardingOpen,
    completeOnboarding,
    systemMode,
    setSystemMode,
    setActiveRoute,
    setSettingsTab,
    setQrModalOpen,
  } = useMetro();
  const [step, setStep] = useState(0);

  // Navigate to the corresponding real app tab automatically on each step
  useEffect(() => {
    if (!onboardingOpen) return;
    if (step === 0) {
      setActiveRoute('home');
    } else if (step === 1) {
      setActiveRoute('servers');
    } else if (step === 2) {
      setActiveRoute('settings');
      setSettingsTab('tun');
    } else if (step === 3) {
      setActiveRoute('home');
    }
  }, [onboardingOpen, step, setActiveRoute, setSettingsTab]);

  useEffect(() => {
    if (onboardingOpen) setStep(0);
  }, [onboardingOpen]);

  const guideSteps = [
    {
      stepLabel: 'Step 1 of 4 • Home & Import',
      title: 'Add Your Server Link or Scan QR',
      body: 'Click "+ Add" in the top bar to paste a VLESS/VMess link, or tap the QR icon to capture a QR directly from your screen or webcam.',
      actionLabel: 'Paste Link Now',
      onAction: () => completeOnboarding('uri'),
      altLabel: 'Scan QR',
      onAlt: () => {
        completeOnboarding(null);
        setQrModalOpen(true);
      },
    },
    {
      stepLabel: 'Step 2 of 4 • Servers Tab',
      title: 'Test Latency & Pick Your Server',
      body: 'You are now viewing the Servers tab. Tap "Test Pings" or any server ping badge to check speed, filter by ISP (SLT, Dialog, Hutch, Airtel, Mobitel), and click a card to connect.',
      actionLabel: null,
    },
    {
      stepLabel: 'Step 3 of 4 • TUN Mode vs System Proxy',
      title: 'How Windows Routes Traffic',
      body: 'TUN Mode is enabled by default so every app, game & CLI tool on your PC goes through the VPN automatically. You can also switch to System Proxy anytime for browsers & chat apps only.',
      showModeToggle: true,
    },
    {
      stepLabel: 'Step 4 of 4 • Ready to Connect',
      title: 'Tap the Power Orb & Check Speed',
      body: 'Tap the crimson orb on Home to connect. Watch live Download/Upload speeds, run speed benchmarks in Speed, and close the window anytime to keep VPN running in System Tray.',
      actionLabel: null,
    },
  ];

  const cur = guideSteps[step];

  return (
    <AnimatePresence>
      {onboardingOpen && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 14 }}
          transition={{ duration: 0.16 }}
          className="absolute inset-x-3 bottom-3 z-50 rounded-[20px] p-4 shadow-2xl"
          style={{
            ...GLASS_MODAL,
            border: `1.5px solid ${COLORS.coral}`,
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}
            >
              {cur.stepLabel}
            </span>
            <button
              type="button"
              onClick={() => completeOnboarding(null)}
              aria-label="Close guide"
              className="w-6 h-6 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#2E2627]"
              style={{ color: COLORS.textMuted }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <h3 className="font-jakarta font-bold text-[14.5px] mb-1" style={{ color: COLORS.textPrimary }}>
            {cur.title}
          </h3>
          <p className="text-[11.5px] leading-relaxed mb-3" style={{ color: '#CFC2C2' }}>
            {cur.body}
          </p>

          {cur.showModeToggle && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                type="button"
                onClick={() => setSystemMode('TUN')}
                className="py-1.5 px-2.5 rounded-[12px] text-[11px] font-semibold cursor-pointer text-left"
                style={{
                  backgroundColor: systemMode === 'TUN' ? COLORS.crimson : COLORS.obsidian,
                  color: COLORS.textPrimary,
                  border: `1px solid ${systemMode === 'TUN' ? '#BC1F27' : COLORS.surfaceBorder}`,
                }}
              >
                <div>TUN Mode</div>
                <div className="text-[9.5px] opacity-80">Default • Full PC &amp; Games</div>
              </button>
              <button
                type="button"
                onClick={() => setSystemMode('PROXY')}
                className="py-1.5 px-2.5 rounded-[12px] text-[11px] font-semibold cursor-pointer text-left"
                style={{
                  backgroundColor: systemMode === 'PROXY' ? COLORS.crimson : COLORS.obsidian,
                  color: COLORS.textPrimary,
                  border: `1px solid ${systemMode === 'PROXY' ? '#BC1F27' : COLORS.surfaceBorder}`,
                }}
              >
                <div>System Proxy</div>
                <div className="text-[9.5px] opacity-80">Browsers &amp; Chat Apps</div>
              </button>
            </div>
          )}

          {cur.actionLabel && (
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={cur.onAction}
                className="h-[28px] px-3 rounded-full text-[11px] font-semibold cursor-pointer"
                style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary, border: '1px solid #634947' }}
              >
                {cur.actionLabel}
              </button>
              {cur.onAlt && (
                <button
                  type="button"
                  onClick={cur.onAlt}
                  className="h-[28px] px-3 rounded-full text-[11px] font-semibold cursor-pointer"
                  style={{ backgroundColor: COLORS.obsidian, color: COLORS.amber, border: `1px solid ${COLORS.surfaceBorder}` }}
                >
                  {cur.altLabel}
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: '#2D2425' }}>
            <div className="flex items-center gap-1">
              {guideSteps.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setStep(idx)}
                  aria-label={`Step ${idx + 1}`}
                  className="h-1.5 rounded-full cursor-pointer transition-all"
                  style={{
                    width: step === idx ? 18 : 6,
                    backgroundColor: step === idx ? COLORS.coral : '#3A2E2F',
                  }}
                />
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  className="px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer hover:bg-[#2A2324]"
                  style={{ color: COLORS.textMuted, border: `1px solid ${COLORS.surfaceBorder}` }}
                >
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => completeOnboarding(null)}
                  className="px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer hover:bg-[#2A2324]"
                  style={{ color: COLORS.textMuted }}
                >
                  Skip
                </button>
              )}

              {step < guideSteps.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  className="px-3.5 py-1 rounded-full text-[11.5px] font-semibold cursor-pointer"
                  style={{ backgroundColor: COLORS.crimson, color: COLORS.textPrimary }}
                >
                  Next Step
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => completeOnboarding(null)}
                  className="px-3.5 py-1 rounded-full text-[11.5px] font-semibold cursor-pointer"
                  style={{ backgroundColor: COLORS.crimson, color: COLORS.textPrimary }}
                >
                  Finish
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// LIVE XRAY CORE LOGS SLIDE-OVER DRAWER
// ============================================================================
function XrayLogsDrawer() {
  const { logsDrawerOpen, setLogsDrawerOpen, logs, logsStreaming, setLogsStreaming, pushToast } = useMetro();
  const [filter, setFilter] = useState('');
  const listRef = useRef(null);

  const filteredLogs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) => l.msg.toLowerCase().includes(q) || l.tag.toLowerCase().includes(q));
  }, [logs, filter]);

  useEffect(() => {
    if (listRef.current && logsStreaming) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filteredLogs, logsStreaming]);

  const tagColor = (tag) => {
    switch (tag) {
      case 'VCN':
        return COLORS.coral;
      case 'TLS':
        return COLORS.mint;
      case 'DNS':
        return '#8BB8F1';
      case 'Warning':
        return COLORS.amber;
      default:
        return COLORS.textMuted;
    }
  };

  const handleExportLog = async () => {
    const content = logs.map((l) => `[${l.time}] [${l.tag}] ${l.msg}`).join('\n');
    await copyClipboard(content);
    pushToast('Copied Xray core log feed to clipboard', 'success');
  };

  return (
    <AnimatePresence>
      {logsDrawerOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex justify-end"
          style={{ backgroundColor: 'rgba(12, 10, 11, 0.65)', backdropFilter: 'blur(3px)' }}
          onClick={() => setLogsDrawerOpen(false)}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={SPRING}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[460px] h-full flex flex-col p-5 shadow-2xl border-l"
            style={{ backgroundColor: COLORS.obsidian, borderColor: '#362C2D' }}
          >
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2.5">
                <Terminal className="w-4 h-4" style={{ color: COLORS.amber }} />
                <div>
                  <h3 className="font-jakarta font-bold text-[15px]" style={{ color: COLORS.textPrimary }}>
                    Live Xray Core Logs
                  </h3>
                  <p className="text-[11px]" style={{ color: COLORS.textMuted }}>
                    Xray-core v26.11.9 • Strict VCN Telemetry
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLogsDrawerOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#251F20]"
                style={{ color: COLORS.textMuted }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <div
                className="flex-1 h-[36px] rounded-full px-3 flex items-center gap-2"
                style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}
              >
                <Search className="w-3.5 h-3.5" style={{ color: COLORS.textMuted }} />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter [VCN], [TLS], [DNS]..."
                  className="w-full bg-transparent text-[12px] focus:outline-none"
                  style={{ color: COLORS.textPrimary }}
                />
              </div>

              <button
                type="button"
                onClick={() => setLogsStreaming((s) => !s)}
                className="h-[36px] px-3 rounded-full text-[11.5px] font-semibold flex items-center gap-1.5 cursor-pointer"
                style={{
                  backgroundColor: logsStreaming ? COLORS.surfaceActive : COLORS.surface,
                  border: `1px solid ${logsStreaming ? COLORS.surfaceActiveBorder : COLORS.surfaceBorder}`,
                  color: COLORS.textPrimary,
                }}
              >
                {logsStreaming ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span>{logsStreaming ? 'Live' : 'Paused'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportLog}
                className="h-[36px] px-3 rounded-full text-[11.5px] font-semibold flex items-center gap-1.5 cursor-pointer"
                style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Copy</span>
              </button>
            </div>

            <div
              ref={listRef}
              className="flex-1 rounded-[18px] p-3.5 overflow-y-auto font-mono text-[11.5px] leading-relaxed flex flex-col gap-2 custom-scrollbar"
              style={{ backgroundColor: '#100D0E', border: `1px solid ${COLORS.surfaceBorder}` }}
            >
              {filteredLogs.map((entry) => (
                <div key={entry.id} className="break-words">
                  <span className="tabular-nums mr-2" style={{ color: '#6E6061' }}>
                    {entry.time}
                  </span>
                  <span className="font-bold mr-2" style={{ color: tagColor(entry.tag) }}>
                    [{entry.tag}]
                  </span>
                  <span style={{ color: '#E3D7D7' }}>{entry.msg}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// WINDOWS SYSTEM TRAY QUICK FLYOUT (320x420px Borderless Popover / Window)
// ============================================================================
function TrayFlyoutCard({ standalone = false }) {
  const {
    setTrayFlyoutOpen,
    connectionStatus,
    sessionSeconds,
    toggleConnection,
    nodes,
    activeNode,
    connectToNode,
    downHistory,
    upHistory,
    restoreFromTray,
    pushToast,
  } = useMetro();

  const [nodePickerOpen, setNodePickerOpen] = useState(false);

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  const downNow = formatThroughput(downHistory[downHistory.length - 1] || 0);
  const upNow = formatThroughput(upHistory[upHistory.length - 1] || 0);

  return (
    <div
      className="w-[320px] h-[420px] rounded-[24px] p-4 flex flex-col justify-between select-none"
      style={{
        backgroundColor: '#181415',
        border: '1px solid #352B2C',
        boxShadow: standalone
          ? 'none'
          : '0 28px 64px -12px rgba(4, 2, 3, 0.92), 0 0 0 1px rgba(244, 236, 236, 0.04) inset',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-[9px] flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: '#251B1C', border: '1px solid #3D2D2E' }}
          >
            <img src={metrovpnApkIcon} alt="Metrovpn" className="w-5 h-5 object-contain" />
          </div>
          <div>
            <img src={metrovpnWordmark} alt="Metrovpn" className="h-[16px] w-auto object-contain" />
            <div className="flex items-center gap-1.5 text-[10.5px] mt-0.5" style={{ color: COLORS.textMuted }}>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: isConnected ? COLORS.mint : isConnecting ? COLORS.amber : '#7B6D6E',
                }}
              />
              <span>{isConnected ? 'Protected' : isConnecting ? 'Connecting...' : 'Disconnected'}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => (standalone ? windowHide() : setTrayFlyoutOpen(false))}
          title="Close Tray Flyout"
          className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#2A2223]"
          style={{ color: COLORS.textMuted }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-col items-center justify-center my-1">
        <ScallopedConnectButton size={104} status={connectionStatus} onClick={toggleConnection} />
        <div
          className="mt-2 font-mono tabular-nums text-[22px] font-bold tracking-tight"
          style={{ color: isConnected ? COLORS.textPrimary : '#6E6061' }}
        >
          {isConnected ? formatTimer(sessionSeconds) : '00:00:00'}
        </div>
      </div>

      <div className="flex flex-col gap-2 relative">
        <button
          type="button"
          onClick={() => setNodePickerOpen((o) => !o)}
          className="w-full rounded-[15px] px-3 py-2.5 flex items-center justify-between gap-2 cursor-pointer transition-colors"
          style={{ backgroundColor: COLORS.surfaceActive, border: `1px solid ${COLORS.surfaceActiveBorder}` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <IspBadge node={activeNode} size={24} isActive={Boolean(activeNode)} />
            <span className="text-[12px] font-semibold truncate" style={{ color: COLORS.textPrimary }}>
              {activeNode?.name || 'No Server Imported'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-mono tabular-nums text-[11px] font-semibold" style={{ color: COLORS.amber }}>
              {activeNode?.ping != null ? `${activeNode.ping}ms` : '—'}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${nodePickerOpen ? 'rotate-180' : ''}`}
              style={{ color: COLORS.textMuted }}
            />
          </div>
        </button>

        <AnimatePresence>
          {nodePickerOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.14 }}
              className="absolute bottom-[calc(100%+6px)] left-0 right-0 max-h-[168px] overflow-y-auto rounded-[16px] p-1.5 z-50 shadow-2xl custom-scrollbar"
              style={{ backgroundColor: '#231C1D', border: '1px solid #443637' }}
            >
              {nodes.length === 0 ? (
                <div className="px-2.5 py-3 text-center text-[11px]" style={{ color: COLORS.textMuted }}>
                  No servers yet. Click Open Full App to import a server.
                </div>
              ) : (
                nodes.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      connectToNode(n.id);
                      setNodePickerOpen(false);
                    }}
                    className="w-full px-2.5 py-2 rounded-[10px] flex items-center justify-between text-left text-[11.5px] cursor-pointer hover:bg-[#312728]"
                    style={{
                      backgroundColor: n.id === activeNode?.id ? COLORS.surfaceActive : 'transparent',
                      color: COLORS.textPrimary,
                    }}
                  >
                    <span className="truncate font-medium pr-2">{n.name}</span>
                    <span className="font-mono tabular-nums text-[10.5px]" style={{ color: COLORS.amber }}>
                      {n.ping != null ? `${n.ping}ms` : '—'}
                    </span>
                  </button>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-2">
          <div
            className="rounded-[12px] px-2.5 py-2 flex items-center justify-between"
            style={{ backgroundColor: '#120F10', border: `1px solid ${COLORS.surfaceBorder}` }}
          >
            <ArrowDown className="w-3.5 h-3.5" style={{ color: COLORS.coral }} />
            <span className="font-mono tabular-nums text-[11.5px] font-semibold" style={{ color: COLORS.textPrimary }}>
              {downNow.value}{' '}
              <span className="text-[10px]" style={{ color: COLORS.textMuted }}>
                {downNow.unit}
              </span>
            </span>
          </div>
          <div
            className="rounded-[12px] px-2.5 py-2 flex items-center justify-between"
            style={{ backgroundColor: '#120F10', border: `1px solid ${COLORS.surfaceBorder}` }}
          >
            <ArrowUp className="w-3.5 h-3.5" style={{ color: COLORS.amber }} />
            <span className="font-mono tabular-nums text-[11.5px] font-semibold" style={{ color: COLORS.textPrimary }}>
              {upNow.value}{' '}
              <span className="text-[10px]" style={{ color: COLORS.textMuted }}>
                {upNow.unit}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2 pt-2 border-t" style={{ borderColor: '#2A2223' }}>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={async () => {
            await restoreFromTray();
            if (!standalone) setTrayFlyoutOpen(false);
          }}
          className="h-[34px] rounded-full text-[12px] font-semibold cursor-pointer"
          style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary, border: '1px solid #634947' }}
        >
          Open Full App
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={async () => {
            if (IN_TAURI) {
              await invokeCmd('quit_app');
            } else {
              setTrayFlyoutOpen(false);
              pushToast('Metrovpn background service stopped', 'neutral');
            }
          }}
          className="h-[34px] px-4 rounded-full text-[12px] font-semibold cursor-pointer hover:bg-[#3A1A1C]"
          style={{ backgroundColor: '#241D1E', border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.coral }}
        >
          Quit
        </motion.button>
      </div>
    </div>
  );
}

function WindowsTrayFlyout() {
  const { trayFlyoutOpen } = useMetro();
  return (
    <AnimatePresence>
      {trayFlyoutOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.95 }}
          transition={SPRING}
          className="fixed bottom-[54px] right-4 z-50"
        >
          <TrayFlyoutCard standalone={false} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// AUTO UPDATE DIALOG MODAL (Download & Install with Live Progress Bar)
// ============================================================================
function AutoUpdateModal() {
  const {
    updateModalOpen,
    setUpdateModalOpen,
    updateInfo,
    downloadingUpdate,
    updateDownloadProgress,
    downloadAndInstallUpdate,
  } = useMetro();

  if (!updateInfo) return null;
  const pct = updateDownloadProgress?.percent || 0;
  const dlMb = ((updateDownloadProgress?.downloadedBytes || 0) / (1024 * 1024)).toFixed(1);
  const totMb =
    (updateDownloadProgress?.totalBytes || 0) > 0
      ? `/ ${((updateDownloadProgress?.totalBytes || 0) / (1024 * 1024)).toFixed(1)} MB`
      : 'MB';

  return (
    <AnimatePresence>
      {updateModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(10, 8, 9, 0.80)', backdropFilter: 'blur(6px)' }}
          onClick={() => !downloadingUpdate && setUpdateModalOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[390px] rounded-[22px] p-4 flex flex-col gap-3 shadow-2xl"
            style={{ backgroundColor: COLORS.surface, border: `1.5px solid ${COLORS.coral}` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0"
                  style={{ backgroundColor: '#2D1A1C', border: '1px solid #592C30' }}
                >
                  <Download className="w-5 h-5" style={{ color: COLORS.coral }} />
                </div>
                <div>
                  <span
                    className="px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}
                  >
                    Auto Update • v{updateInfo.latestVersion}
                  </span>
                  <h3 className="font-jakarta font-bold text-[15px] mt-0.5" style={{ color: COLORS.textPrimary }}>
                    {updateInfo.title || 'New Update Available'}
                  </h3>
                </div>
              </div>
              {!downloadingUpdate && (
                <button
                  type="button"
                  onClick={() => setUpdateModalOpen(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#2A2223]"
                  style={{ color: COLORS.textMuted }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div
              className="rounded-[14px] p-3 text-[11.5px] leading-relaxed max-h-[140px] overflow-y-auto custom-scrollbar"
              style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}`, color: '#D6C6C6' }}
            >
              {updateInfo.message || `Metrovpn v${updateInfo.latestVersion} is ready to download and install automatically.`}
            </div>

            {downloadingUpdate && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                  <span style={{ color: COLORS.amber }}>
                    {updateDownloadProgress?.phase === 'launching'
                      ? 'Launching Windows Installer...'
                      : `Downloading ${updateInfo.assetName || 'Update'}...`}
                  </span>
                  <span style={{ color: COLORS.textPrimary }}>
                    {pct}% ({dlMb} {totMb})
                  </span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#2E2627' }}>
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${pct}%`, backgroundColor: COLORS.coral }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {!downloadingUpdate && (
                <button
                  type="button"
                  onClick={() => setUpdateModalOpen(false)}
                  className="h-[34px] px-3.5 rounded-full text-[11.5px] font-semibold cursor-pointer hover:bg-[#272021]"
                  style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.textMuted }}
                >
                  Later
                </button>
              )}
              <button
                type="button"
                onClick={downloadAndInstallUpdate}
                disabled={downloadingUpdate}
                className="h-[34px] px-4 rounded-full text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-70"
                style={{ backgroundColor: COLORS.crimson, color: COLORS.textPrimary, border: '1px solid #BC1F27' }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>{downloadingUpdate ? 'Installing...' : 'Download & Install Now'}</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// DESKTOP STAGE / MAIN APPLICATION SHELL
// ============================================================================
function DesktopStage() {
  const {
    activeRoute,
    windowMinimizedToTray,
    restoreFromTray,
    trayFlyoutOpen,
    setTrayFlyoutOpen,
    connectionStatus,
    sessionSeconds,
  } = useMetro();

  const renderScreen = () => {
    switch (activeRoute) {
      case 'home':
        return <HomeScreen />;
      case 'servers':
        return <ServersScreen />;
      case 'speed':
        return <SpeedScreen />;
      case 'settings':
        return <SettingsScreen />;
      default:
        return <HomeScreen />;
    }
  };

  const ambientBackground =
    connectionStatus === 'connected'
      ? 'radial-gradient(circle at 62% 28%, rgba(109, 213, 176, 0.16) 0%, transparent 52%), radial-gradient(circle at 18% 82%, rgba(155, 10, 18, 0.22) 0%, transparent 54%), radial-gradient(circle at 86% 86%, rgba(230, 194, 128, 0.09) 0%, transparent 45%), #0D090A'
      : 'radial-gradient(circle at 58% 24%, rgba(190, 22, 34, 0.22) 0%, transparent 54%), radial-gradient(circle at 16% 78%, rgba(120, 22, 28, 0.16) 0%, transparent 50%), radial-gradient(circle at 88% 85%, rgba(230, 194, 128, 0.08) 0%, transparent 42%), #0D090A';

  if (IN_TAURI) {
    return (
      <div
        className="w-screen h-screen relative flex flex-col overflow-hidden"
        style={{
          background: ambientBackground,
          border: `1px solid ${COLORS.surfaceBorder}`,
        }}
      >
        <Titlebar />
        <div className="flex-1 flex gap-2.5 p-2.5 min-h-0 overflow-hidden relative z-10">
          <NavigationRail />
          <main className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden pr-0.5 custom-scrollbar">
            <AnimatePresence mode="wait">{renderScreen()}</AnimatePresence>
          </main>
        </div>
        <AddConfigModal />
        <QrScannerModal />
        <WindowsAppsModal />
        <AdminElevationModal />
        <OnboardingGuideModal />
        <AutoUpdateModal />
        <NodeUtilityModals />
        <XrayLogsDrawer />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center relative transition-all duration-300 p-3 sm:p-6 pb-14"
      style={{
        backgroundColor: COLORS.stage,
        backgroundImage:
          'radial-gradient(circle at 20% 18%, rgba(89, 44, 44, 0.18) 0%, transparent 46%), radial-gradient(circle at 82% 84%, rgba(58, 47, 27, 0.14) 0%, transparent 42%)',
      }}
    >
      <AnimatePresence mode="wait">
        {!windowMinimizedToTray ? (
          <motion.div
            key="main-desktop-window"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 30 }}
            transition={{ duration: 0.16 }}
            className="relative flex flex-col overflow-hidden w-full max-w-[520px] h-[620px] max-h-[calc(100vh-70px)] rounded-[14px]"
            style={{
              background: ambientBackground,
              border: `1px solid ${COLORS.surfaceBorder}`,
              boxShadow: '0 36px 90px -18px rgba(4, 2, 3, 0.88), 0 0 0 1px rgba(255, 228, 226, 0.08) inset',
            }}
          >
            <Titlebar />
            <div className="flex-1 flex gap-2.5 p-2.5 min-h-0 overflow-hidden relative z-10">
              <NavigationRail />
              <main className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden pr-0.5 custom-scrollbar">
                <AnimatePresence mode="wait">{renderScreen()}</AnimatePresence>
              </main>
            </div>
            <AddConfigModal />
            <QrScannerModal />
            <WindowsAppsModal />
            <AdminElevationModal />
            <OnboardingGuideModal />
            <AutoUpdateModal />
            <NodeUtilityModals />
            <XrayLogsDrawer />
          </motion.div>
        ) : (
          <motion.div
            key="minimized-placeholder"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={SPRING}
            className="rounded-[24px] px-7 py-6 flex flex-col items-center text-center gap-3 max-w-[380px]"
            style={GLASS_CARD}
          >
            <div
              className="w-12 h-12 rounded-[16px] flex items-center justify-center"
              style={{ backgroundColor: 'rgba(42, 26, 28, 0.78)', border: '1px solid rgba(255, 160, 150, 0.25)' }}
            >
              <WolfEmblem className="w-7 h-7" />
            </div>
            <h2 className="font-jakarta font-bold text-[16px]" style={{ color: COLORS.textPrimary }}>
              Metrovpn is running in System Tray
            </h2>
            <motion.button
              whileTap={{ scale: 0.96 }}
              transition={SPRING}
              onClick={restoreFromTray}
              className="mt-1 h-[38px] px-5 rounded-full text-[13px] font-semibold cursor-pointer"
              style={{ backgroundColor: COLORS.crimson, color: COLORS.textPrimary }}
            >
              Restore Main Window
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <WindowsTrayFlyout />

      <div className="fixed bottom-3 right-4 z-40 flex items-center gap-2">
        {windowMinimizedToTray && (
          <motion.button
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            whileTap={{ scale: 0.96 }}
            onClick={restoreFromTray}
            className="h-[34px] px-3.5 rounded-full flex items-center gap-2 text-[11.5px] font-semibold cursor-pointer shadow-lg"
            style={{ ...GLASS_CARD, color: COLORS.textPrimary }}
          >
            <Monitor className="w-3.5 h-3.5" style={{ color: COLORS.coral }} />
            <span>Open Window</span>
          </motion.button>
        )}

        <motion.button
          whileTap={{ scale: 0.96 }}
          transition={SPRING}
          onClick={() => setTrayFlyoutOpen((v) => !v)}
          className="h-[34px] px-3.5 rounded-full flex items-center gap-2.5 cursor-pointer shadow-xl select-none"
          style={
            trayFlyoutOpen
              ? { ...GLASS_ACTIVE, color: COLORS.textPrimary }
              : { ...GLASS_CARD, color: COLORS.textPrimary }
          }
        >
          <div className="relative flex items-center justify-center">
            <WolfEmblem className="w-4 h-4" />
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[#1B1718]"
              style={{
                backgroundColor:
                  connectionStatus === 'connected' ? COLORS.mint : connectionStatus === 'connecting' ? COLORS.amber : '#7B6D6E',
              }}
            />
          </div>
          <span className="font-jakarta font-semibold text-[11.5px]">Metrovpn Tray</span>
          <span className="font-mono tabular-nums text-[11px]" style={{ color: COLORS.textMuted }}>
            {connectionStatus === 'connected' ? formatTimer(sessionSeconds) : 'Offline'}
          </span>
        </motion.button>
      </div>
    </div>
  );
}

// ============================================================================
// DEFAULT EXPORT APP WITH ERROR BOUNDARY
// ============================================================================
class MetroErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="w-screen h-screen flex flex-col items-center justify-center p-6 text-center"
          style={{ backgroundColor: '#141112', color: '#F4ECEC' }}
        >
          <div
            className="max-w-[480px] rounded-[22px] p-6"
            style={{ backgroundColor: '#1E191A', border: '1px solid #4A2B2D' }}
          >
            <h2 className="text-[18px] font-bold mb-2">Metrovpn encountered a UI error</h2>
            <p className="text-[12.5px] font-mono break-all mb-4" style={{ color: '#FFB4AB' }}>
              {String(this.state.error?.message || this.state.error)}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2 rounded-full text-[12.5px] font-semibold cursor-pointer"
              style={{ backgroundColor: '#9B0A12', color: '#F4ECEC' }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const isTray = isTrayWindowMode();
  const isSnip = isSnipWindowMode();

  return (
    <>
      <style>{`
        body {
          margin: 0;
          background-color: ${isTray ? 'transparent' : '#0A0708'};
          font-family: 'Segoe UI Variable Text', 'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          color: #F4ECEC;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .font-jakarta {
          font-family: 'Segoe UI Variable Display', 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif;
        }

        .font-mono {
          font-family: 'Cascadia Mono', 'Cascadia Code', 'Consolas', ui-monospace, SFMono-Regular, monospace;
        }

        .tabular-nums {
          font-variant-numeric: tabular-nums;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 224, 222, 0.14);
          border-radius: 999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 84, 73, 0.42);
        }
      `}</style>

      <MetroErrorBoundary>
        {isSnip ? (
          <SnipOverlayView />
        ) : (
          <MetroProvider>
            {isTray ? (
              <div className="w-[320px] h-[420px] overflow-hidden bg-transparent">
                <TrayFlyoutCard standalone={true} />
              </div>
            ) : (
              <DesktopStage />
            )}
          </MetroProvider>
        )}
      </MetroErrorBoundary>
    </>
  );
}

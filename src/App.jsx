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
import {
  Home,
  Globe,
  Gauge,
  Settings,
  Plus,
  QrCode,
  Minus,
  Square,
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
  ChevronLeft,
  ChevronDown,
  Zap,
  Activity,
  Layers,
  Monitor,
  ClipboardPaste,
  FileJson,
  Minimize2,
  Wifi,
  Sparkles,
  AlertCircle,
  Upload,
  MoreVertical,
  Trash2,
  Edit3,
  Share2,
  Link2,
  Terminal,
  Download,
  PanelRight,
  AppWindow,
  Camera,
  Pause,
  Play,
  ShieldAlert,
  FolderOpen,
} from 'lucide-react';
import {
  IN_TAURI,
  copyClipboard,
  invokeCmd,
  isTrayWindowMode,
  listenEvent,
  pickExeFile,
  readClipboard,
  showMainWindowFromTray,
  windowHide,
  windowMinimize,
  windowToggleMaximize,
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
  stage: '#0C0A0B',
  obsidian: '#141112',
  surface: '#1D191A',
  surfaceBorder: '#2E2627',
  surfaceActive: '#3B2827',
  surfaceActiveBorder: '#593B39',
  crimson: '#9B0A12',
  crimsonHover: '#B50D17',
  coral: '#FF5449',
  amber: '#E6C280',
  amberBg: '#3A2F1B',
  taupe: '#4B3635',
  taupeHover: '#5C4341',
  mint: '#6DD5B0',
  textPrimary: '#F4ECEC',
  textMuted: '#A8999A',
};

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
  totalWaves = 24
) {
  const clamped = Math.max(0, Math.min(1, fraction));
  if (clamped < 0.008) return '';
  const steps = Math.max(12, Math.round(180 * clamped));
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * clamped;
    const deg = startDeg + t * sweepDeg;
    const rad = (deg * Math.PI) / 180;
    const endTaper =
      Math.sin(Math.min(1, (i / steps) * 6) * (Math.PI / 2)) *
      Math.sin(Math.min(1, ((steps - i) / steps) * 6) * (Math.PI / 2));
    const r = radius + waveAmp * endTaper * Math.sin(t * totalWaves * Math.PI * 2);
    const x = cx + r * Math.cos(rad);
    const y = cy + r * Math.sin(rad);
    d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return d.trim();
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

function generateWaveLinePath(fillWidth, midY = 6, amplitude = 2.6, wavelength = 14) {
  if (fillWidth <= 1) return '';
  const steps = Math.max(8, Math.round(fillWidth / 1.5));
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * fillWidth;
    const y = midY + amplitude * Math.sin((x / wavelength) * Math.PI * 2);
    d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return d.trim();
}

function buildSparklinePath(values, width, height, padY = 4) {
  if (!values || values.length < 2) return '';
  const maxVal = Math.max(0.5, ...values) * 1.15;
  const usableH = height - padY * 2;
  const stepX = width / (values.length - 1);
  const pts = values.map((v, i) => ({
    x: i * stepX,
    y: height - padY - (Math.min(v, maxVal) / maxVal) * usableH,
  }));
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  d += ` T ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

// ============================================================================
// INITIAL FALLBACK DATA (Replaced immediately by Tauri IPC on mount)
// ============================================================================
const INITIAL_NODES = [
  {
    id: 'sg-01',
    name: 'SG-01 • SLT Fiber Direct',
    region: 'SG',
    isp: 'SLT Fiber',
    address: 'sg01.metrovpn.io',
    port: 443,
    sni: 'st1.zoom.us',
    protocol: 'TCP • TLS+VCN',
    vcn: true,
    ping: null,
    quotaUsedGB: 0,
    quotaTotalGB: 100,
    starred: true,
    online: false,
    ip: 'sg01.metrovpn.io',
    uri: 'vless://a94b7c12-e3f1-48a2-b910-81c450d912fa@sg01.metrovpn.io:443?encryption=none&security=tls&sni=st1.zoom.us&type=tcp&vcn=vpn.metrodens.site#SG-01%20%E2%80%A2%20SLT%20Fiber%20Direct',
  },
];

const INITIAL_WINDOWS_APPS = [
  { id: 'chrome', name: 'Google Chrome', exe: 'chrome.exe', category: 'Browser', bypassed: false },
  { id: 'valorant', name: 'VALORANT', exe: 'VALORANT-Win64-Shipping.exe', category: 'Gaming', bypassed: true },
  { id: 'steam', name: 'Steam Client', exe: 'steam.exe', category: 'Gaming', bypassed: true },
  { id: 'discord', name: 'Discord', exe: 'Discord.exe', category: 'Comms', bypassed: false },
  { id: 'vscode', name: 'Visual Studio Code', exe: 'Code.exe', category: 'Developer', bypassed: false },
  { id: 'qbittorrent', name: 'qBittorrent', exe: 'qbittorrent.exe', category: 'Network', bypassed: false },
  { id: 'onedrive', name: 'Microsoft OneDrive', exe: 'OneDrive.exe', category: 'System', bypassed: true },
  { id: 'spotify', name: 'Spotify Desktop', exe: 'Spotify.exe', category: 'Media', bypassed: true },
];

const SAMPLE_VLESS_URI =
  'vless://f48e1a90-2b6c-4d19-9a77-81c450d912fa@sg04-slt.metrovpn.io:443?encryption=none&security=tls&sni=st2.zoom.us&vcn=vpn.metrodens.site&fp=chrome&type=tcp#SG-04%20%E2%80%A2%20SLT%20Ultra%20VCN';

const SAMPLE_JSON_PROFILE = `{
  "tag": "HK-02 • Hong Kong Express",
  "isp": "Dialog",
  "address": "hk02.metrovpn.io",
  "port": 443,
  "uuid": "7c2e19a0-5b44-41d8-9a77-62f109e3ab11",
  "sni": "cdn.zoom.us",
  "protocol": "vless",
  "streamSettings": {
    "network": "tcp",
    "security": "tls",
    "vcn": "strict"
  }
}`;

const DNS_OPTIONS = ['Cloudflare 1.1.1.1', 'Google 8.8.8.8', 'Quad9 9.9.9.9', 'Custom DoH'];
const MTU_OPTIONS = [1500, 1420, 1280];

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

function parsePreviewNode(raw, mode = 'uri') {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (mode === 'json' || trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      return {
        name: obj.tag || 'Imported Xray JSON Node',
        isp: obj.isp || 'SLT Fiber',
        sni: obj.sni || obj?.streamSettings?.tlsSettings?.serverName || 'st1.zoom.us',
        protocol: 'TCP • TLS+VCN',
      };
    } catch {
      return null;
    }
  }
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith('vless://') && !lower.startsWith('vmess://')) return null;
  const hashIdx = trimmed.indexOf('#');
  let name = 'Imported Tunnel Node';
  if (hashIdx !== -1 && hashIdx < trimmed.length - 1) {
    try {
      name = decodeURIComponent(trimmed.slice(hashIdx + 1));
    } catch {
      name = trimmed.slice(hashIdx + 1);
    }
  }
  const sniMatch = trimmed.match(/sni=([^&#]+)/i);
  return {
    name,
    isp: lower.includes('dialog') ? 'Dialog' : lower.includes('mobitel') ? 'Mobitel' : 'SLT Fiber',
    sni: sniMatch ? sniMatch[1] : 'st1.zoom.us',
    protocol: lower.includes('vcn=') || lower.includes('reality') ? 'TCP • TLS+VCN' : 'TCP • TLS 1.3',
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

function MetroProvider({ children }) {
  const [activeRoute, setActiveRoute] = useState('home');
  const [railExpanded, setRailExpanded] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [windowMinimizedToTray, setWindowMinimizedToTray] = useState(false);
  const [trayFlyoutOpen, setTrayFlyoutOpen] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connected' | 'connecting' | 'disconnected'
  const [sessionSeconds, setSessionSeconds] = useState(0);

  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [activeNodeId, setActiveNodeId] = useState(INITIAL_NODES[0].id);
  const [testingAllPings, setTestingAllPings] = useState(false);

  const [downHistory, setDownHistory] = useState(Array(14).fill(0));
  const [upHistory, setUpHistory] = useState(Array(14).fill(0));
  const [totalSessionBytes, setTotalSessionBytes] = useState({ down: 0, up: 0 });

  const [speedTestActive, setSpeedTestActive] = useState(false);
  const [speedTestProgress, setSpeedTestProgress] = useState(null);
  const [speedHistory, setSpeedHistory] = useState([]);

  const [systemMode, setSystemMode] = useState('PROXY'); // 'TUN' | 'PROXY'
  const [tunnelProfile, setTunnelProfile] = useState('Strict VCN');
  const [lanProxySharing, setLanProxySharing] = useState(false);
  const [localLanIp, setLocalLanIp] = useState('127.0.0.1');
  const [splitTunneling, setSplitTunneling] = useState(true);
  const [windowsApps, setWindowsApps] = useState(INITIAL_WINDOWS_APPS);
  const [bypassLan, setBypassLan] = useState(true);
  const [dnsResolver, setDnsResolver] = useState('Cloudflare 1.1.1.1');
  const [customDohUrl, setCustomDohUrl] = useState('https://dns.quad9.net/dns-query');
  const [mtu, setMtu] = useState(1420);
  const [certPinning, setCertPinning] = useState(true);
  const [startWithWindows, setStartWithWindows] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalTab, setAddModalTab] = useState('uri');
  const [appsModalOpen, setAppsModalOpen] = useState(false);
  const [logsDrawerOpen, setLogsDrawerOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [pendingTunNodeId, setPendingTunNodeId] = useState(null);
  const [shareNodeModal, setShareNodeModal] = useState(null);
  const [editNodeModal, setEditNodeModal] = useState(null);

  const [logs, setLogs] = useState([]);
  const [logsStreaming, setLogsStreaming] = useState(true);
  const [toasts, setToasts] = useState([]);

  const logsStreamingRef = useRef(true);
  useEffect(() => {
    logsStreamingRef.current = logsStreaming;
  }, [logsStreaming]);

  const pushToast = useCallback((message, tone = 'neutral') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const appendLog = useCallback((tag, msg) => {
    const now = new Date();
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((v) => String(v).padStart(2, '0'))
      .join(':');
    setLogs((prev) => [...prev.slice(-499), { id: `l-${Date.now()}-${Math.random()}`, time, tag, msg }]);
  }, []);

  const applySettingsObject = useCallback((s) => {
    if (!s) return;
    setSystemMode(s.systemMode || 'PROXY');
    setTunnelProfile(s.tunnelProfile || 'Strict VCN');
    setLanProxySharing(Boolean(s.lanProxySharing));
    setSplitTunneling(Boolean(s.splitTunneling));
    setBypassLan(Boolean(s.bypassLan));
    setDnsResolver(s.dnsResolver || 'Cloudflare 1.1.1.1');
    setCustomDohUrl(s.customDohUrl || 'https://dns.quad9.net/dns-query');
    setMtu(s.mtu || 1420);
    setCertPinning(Boolean(s.certPinning));
    setStartWithWindows(Boolean(s.startWithWindows));
    if (s.activeNodeId) setActiveNodeId(s.activeNodeId);
    if (Array.isArray(s.windowsApps)) setWindowsApps(s.windowsApps);
  }, []);

  // Hydrate initial state and subscribe to Tauri v2 backend events
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
        if (Array.isArray(srvList) && srvList.length > 0) setNodes(srvList);
        applySettingsObject(settings);
        if (status) {
          setConnectionStatus(status.status.toLowerCase());
          setSessionSeconds(status.elapsedSecs || 0);
          setLocalLanIp(status.localLanIp || '127.0.0.1');
          if (status.activeNodeId) setActiveNodeId(status.activeNodeId);
          if (status.systemMode) setSystemMode(status.systemMode);
        }
        if (Array.isArray(initLogs)) setLogs(initLogs);
        if (Array.isArray(history)) setSpeedHistory(history);
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
          if (status.systemMode) setSystemMode(status.systemMode);
          if (status.activeNodeId) setActiveNodeId(status.activeNodeId);
          if (status.localLanIp) setLocalLanIp(status.localLanIp);
          if (norm === 'disconnected') {
            setDownHistory(Array(14).fill(0));
            setUpHistory(Array(14).fill(0));
          }
          if (status.status === 'Error' && status.message) {
            pushToast(status.message, 'amber');
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

    return () => {
      mounted = false;
      unsubs.forEach((u) => typeof u === 'function' && u());
    };
  }, [applySettingsObject, appendLog, pushToast]);

  const activeNode = useMemo(
    () => nodes.find((n) => n.id === activeNodeId) || nodes[0],
    [nodes, activeNodeId]
  );

  const persistSettingsPatch = useCallback(
    async (patch) => {
      const next = {
        systemMode,
        tunnelProfile,
        lanProxySharing,
        splitTunneling,
        bypassLan,
        dnsResolver,
        customDohUrl,
        mtu,
        certPinning,
        startWithWindows,
        activeNodeId,
        windowsApps,
        ...patch,
      };
      applySettingsObject(next);
      if (IN_TAURI) {
        try {
          await invokeCmd('update_settings', { settings: next });
        } catch (err) {
          pushToast(`Settings error: ${String(err)}`, 'amber');
        }
      }
    },
    [
      systemMode,
      tunnelProfile,
      lanProxySharing,
      splitTunneling,
      bypassLan,
      dnsResolver,
      customDohUrl,
      mtu,
      certPinning,
      startWithWindows,
      activeNodeId,
      windowsApps,
      applySettingsObject,
      pushToast,
    ]
  );

  const connectToNode = useCallback(
    async (nodeId, forcedMode) => {
      const target = nodes.find((n) => n.id === nodeId);
      if (!target) return;
      const modeToUse = forcedMode || systemMode;
      setActiveNodeId(nodeId);
      setConnectionStatus('connecting');

      if (!IN_TAURI) {
        setTimeout(() => {
          setConnectionStatus('connected');
          setSessionSeconds(1);
          pushToast(`Connected to ${target.name}`, 'success');
        }, 500);
        return;
      }

      try {
        await invokeCmd('connect_server', { id: nodeId, mode: modeToUse });
        pushToast(`Protected via ${target.name}`, 'success');
      } catch (err) {
        const msg = String(err);
        setConnectionStatus('disconnected');
        if (msg.includes('ADMIN_REQUIRED')) {
          setPendingTunNodeId(nodeId);
          setAdminModalOpen(true);
        } else {
          pushToast(`Connection failed: ${msg}`, 'amber');
        }
      }
    },
    [nodes, systemMode, pushToast]
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
      setConnectionStatus('disconnected');
      setSessionSeconds(0);
      pushToast(`Disconnected from ${activeNode?.name || 'VPN'}`, 'neutral');
    } else if (activeNode) {
      await connectToNode(activeNode.id, systemMode);
    }
  }, [connectionStatus, activeNode, systemMode, connectToNode, pushToast]);

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
      if (nodes.length <= 1) {
        pushToast('At least one tunnel node is required', 'amber');
        return;
      }
      const target = nodes.find((n) => n.id === nodeId);
      if (IN_TAURI) {
        try {
          const updated = await invokeCmd('delete_server', { id: nodeId });
          setNodes(updated);
          if (activeNodeId === nodeId && updated[0]) setActiveNodeId(updated[0].id);
          pushToast(`Removed ${target?.name || 'node'}`, 'neutral');
          return;
        } catch (err) {
          pushToast(String(err), 'amber');
          return;
        }
      }
      const remaining = nodes.filter((n) => n.id !== nodeId);
      setNodes(remaining);
      if (activeNodeId === nodeId && remaining[0]) setActiveNodeId(remaining[0].id);
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
    if (testingAllPings) return;
    setTestingAllPings(true);
    if (IN_TAURI) {
      try {
        await invokeCmd('ping_all_servers');
        pushToast('Concurrent TCP/TLS latency test complete', 'success');
      } catch (err) {
        pushToast(`Ping failed: ${String(err)}`, 'amber');
      } finally {
        setTestingAllPings(false);
      }
    } else {
      setTimeout(() => setTestingAllPings(false), 600);
    }
  }, [testingAllPings, pushToast]);

  const toggleSystemMode = useCallback(
    async (forcedMode) => {
      const next = forcedMode || (systemMode === 'TUN' ? 'PROXY' : 'TUN');
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
      await persistSettingsPatch({ systemMode: next });
      pushToast(
        next === 'TUN' ? 'TUN Mode selected (Wintun NIC)' : 'System Proxy selected (127.0.0.1:10809)',
        'neutral'
      );
    },
    [systemMode, activeNode, persistSettingsPatch, pushToast]
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
      const nextApps = windowsApps.map((a) =>
        a.id === appId ? { ...a, bypassed: !a.bypassed } : a
      );
      await persistSettingsPatch({ windowsApps: nextApps });
    },
    [windowsApps, persistSettingsPatch]
  );

  const value = {
    activeRoute,
    setActiveRoute,
    railExpanded,
    setRailExpanded,
    isMaximized,
    setIsMaximized,
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
    activeNodeId,
    setActiveNodeId,
    connectToNode,
    toggleStarNode,
    deleteNode,
    updateNodeDetails,
    testingAllPings,
    testAllPings,
    downHistory,
    upHistory,
    totalSessionBytes,
    speedTestActive,
    setSpeedTestActive,
    speedTestProgress,
    speedHistory,
    setSpeedHistory,
    clearSpeedHistory,
    systemMode,
    toggleSystemMode,
    tunnelProfile,
    setTunnelProfile: (v) => persistSettingsPatch({ tunnelProfile: v }),
    lanProxySharing,
    setLanProxySharing: (v) => persistSettingsPatch({ lanProxySharing: v }),
    localLanIp,
    setLocalLanIp,
    splitTunneling,
    setSplitTunneling: (v) => persistSettingsPatch({ splitTunneling: v }),
    windowsApps,
    setWindowsApps: (apps) => persistSettingsPatch({ windowsApps: apps }),
    toggleWindowsAppBypass,
    bypassLan,
    setBypassLan: (v) => persistSettingsPatch({ bypassLan: v }),
    dnsResolver,
    setDnsResolver: (v) => persistSettingsPatch({ dnsResolver: v }),
    customDohUrl,
    setCustomDohUrl: (v) => persistSettingsPatch({ customDohUrl: v }),
    mtu,
    setMtu: (v) => persistSettingsPatch({ mtu: v }),
    certPinning,
    setCertPinning: (v) => persistSettingsPatch({ certPinning: v }),
    startWithWindows,
    setStartWithWindows: (v) => persistSettingsPatch({ startWithWindows: v }),
    addModalOpen,
    setAddModalOpen,
    addModalTab,
    setAddModalTab,
    openAddModal,
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

  const innerScallop = useMemo(() => generateScallopedPath(110, 110, 74, 6.4, 12, 120), []);
  const innerCircle = useMemo(() => generateScallopedPath(110, 110, 74, 0, 12, 120), []);
  const outerWavyRing = useMemo(() => generateScallopedPath(110, 110, 96, 5.2, 12, 120), []);
  const outerSubtleCircle = useMemo(() => generateScallopedPath(110, 110, 92, 0, 12, 120), []);

  const iconSize = size >= 180 ? 'w-14 h-14' : 'w-7 h-7';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.94 }}
      transition={SPRING}
      aria-label={isConnected ? 'Disconnect VPN' : 'Connect VPN'}
      className="relative flex items-center justify-center cursor-pointer select-none focus:outline-none group"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 220 220" className="w-full h-full overflow-visible">
        <motion.g
          style={{ originX: '110px', originY: '110px' }}
          animate={
            isConnecting
              ? { rotate: 360, scale: [0.97, 1.03, 0.97] }
              : isConnected
              ? { rotate: [0, 360], scale: [1, 1.018, 1] }
              : { rotate: 0, scale: 0.96 }
          }
          transition={
            isConnecting
              ? {
                  rotate: { repeat: Infinity, duration: 4.2, ease: 'linear' },
                  scale: { repeat: Infinity, duration: 1.4, ease: 'easeInOut' },
                }
              : isConnected
              ? {
                  rotate: { repeat: Infinity, duration: 42, ease: 'linear' },
                  scale: { repeat: Infinity, duration: 3.8, ease: 'easeInOut' },
                }
              : SPRING
          }
        >
          <motion.path
            initial={false}
            animate={{
              d: isConnected || isConnecting ? outerWavyRing : outerSubtleCircle,
              stroke: isConnected
                ? COLORS.coral
                : isConnecting
                ? COLORS.amber
                : '#3B2E2F',
              strokeOpacity: isConnected ? 0.95 : isConnecting ? 0.9 : 0.65,
            }}
            transition={SPRING_SOFT}
            fill="none"
            strokeWidth={isConnected || isConnecting ? 3.2 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.g>

        <motion.g
          style={{ originX: '110px', originY: '110px' }}
          animate={
            isConnected
              ? { scale: [1, 1.016, 1] }
              : isConnecting
              ? { scale: [0.96, 1.02, 0.96] }
              : { scale: 1 }
          }
          transition={
            isConnected
              ? { repeat: Infinity, duration: 3.8, ease: 'easeInOut' }
              : isConnecting
              ? { repeat: Infinity, duration: 1.2, ease: 'easeInOut' }
              : SPRING
          }
        >
          <motion.path
            initial={false}
            animate={{
              d: isConnected ? innerScallop : isConnecting ? innerScallop : innerCircle,
              fill: isConnected
                ? COLORS.crimson
                : isConnecting
                ? '#6E1419'
                : '#261F20',
              stroke: isConnected
                ? '#BA1D25'
                : isConnecting
                ? COLORS.amber
                : '#4A3637',
            }}
            transition={SPRING}
            strokeWidth={1.8}
          />
        </motion.g>
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
            className={size >= 180 ? 'w-12 h-12' : 'w-6 h-6'}
            strokeWidth={1.9}
            style={{ color: COLORS.coral }}
          />
        )}
      </motion.div>
    </motion.button>
  );
}

// ============================================================================
// CUSTOM 44px WINDOWS 11 FRAMELESS TITLEBAR
// ============================================================================
function Titlebar() {
  const {
    openAddModal,
    isMaximized,
    setIsMaximized,
    trayFlyoutOpen,
    setTrayFlyoutOpen,
    minimizeToTray,
  } = useMetro();

  return (
    <header
      data-tauri-drag-region=""
      className="h-[44px] w-full flex items-center justify-between pl-4 pr-2 select-none shrink-0 border-b"
      style={{
        backgroundColor: COLORS.obsidian,
        borderColor: '#231D1E',
      }}
    >
      <div data-tauri-drag-region="" className="flex items-center gap-2.5 min-w-0">
        <div
          className="w-7 h-7 rounded-[9px] flex items-center justify-center shrink-0 pointer-events-none overflow-hidden"
          style={{
            backgroundColor: '#241B1C',
            border: '1px solid #3B2B2C',
          }}
        >
          <img src={metrovpnApkIcon} alt="Metrovpn" className="w-5 h-5 object-contain" />
        </div>
        <img
          src={metrovpnWordmark}
          alt="Metrovpn"
          className="h-[22px] w-auto object-contain pointer-events-none select-none"
        />
        <span
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium pointer-events-none"
          style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.surfaceBorder}`,
            color: COLORS.textMuted,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.coral }} />
          v2.4 • Xray
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          transition={SPRING}
          onClick={() => openAddModal('uri')}
          className="h-[29px] px-3 rounded-full flex items-center gap-1.5 text-[12px] font-semibold cursor-pointer transition-colors"
          style={{
            backgroundColor: COLORS.taupe,
            color: COLORS.textPrimary,
            border: '1px solid #604645',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = COLORS.taupeHover)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = COLORS.taupe)}
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          <span>Add Config</span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.95 }}
          transition={SPRING}
          onClick={() => openAddModal('qr')}
          title="Scan QR / Clipboard Import"
          className="w-[29px] h-[29px] rounded-full flex items-center justify-center cursor-pointer transition-colors"
          style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.surfaceBorder}`,
            color: COLORS.textPrimary,
          }}
        >
          <QrCode className="w-3.5 h-3.5" />
        </motion.button>

        {!IN_TAURI && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            transition={SPRING}
            onClick={() => setTrayFlyoutOpen((v) => !v)}
            title="Toggle 320x420 Windows System Tray Quick Flyout"
            className="hidden md:inline-flex h-[29px] px-2.5 rounded-full items-center gap-1.5 text-[11.5px] font-medium cursor-pointer transition-colors"
            style={{
              backgroundColor: trayFlyoutOpen ? COLORS.surfaceActive : COLORS.surface,
              border: `1px solid ${trayFlyoutOpen ? COLORS.surfaceActiveBorder : COLORS.surfaceBorder}`,
              color: trayFlyoutOpen ? COLORS.textPrimary : COLORS.textMuted,
            }}
          >
            <PanelRight className="w-3.5 h-3.5" style={{ color: trayFlyoutOpen ? COLORS.coral : COLORS.textMuted }} />
            <span>Tray Preview</span>
          </motion.button>
        )}

        <div className="w-px h-4 mx-1" style={{ backgroundColor: '#2E2627' }} />

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Minimize"
            onClick={() => windowMinimize()}
            className="w-8 h-7 rounded-[7px] flex items-center justify-center cursor-pointer transition-colors hover:bg-[#251F20]"
            style={{ color: COLORS.textMuted }}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            title={isMaximized ? 'Restore Window' : 'Maximize Window'}
            onClick={async () => {
              if (IN_TAURI) {
                const max = await windowToggleMaximize();
                setIsMaximized(max);
              } else {
                setIsMaximized((m) => !m);
              }
            }}
            className="w-8 h-7 rounded-[7px] flex items-center justify-center cursor-pointer transition-colors hover:bg-[#251F20]"
            style={{ color: COLORS.textMuted }}
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Square className="w-3 h-3" />}
          </button>

          <button
            type="button"
            title="Close to Windows System Tray"
            onClick={minimizeToTray}
            className="w-8 h-7 rounded-[7px] flex items-center justify-center cursor-pointer transition-colors hover:bg-[#9B0A12] hover:text-[#F4ECEC]"
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
    railExpanded,
    setRailExpanded,
    connectionStatus,
    systemMode,
    toggleSystemMode,
  } = useMetro();

  const [hoveredId, setHoveredId] = useState(null);

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
    <motion.aside
      initial={false}
      animate={{ width: railExpanded ? 200 : 84 }}
      transition={SPRING}
      className="h-full rounded-[26px] flex flex-col justify-between py-3 px-3 shrink-0 relative z-20 select-none"
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.surfaceBorder}`,
      }}
    >
      <div className="flex flex-col gap-2">
        <div className={`flex items-center ${railExpanded ? 'justify-between px-1.5' : 'justify-center'} pb-1`}>
          {railExpanded && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[10.5px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: COLORS.textMuted }}
            >
              Navigation
            </motion.span>
          )}
          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            transition={SPRING}
            onClick={() => setRailExpanded((e) => !e)}
            title={railExpanded ? 'Collapse Navigation Rail' : 'Expand Navigation Rail'}
            className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-[#2A2223]"
            style={{ color: COLORS.textMuted, border: '1px solid #302728' }}
          >
            {railExpanded ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </motion.button>
        </div>

        <nav className="flex flex-col gap-1.5 mt-1" aria-label="Main navigation">
          {NAV_ROUTES.map((item) => {
            const Icon = item.icon;
            const active = activeRoute === item.id;
            return (
              <div
                key={item.id}
                className="relative"
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING}
                  onClick={() => setActiveRoute(item.id)}
                  className={`relative w-full h-[48px] rounded-[18px] flex items-center cursor-pointer transition-colors ${
                    railExpanded ? 'px-3.5 gap-3 justify-start' : 'justify-center'
                  }`}
                  style={{ color: active ? COLORS.textPrimary : COLORS.textMuted }}
                >
                  {active && (
                    <motion.div
                      layoutId="metroRailActivePill"
                      transition={SPRING}
                      className="absolute inset-0 rounded-[18px]"
                      style={{ backgroundColor: COLORS.crimson, border: '1px solid #BC1F27' }}
                    />
                  )}
                  {!active && hoveredId === item.id && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 rounded-[18px]"
                      style={{ backgroundColor: '#262021' }}
                    />
                  )}

                  <Icon className="w-[19px] h-[19px] relative z-10 shrink-0" strokeWidth={active ? 2.25 : 1.9} />
                  {railExpanded && (
                    <motion.span
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.14 }}
                      className="relative z-10 font-jakarta font-semibold text-[13.5px] whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </motion.button>

                <AnimatePresence>
                  {!railExpanded && hoveredId === item.id && (
                    <motion.div
                      initial={{ opacity: 0, x: -4, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -4, scale: 0.95 }}
                      transition={{ duration: 0.12 }}
                      className="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-[10px] text-[12px] font-semibold whitespace-nowrap pointer-events-none z-50 shadow-xl"
                      style={{
                        backgroundColor: '#261F20',
                        border: '1px solid #3D3132',
                        color: COLORS.textPrimary,
                      }}
                    >
                      {item.label}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-2 pt-2.5 border-t" style={{ borderColor: '#2A2223' }}>
        <div
          className={`flex items-center rounded-[14px] py-2 ${
            railExpanded ? 'px-3 gap-2.5 justify-start' : 'justify-center'
          }`}
          style={{ backgroundColor: '#151213' }}
          title={`Status: ${statusLabel}`}
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
          {railExpanded && (
            <div className="min-w-0">
              <p className="text-[12px] font-semibold leading-tight truncate" style={{ color: COLORS.textPrimary }}>
                {statusLabel}
              </p>
              <p className="text-[10.5px] leading-tight" style={{ color: COLORS.textMuted }}>
                VLESS • Xray
              </p>
            </div>
          )}
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          transition={SPRING}
          onClick={() => toggleSystemMode()}
          title={`System Mode: ${systemMode === 'TUN' ? 'TUN Mode' : 'System Proxy'} (Click to switch)`}
          className={`w-full rounded-[16px] py-2 flex items-center cursor-pointer transition-colors ${
            railExpanded ? 'px-3 justify-between' : 'flex-col justify-center gap-0.5'
          }`}
          style={{
            backgroundColor: systemMode === 'TUN' ? COLORS.surfaceActive : '#221C1D',
            border: `1px solid ${systemMode === 'TUN' ? COLORS.surfaceActiveBorder : COLORS.surfaceBorder}`,
          }}
        >
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 shrink-0" style={{ color: systemMode === 'TUN' ? COLORS.coral : COLORS.amber }} />
            {railExpanded && (
              <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: COLORS.textPrimary }}>
                {systemMode === 'TUN' ? 'TUN Mode' : 'Sys Proxy'}
              </span>
            )}
          </div>
          {!railExpanded ? (
            <span
              className="font-mono text-[9.5px] font-semibold tracking-wider"
              style={{ color: systemMode === 'TUN' ? COLORS.textPrimary : COLORS.amber }}
            >
              {systemMode === 'TUN' ? 'TUN' : 'PRX'}
            </span>
          ) : (
            <span
              className="font-mono text-[10px] px-1.5 py-0.5 rounded-md font-semibold"
              style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}
            >
              {systemMode}
            </span>
          )}
        </motion.button>
      </div>
    </motion.aside>
  );
}

// ============================================================================
// SCREEN 1: HOME DASHBOARD
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
    setActiveRoute,
    pushToast,
  } = useMetro();

  const [copiedProxy, setCopiedProxy] = useState(false);

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  const downNow = formatThroughput(downHistory[downHistory.length - 1] || 0);
  const upNow = formatThroughput(upHistory[upHistory.length - 1] || 0);

  const downSpark = useMemo(() => buildSparklinePath(downHistory, 180, 34, 4), [downHistory]);
  const upSpark = useMemo(() => buildSparklinePath(upHistory, 180, 34, 4), [upHistory]);

  const handleCopyLocalProxy = async () => {
    const addr = `${localLanIp}:10808`;
    await copyClipboard(addr);
    setCopiedProxy(true);
    pushToast(`Copied local proxy ${addr}`, 'success');
    setTimeout(() => setCopiedProxy(false), 1800);
  };

  return (
    <motion.div
      key="screen-home"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={SPRING_SOFT}
      className="h-full grid grid-cols-1 lg:grid-cols-[55%_45%] gap-4 items-stretch"
    >
      <div
        className="rounded-[28px] p-6 flex flex-col items-center justify-center relative overflow-hidden"
        style={{
          backgroundColor: COLORS.surface,
          border: `1px solid ${COLORS.surfaceBorder}`,
          minHeight: 540,
        }}
      >
        <motion.div
          layout
          className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full text-[12.5px] font-semibold"
          style={{
            backgroundColor: '#241E1F',
            border: '1px solid #3A3031',
            color: COLORS.textPrimary,
          }}
        >
          <span className="relative flex h-2.5 w-2.5">
            {connectionStatus !== 'disconnected' && (
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                style={{ backgroundColor: isConnected ? COLORS.mint : COLORS.amber }}
              />
            )}
            <span
              className="relative inline-flex rounded-full h-2.5 w-2.5"
              style={{
                backgroundColor: isConnected ? COLORS.mint : isConnecting ? COLORS.amber : '#7B6D6E',
              }}
            />
          </span>
          <span>
            {isConnected
              ? `Protected • VLESS • ${activeNode?.vcn ? 'VCN' : 'TLS'}`
              : isConnecting
              ? 'Connecting...'
              : 'Disconnected'}
          </span>
        </motion.div>

        <div
          className="mt-4 mb-5 font-mono tabular-nums text-[44px] font-bold tracking-[-0.03em] leading-none"
          style={{ color: isConnected ? COLORS.textPrimary : '#6E6162' }}
        >
          {isConnected ? formatTimer(sessionSeconds) : '00:00:00'}
        </div>

        <ScallopedConnectButton size={220} status={connectionStatus} onClick={toggleConnection} />

        <p
          className="mt-5 text-[13px] font-medium text-center"
          style={{ color: isConnected ? '#CBBBBC' : COLORS.textMuted }}
        >
          {isConnected
            ? 'Encrypted tunnel active • Click to disconnect'
            : isConnecting
            ? `Performing Xray ${tunnelProfile} handshake...`
            : 'Tunnel inactive • Click to establish encrypted link'}
        </p>
      </div>

      <div className="flex flex-col justify-between gap-3.5 pr-0.5">
        <div className="grid grid-cols-2 gap-3.5">
          <motion.div
            whileHover={{ borderColor: '#453536' }}
            transition={SPRING}
            className="rounded-[24px] pt-4 px-4 pb-0 flex flex-col justify-between overflow-hidden"
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.surfaceBorder}`,
              minHeight: 164,
            }}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold" style={{ color: COLORS.textMuted }}>
                  Download
                </span>
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#3A181B', border: '1px solid #632429', color: COLORS.coral }}
                >
                  <ArrowDown className="w-4 h-4" strokeWidth={2.4} />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span
                  className="font-mono tabular-nums text-[26px] font-bold tracking-tight leading-none"
                  style={{ color: COLORS.textPrimary }}
                >
                  {downNow.value}
                </span>
                <span className="font-mono text-[12px] font-medium" style={{ color: COLORS.coral }}>
                  {downNow.unit}
                </span>
              </div>
            </div>

            <div className="w-full h-[38px] mt-3 -mx-4 px-0" style={{ width: 'calc(100% + 2rem)' }}>
              <svg viewBox="0 0 180 34" preserveAspectRatio="none" className="w-full h-full block">
                <defs>
                  <linearGradient id="homeDownSpark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.coral} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={COLORS.coral} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {downSpark && (
                  <>
                    <path d={`${downSpark} L 180 34 L 0 34 Z`} fill="url(#homeDownSpark)" />
                    <path d={downSpark} fill="none" stroke={COLORS.coral} strokeWidth="2.1" strokeLinecap="round" />
                  </>
                )}
              </svg>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ borderColor: '#453536' }}
            transition={SPRING}
            className="rounded-[24px] pt-4 px-4 pb-0 flex flex-col justify-between overflow-hidden"
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.surfaceBorder}`,
              minHeight: 164,
            }}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold" style={{ color: COLORS.textMuted }}>
                  Upload
                </span>
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: COLORS.amberBg, border: '1px solid #594729', color: COLORS.amber }}
                >
                  <ArrowUp className="w-4 h-4" strokeWidth={2.4} />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span
                  className="font-mono tabular-nums text-[26px] font-bold tracking-tight leading-none"
                  style={{ color: COLORS.textPrimary }}
                >
                  {upNow.value}
                </span>
                <span className="font-mono text-[12px] font-medium" style={{ color: COLORS.amber }}>
                  {upNow.unit}
                </span>
              </div>
            </div>

            <div className="w-full h-[38px] mt-3 -mx-4 px-0" style={{ width: 'calc(100% + 2rem)' }}>
              <svg viewBox="0 0 180 34" preserveAspectRatio="none" className="w-full h-full block">
                <defs>
                  <linearGradient id="homeUpSpark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.amber} stopOpacity="0.26" />
                    <stop offset="100%" stopColor={COLORS.amber} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {upSpark && (
                  <>
                    <path d={`${upSpark} L 180 34 L 0 34 Z`} fill="url(#homeUpSpark)" />
                    <path d={upSpark} fill="none" stroke={COLORS.amber} strokeWidth="2.1" strokeLinecap="round" />
                  </>
                )}
              </svg>
            </div>
          </motion.div>
        </div>

        <motion.div
          whileHover={{ y: -1.5, borderColor: '#734C4A' }}
          whileTap={{ scale: 0.99 }}
          transition={SPRING}
          onClick={() => setActiveRoute('servers')}
          className="rounded-[24px] p-5 cursor-pointer flex flex-col justify-between flex-1"
          style={{ backgroundColor: COLORS.surfaceActive, border: `1px solid ${COLORS.surfaceActiveBorder}` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: '#D7B7B5' }}>
              Active Secure Exit
            </span>
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full font-mono tabular-nums text-[12px] font-semibold"
              style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}
            >
              {activeNode?.ping != null ? `${activeNode.ping} ms` : 'Unmeasured'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 my-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-jakarta font-bold text-[15px] shrink-0"
                style={{ backgroundColor: '#261818', border: '1px solid #684644', color: COLORS.textPrimary }}
              >
                {activeNode?.region || 'SG'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-jakarta font-bold text-[16px] leading-snug truncate" style={{ color: COLORS.textPrimary }}>
                    {activeNode?.name || 'No Server'}
                  </h2>
                  {activeNode?.vcn && (
                    <span
                      className="px-1.5 py-0.5 rounded-[6px] font-mono text-[10px] font-bold shrink-0"
                      style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}
                    >
                      VCN
                    </span>
                  )}
                </div>
                <p className="text-[12px] mt-0.5 truncate" style={{ color: '#CEB4B3' }}>
                  {activeNode?.protocol} • {activeNode?.isp}
                </p>
              </div>
            </div>

            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: '#2B1C1C', color: COLORS.textPrimary }}
            >
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>

          <div
            className="pt-3 border-t flex items-center justify-between text-[11.5px]"
            style={{ borderColor: '#523736', color: '#D3BABA' }}
          >
            <span className="truncate font-mono">{activeNode?.sni}</span>
            <span className="font-mono tabular-nums shrink-0 ml-2">{activeNode?.ip}</span>
          </div>
        </motion.div>

        <div
          className="rounded-[22px] p-4 flex flex-col gap-3"
          style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-[10.5px] uppercase tracking-wider block" style={{ color: COLORS.textMuted }}>
                  Tunneling Mode
                </span>
                <span className="font-jakarta font-semibold text-[13px]" style={{ color: COLORS.textPrimary }}>
                  {tunnelProfile}
                </span>
              </div>
              <div className="w-px h-7" style={{ backgroundColor: '#2E2627' }} />
              <div>
                <span className="text-[10.5px] uppercase tracking-wider block" style={{ color: COLORS.textMuted }}>
                  Local {systemMode}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 font-jakarta font-semibold text-[13px]"
                  style={{ color: isConnected ? COLORS.mint : COLORS.textMuted }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: isConnected ? COLORS.mint : COLORS.textMuted }}
                  />
                  {isConnected ? 'Active' : 'Standby'}
                </span>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              transition={SPRING}
              onClick={handleCopyLocalProxy}
              className="h-[34px] px-3.5 rounded-full text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
              style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary, border: '1px solid #634947' }}
            >
              {copiedProxy ? <Check className="w-3.5 h-3.5" style={{ color: COLORS.mint }} /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedProxy ? 'Copied' : 'Copy Local Proxy'}</span>
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// WAVY QUOTA BAR
// ============================================================================
function WavyQuotaBar({ usedGB, totalGB, isConnectedCard }) {
  const [hovered, setHovered] = useState(false);
  const ratio = Math.max(0.04, Math.min(1, usedGB / Math.max(1, totalGB)));
  const remainingGB = Math.max(0, totalGB - usedGB);

  const totalW = 280;
  const fillW = Math.round(totalW * ratio);
  const wavePath = useMemo(() => generateWaveLinePath(fillW, 6, 2.5, 13), [fillW]);

  return (
    <div
      className="relative pt-1.5 pb-0.5 cursor-help"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => e.stopPropagation()}
    >
      <svg viewBox={`0 0 ${totalW} 12`} preserveAspectRatio="none" className="w-full h-[12px] overflow-visible block">
        <line
          x1={fillW}
          y1="6"
          x2={totalW}
          y2="6"
          stroke={isConnectedCard ? '#563D3B' : '#32292A'}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        {wavePath && (
          <path
            d={wavePath}
            fill="none"
            stroke={COLORS.coral}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="absolute -top-9 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-[10px] font-mono tabular-nums text-[11px] font-medium whitespace-nowrap z-30 shadow-xl pointer-events-none"
            style={{ backgroundColor: '#231C1D', border: '1px solid #493839', color: COLORS.textPrimary }}
          >
            <span style={{ color: COLORS.coral }}>{usedGB.toFixed(1)} GB</span> used •{' '}
            <span style={{ color: COLORS.mint }}>{remainingGB.toFixed(1)} GB</span> remaining
          </motion.div>
        )}
      </AnimatePresence>
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

  const dynamicIsps = useMemo(() => {
    const set = new Set(nodes.map((n) => n.isp).filter(Boolean));
    return Array.from(set);
  }, [nodes]);

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
      const res = await invokeCmd('ping_server', { id: nodeId });
      pushToast(res.pingMs != null ? `Latency: ${res.pingMs} ms` : 'Node ping timed out', res.online ? 'success' : 'amber');
    } catch (err) {
      pushToast(String(err), 'amber');
    }
  };

  return (
    <motion.div
      key="screen-servers"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={SPRING_SOFT}
      className="flex flex-col gap-3.5 pb-3"
    >
      <div
        className="rounded-[24px] px-5 py-4 flex items-center justify-between gap-4"
        style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}
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
            <div className="text-[10.5px] font-bold uppercase tracking-[0.13em]" style={{ color: COLORS.textMuted }}>
              CURRENT SECURE EXIT
            </div>
            <div className="font-jakarta font-bold text-[16px] leading-snug truncate mt-0.5" style={{ color: COLORS.textPrimary }}>
              {activeNode?.name || 'No Server'}
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="font-mono tabular-nums text-[15px] font-bold leading-tight" style={{ color: COLORS.amber }}>
            {activeNode?.ping != null ? `${activeNode.ping} ms` : '— ms'}
          </div>
          <div className="text-[11.5px] font-medium mt-0.5" style={{ color: COLORS.textMuted }}>
            {activeNode?.protocol}
          </div>
        </div>
      </div>

      <div
        className="rounded-[24px] p-4 flex flex-col gap-3"
        style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="flex-1 min-w-[230px] h-[40px] rounded-full px-4 flex items-center gap-2.5 transition-colors focus-within:border-[#593B39]"
            style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}` }}
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
              style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.textMuted }}
            >
              Ctrl+K
            </kbd>
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              transition={SPRING}
              onClick={testAllPings}
              disabled={testingAllPings}
              className="h-[40px] px-4 rounded-full text-[12.5px] font-semibold flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-70"
              style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary, border: '1px solid #634947' }}
            >
              <Zap className={`w-3.5 h-3.5 ${testingAllPings ? 'animate-pulse' : ''}`} style={{ color: COLORS.amber }} />
              <span>{testingAllPings ? 'Testing...' : 'Test All Pings'}</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              transition={SPRING}
              onClick={testAllPings}
              className="h-[40px] px-3.5 rounded-full text-[12px] font-semibold flex items-center gap-2 cursor-pointer"
              style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.textPrimary }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.mint }} />
              <span className="font-mono tabular-nums">{onlineCount} Online</span>
              <RefreshCw className={`w-3.5 h-3.5 ${testingAllPings ? 'animate-spin' : ''}`} style={{ color: COLORS.textMuted }} />
            </motion.button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {filterChips.map((chip) => {
            const isActive = selectedFilter === chip.id;
            return (
              <motion.button
                key={chip.id}
                whileTap={{ scale: 0.95 }}
                transition={SPRING}
                onClick={() => setSelectedFilter(chip.id)}
                className="h-[31px] px-3 rounded-full text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                style={{
                  backgroundColor: isActive ? COLORS.taupe : '#151213',
                  color: isActive ? COLORS.textPrimary : COLORS.textMuted,
                  border: `1px solid ${isActive ? '#684C4A' : COLORS.surfaceBorder}`,
                }}
              >
                {chip.brand ? (
                  <span
                    className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center shrink-0"
                    style={{ backgroundColor: chip.brand.bg, padding: 1.5 }}
                  >
                    <img src={chip.brand.img} alt={chip.label} className="w-full h-full object-cover rounded-full" />
                  </span>
                ) : (
                  isActive && <Check className="w-3.5 h-3.5" strokeWidth={2.6} />
                )}
                <span>{chip.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {filteredNodes.length === 0 ? (
        <div
          className="rounded-[24px] p-10 text-center flex flex-col items-center gap-3"
          style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}
        >
          <Globe className="w-8 h-8" style={{ color: COLORS.textMuted }} />
          <p className="font-jakarta font-semibold text-[15px]" style={{ color: COLORS.textPrimary }}>
            No tunnel nodes match your filter
          </p>
          <button
            type="button"
            onClick={() => openAddModal('uri')}
            className="px-4 py-2 rounded-full text-[12.5px] font-semibold cursor-pointer"
            style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary }}
          >
            + Add Tunnel Node
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredNodes.map((node) => {
            const isActiveNode = node.id === activeNodeId;
            const isConnectedCard = isActiveNode && connectionStatus === 'connected';
            const isConnectingCard = isActiveNode && connectionStatus === 'connecting';

            return (
              <motion.div
                key={node.id}
                layout
                whileHover={{ y: -1.5, borderColor: isActiveNode ? '#78504E' : '#453839' }}
                transition={SPRING}
                onClick={() => connectToNode(node.id)}
                className="rounded-[24px] p-4 cursor-pointer flex flex-col justify-between gap-3 relative"
                style={{
                  backgroundColor: isActiveNode ? COLORS.surfaceActive : COLORS.surface,
                  border: `1px solid ${isActiveNode ? COLORS.surfaceActiveBorder : COLORS.surfaceBorder}`,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <IspBadge node={node} size={40} isActive={isActiveNode} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-jakarta font-bold text-[14.5px] truncate" style={{ color: COLORS.textPrimary }}>
                          {node.name}
                        </h3>
                        {isConnectedCard && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[9.5px] font-bold tracking-wider uppercase shrink-0"
                            style={{ backgroundColor: COLORS.crimson, color: '#FFF1F1' }}
                          >
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
                      </div>
                      <p className="text-[12px] truncate mt-0.5" style={{ color: isActiveNode ? '#D2B7B6' : COLORS.textMuted }}>
                        {node.isp} — <span className="font-mono text-[11.5px]">{node.sni}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0 relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => toggleStarNode(node.id)}
                      title={node.starred ? 'Unstar node' : 'Star node'}
                      className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-black/20"
                    >
                      <Star
                        className="w-4 h-4"
                        fill={node.starred ? COLORS.amber : 'none'}
                        style={{ color: node.starred ? COLORS.amber : COLORS.textMuted }}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => setOpenMenuId(openMenuId === node.id ? null : node.id)}
                      title="Node options"
                      className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-black/20"
                      style={{ color: COLORS.textMuted }}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    <AnimatePresence>
                      {openMenuId === node.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.94, y: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.94, y: -4 }}
                          transition={{ duration: 0.14 }}
                          className="absolute right-0 top-9 w-[154px] rounded-[16px] p-1.5 z-40 shadow-2xl"
                          style={{ backgroundColor: '#231D1E', border: '1px solid #3D3132' }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              setEditNodeModal(node);
                            }}
                            className="w-full px-2.5 py-2 rounded-[10px] text-[12px] font-medium flex items-center gap-2.5 cursor-pointer hover:bg-[#312829]"
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
                            className="w-full px-2.5 py-2 rounded-[10px] text-[12px] font-medium flex items-center gap-2.5 cursor-pointer hover:bg-[#312829]"
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
                              pushToast(`Copied URI for ${node.name}`, 'success');
                            }}
                            className="w-full px-2.5 py-2 rounded-[10px] text-[12px] font-medium flex items-center gap-2.5 cursor-pointer hover:bg-[#312829]"
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
                            className="w-full px-2.5 py-2 rounded-[10px] text-[12px] font-medium flex items-center gap-2.5 cursor-pointer hover:bg-[#3F1B1D]"
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
                  <motion.button
                    type="button"
                    onClick={(e) => handleSinglePing(e, node.id)}
                    animate={testingAllPings ? { opacity: [0.45, 1, 0.45] } : { opacity: 1 }}
                    transition={testingAllPings ? { repeat: Infinity, duration: 0.7 } : {}}
                    title="Click to test node latency"
                    className="px-2.5 py-0.5 rounded-[8px] font-mono tabular-nums text-[11.5px] font-semibold cursor-pointer"
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
                      : 'Timeout / Ping'}
                  </motion.button>
                  <span
                    className="px-2.5 py-0.5 rounded-[8px] text-[11px] font-medium"
                    style={{
                      backgroundColor: isActiveNode ? '#2A1C1C' : '#151213',
                      border: `1px solid ${isActiveNode ? '#523837' : '#2A2324'}`,
                      color: isActiveNode ? '#DFC7C6' : COLORS.textMuted,
                    }}
                  >
                    {node.protocol}
                  </span>
                  {node.vcn && (
                    <span
                      className="px-2 py-0.5 rounded-[8px] font-mono text-[10.5px] font-bold"
                      style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}
                    >
                      VCN
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10.5px] font-mono tabular-nums mb-0.5">
                    <span style={{ color: isActiveNode ? '#CCB1B0' : COLORS.textMuted }}>Quota Usage</span>
                    <span style={{ color: COLORS.textPrimary }}>
                      {(node.quotaUsedGB || 0).toFixed(1)} / {node.quotaTotalGB || 100} GB
                    </span>
                  </div>
                  <WavyQuotaBar
                    usedGB={node.quotaUsedGB || 0}
                    totalGB={node.quotaTotalGB || 100}
                    isConnectedCard={isActiveNode}
                  />
                </div>
              </motion.div>
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
    connectionStatus,
    pushToast,
  } = useMetro();

  const [selectedTestNodeId, setSelectedTestNodeId] = useState(activeNode?.id || '');
  const [serverDropdownOpen, setServerDropdownOpen] = useState(false);

  const testNode = useMemo(
    () => nodes.find((n) => n.id === selectedTestNodeId) || activeNode,
    [nodes, selectedTestNodeId, activeNode]
  );

  const [phase, setPhase] = useState('ready');
  const [gaugeSpeed, setGaugeSpeed] = useState(0);
  const [gaugeFraction, setGaugeFraction] = useState(0);
  const [metrics, setMetrics] = useState({
    ping: testNode?.ping ?? 0,
    jitter: 0,
    download: 0,
    upload: 0,
  });

  const [bars, setBars] = useState(() => Array.from({ length: 22 }, (_, i) => 16 + ((i * 11) % 30)));

  // Drive Speed screen directly from live backend speedtest://progress events
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

  // Drive 22 telemetry equalizer bars from real throughput + speed test activity
  useEffect(() => {
    const latestMbps = Math.max(
      downHistory[downHistory.length - 1] || 0,
      upHistory[upHistory.length - 1] || 0,
      speedTestActive ? gaugeSpeed : 0
    );
    const scale = Math.min(1, latestMbps / 50);
    setBars((prev) =>
      prev.map((_, idx) => {
        if (connectionStatus !== 'connected' && !speedTestActive) {
          return 12 + ((idx * 5) % 10);
        }
        const wave = Math.abs(Math.sin(Date.now() / 240 + idx * 0.45));
        return Math.max(14, Math.min(96, Math.round(18 + scale * 58 + wave * 22)));
      })
    );
  }, [downHistory, upHistory, speedTestActive, gaugeSpeed, connectionStatus]);

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
  const wavyArcPath = useMemo(
    () => generateWavyArcPath(130, 130, 102, gaugeFraction, 135, 270, 3.2, 22),
    [gaugeFraction]
  );

  return (
    <motion.div
      key="screen-speed"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={SPRING_SOFT}
      className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full items-start pb-2"
    >
      <div className="lg:col-span-6 flex flex-col gap-3.5">
        <div
          className="rounded-[22px] p-3.5 flex items-center justify-between gap-3 relative"
          style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: COLORS.amberBg, border: '1px solid #594729', color: COLORS.amber }}
            >
              <Globe className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: COLORS.textMuted }}>
                SELECTED TEST SERVER
              </div>
              <div className="font-jakarta font-bold text-[14px] truncate" style={{ color: COLORS.textPrimary }}>
                {testNode?.name || 'Select Server'}
              </div>
              <div className="text-[11.5px] font-mono tabular-nums" style={{ color: COLORS.textMuted }}>
                {testNode?.isp} • <span style={{ color: COLORS.amber }}>{testNode?.ping != null ? `${testNode.ping} ms` : '— ms'}</span>
              </div>
            </div>
          </div>

          <div className="relative shrink-0">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              transition={SPRING}
              onClick={() => setServerDropdownOpen((o) => !o)}
              className="h-[34px] px-3.5 rounded-full text-[12px] font-semibold flex items-center gap-1 cursor-pointer"
              style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary, border: '1px solid #634947' }}
            >
              <span>Change</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </motion.button>

            <AnimatePresence>
              {serverDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.96 }}
                  transition={{ duration: 0.14 }}
                  className="absolute right-0 top-11 w-[250px] rounded-[18px] p-1.5 z-40 shadow-2xl"
                  style={{ backgroundColor: '#231D1E', border: '1px solid #3D3132' }}
                >
                  {nodes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        setSelectedTestNodeId(n.id);
                        setServerDropdownOpen(false);
                      }}
                      className="w-full px-3 py-2 rounded-[12px] flex items-center justify-between text-left text-[12px] cursor-pointer hover:bg-[#312728]"
                      style={{
                        backgroundColor: n.id === testNode?.id ? COLORS.surfaceActive : 'transparent',
                        color: COLORS.textPrimary,
                      }}
                    >
                      <span className="truncate font-medium pr-2">{n.name}</span>
                      <span className="font-mono tabular-nums text-[11px]" style={{ color: COLORS.amber }}>
                        {n.ping != null ? `${n.ping}ms` : '—'}
                      </span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div
          className="rounded-[28px] px-5 py-5 flex flex-col items-center justify-center relative"
          style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}
        >
          <div className="relative w-[250px] h-[230px] flex items-center justify-center">
            <svg viewBox="0 0 260 245" className="w-full h-full overflow-visible">
              <path d={trackArcPath} fill="none" stroke="#2A2223" strokeWidth="8" strokeLinecap="round" />
              {wavyArcPath && (
                <motion.path
                  d={wavyArcPath}
                  fill="none"
                  stroke={phase === 'upload' ? COLORS.amber : COLORS.coral}
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={false}
                />
              )}
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
              <span
                className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-[0.11em] uppercase"
                style={{
                  backgroundColor: speedTestActive ? COLORS.surfaceActive : '#262021',
                  border: `1px solid ${speedTestActive ? COLORS.surfaceActiveBorder : '#3A2F30'}`,
                  color: phase === 'upload' ? COLORS.amber : speedTestActive ? COLORS.coral : COLORS.textMuted,
                }}
              >
                {statusPillLabel}
              </span>
              <div
                className="mt-2 font-mono tabular-nums text-[48px] font-bold leading-none tracking-[-0.03em]"
                style={{ color: COLORS.textPrimary }}
              >
                {gaugeSpeed.toFixed(1)}
              </div>
              <span className="mt-1 font-mono text-[13px] font-medium" style={{ color: COLORS.textMuted }}>
                Mbps
              </span>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            transition={SPRING}
            onClick={startSpeedTest}
            disabled={speedTestActive}
            className="-mt-2 h-[38px] px-6 rounded-full font-jakarta font-semibold text-[13px] flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-70"
            style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary, border: '1px solid #674B49' }}
            onMouseEnter={(e) => {
              if (!speedTestActive) e.currentTarget.style.backgroundColor = COLORS.taupeHover;
            }}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = COLORS.taupe)}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${speedTestActive ? 'animate-spin' : ''}`} />
            <span>{speedTestActive ? 'Running Test...' : 'Re-test'}</span>
          </motion.button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[20px] p-3.5" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: COLORS.textMuted }}>
              PING (ms)
            </span>
            <div className="mt-1.5 font-mono tabular-nums text-[22px] font-bold leading-none" style={{ color: COLORS.textPrimary }}>
              {metrics.ping}
              <span className="text-[11.5px] font-medium ml-1" style={{ color: COLORS.amber }}>
                ms
              </span>
            </div>
          </div>

          <div className="rounded-[20px] p-3.5" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: COLORS.textMuted }}>
              JITTER (ms)
            </span>
            <div className="mt-1.5 font-mono tabular-nums text-[22px] font-bold leading-none" style={{ color: COLORS.textPrimary }}>
              {metrics.jitter.toFixed(1)}
              <span className="text-[11.5px] font-medium ml-1" style={{ color: COLORS.textMuted }}>
                ms
              </span>
            </div>
          </div>

          <div className="rounded-[20px] p-3.5" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.coral }} />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: COLORS.textMuted }}>
                DOWNLOAD (Mbps)
              </span>
            </div>
            <div className="mt-1.5 font-mono tabular-nums text-[22px] font-bold leading-none" style={{ color: COLORS.textPrimary }}>
              {metrics.download.toFixed(1)}
            </div>
          </div>

          <div className="rounded-[20px] p-3.5" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.amber }} />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: COLORS.textMuted }}>
                UPLOAD (Mbps)
              </span>
            </div>
            <div className="mt-1.5 font-mono tabular-nums text-[22px] font-bold leading-none" style={{ color: COLORS.textPrimary }}>
              {metrics.upload.toFixed(1)}
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-6 flex flex-col gap-3.5 h-full">
        <div className="rounded-[24px] p-5 flex flex-col gap-4" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <motion.div
                animate={{ scale: speedTestActive ? [1, 1.14, 1] : [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: speedTestActive ? 0.65 : 2.0 }}
                className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                style={{ backgroundColor: '#361A1C', color: COLORS.coral }}
              >
                <Activity className="w-4 h-4" />
              </motion.div>
              <div>
                <h3 className="font-jakarta font-bold text-[14.5px]" style={{ color: COLORS.textPrimary }}>
                  Realtime Telemetry Stream
                </h3>
                <p className="text-[11px]" style={{ color: COLORS.textMuted }}>
                  {speedTestActive ? 'High-frequency packet burst capture' : 'Live Xray socket cadence'}
                </p>
              </div>
            </div>

            <span
              className="px-2.5 py-1 rounded-full font-mono text-[11px] font-semibold"
              style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.amber }}
            >
              TCP / Xray
            </span>
          </div>

          <div
            className="h-[104px] rounded-[18px] px-4 py-3 flex items-center justify-between gap-1.5"
            style={{ backgroundColor: COLORS.obsidian, border: '1px solid #262021' }}
          >
            {bars.map((pct, idx) => {
              const isCoral = idx % 2 === 0;
              return (
                <motion.div
                  key={idx}
                  animate={{ height: `${pct}%` }}
                  transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                  className="flex-1 max-w-[9px] rounded-full"
                  style={{
                    backgroundColor: isCoral ? COLORS.coral : COLORS.amber,
                    opacity: speedTestActive ? 0.96 : 0.84,
                  }}
                />
              );
            })}
          </div>
        </div>

        <div
          className="rounded-[24px] p-5 flex flex-col flex-1 min-h-[296px]"
          style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}
        >
          <div className="flex items-center justify-between gap-2 mb-3.5">
            <div className="flex items-center gap-2">
              <h3 className="font-jakarta font-bold text-[14.5px]" style={{ color: COLORS.textPrimary }}>
                Recent Test History
              </h3>
              <span
                className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
                style={{ backgroundColor: '#272122', color: COLORS.textMuted }}
              >
                Last 10 Tests
              </span>
            </div>
            {speedHistory.length > 0 && (
              <button
                type="button"
                onClick={clearSpeedHistory}
                className="text-[12px] font-semibold cursor-pointer hover:underline"
                style={{ color: COLORS.coral }}
              >
                Clear
              </button>
            )}
          </div>

          {speedHistory.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 gap-2">
              <Gauge className="w-7 h-7" style={{ color: COLORS.textMuted }} />
              <p className="text-[13px] font-medium" style={{ color: COLORS.textMuted }}>
                No speed tests recorded yet. Click Re-test to benchmark via Cloudflare.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[280px] pr-1 custom-scrollbar">
              {speedHistory.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[18px] px-3.5 py-3 flex items-center justify-between gap-3"
                  style={{ backgroundColor: '#161314', border: '1px solid #282122' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
                      style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.textMuted }}
                    >
                      <Gauge className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold truncate" style={{ color: COLORS.textPrimary }}>
                        {item.serverName}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums mt-0.5" style={{ color: COLORS.textMuted }}>
                        {item.timestamp} • <span style={{ color: COLORS.amber }}>{item.ping}ms</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="text-[12.5px] font-bold" style={{ color: COLORS.coral }}>
                      ↓ {item.download.toFixed(1)}
                    </div>
                    <div className="text-[11.5px] font-semibold" style={{ color: COLORS.amber }}>
                      ↑ {item.upload.toFixed(1)} Mbps
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
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

function SettingsScreen() {
  const {
    lanProxySharing,
    setLanProxySharing,
    localLanIp,
    setLocalLanIp,
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
    setLogsDrawerOpen,
    appendLog,
    pushToast,
  } = useMetro();

  const [refreshingIp, setRefreshingIp] = useState(false);
  const bypassedCount = windowsApps.filter((a) => a.bypassed).length;

  const handleRefreshIp = async () => {
    if (refreshingIp) return;
    setRefreshingIp(true);
    try {
      const nextIp = IN_TAURI ? await invokeCmd('refresh_local_ip') : localLanIp;
      setLocalLanIp(nextIp);
      appendLog('Info', `Ethernet interface refreshed -> ${nextIp}:10808`);
      pushToast(`Active adapter IP: ${nextIp}`, 'success');
    } catch (err) {
      pushToast(String(err), 'amber');
    } finally {
      setRefreshingIp(false);
    }
  };

  const handleCopyProxy = async () => {
    const proxy = `${localLanIp}:10808`;
    await copyClipboard(proxy);
    pushToast(`Copied LAN proxy address ${proxy}`, 'success');
  };

  return (
    <motion.div
      key="screen-settings"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={SPRING_SOFT}
      className="max-w-[880px] mx-auto flex flex-col gap-5 pb-4"
    >
      <section>
        <SectionHeader title="LAN & Proxy Share" badge="LOCAL NETWORK" />
        <div
          className="rounded-[24px] p-5 flex flex-col gap-4"
          style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0"
                style={{ backgroundColor: COLORS.surfaceActive, border: `1px solid ${COLORS.surfaceActiveBorder}`, color: COLORS.coral }}
              >
                <Wifi className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-jakarta font-semibold text-[14.5px]" style={{ color: COLORS.textPrimary }}>
                  LAN Proxy Sharing
                </div>
                <div className="font-mono tabular-nums text-[12px] mt-0.5 truncate" style={{ color: COLORS.textMuted }}>
                  Bind 0.0.0.0 •{' '}
                  <span style={{ color: lanProxySharing ? COLORS.mint : COLORS.textMuted }}>
                    {localLanIp}:10808 (SOCKS5) / :10809 (HTTP)
                  </span>
                </div>
              </div>
            </div>
            <M3ExpressiveSwitch
              checked={lanProxySharing}
              onChange={(v) => {
                setLanProxySharing(v);
                pushToast(v ? `LAN Proxy enabled (${localLanIp}:10808)` : 'LAN Proxy bound to localhost only', 'neutral');
              }}
              ariaLabel="Toggle LAN Proxy Sharing"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              transition={SPRING}
              onClick={handleRefreshIp}
              className="h-[40px] rounded-[15px] text-[12.5px] font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors hover:bg-[#262021]"
              style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.textPrimary }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingIp ? 'animate-spin' : ''}`} />
              <span>{refreshingIp ? 'Refreshing...' : 'Refresh Local IP'}</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              transition={SPRING}
              onClick={handleCopyProxy}
              className="h-[40px] rounded-[15px] text-[12.5px] font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              style={{ backgroundColor: COLORS.taupe, border: '1px solid #634947', color: COLORS.textPrimary }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = COLORS.taupeHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = COLORS.taupe)}
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Proxy Address</span>
            </motion.button>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader title="VPN & Connection" badge="TUNNELING" />
        <div className="flex flex-col gap-3">
          <div className="rounded-[24px] p-5" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
              <div>
                <div className="font-jakarta font-semibold text-[14.5px]" style={{ color: COLORS.textPrimary }}>
                  Tunneling Profile
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: COLORS.textMuted }}>
                  Select underlying Xray TLS &amp; routing mode
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-[11.5px] font-semibold" style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}>
                {tunnelProfile} Active
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {TUNNEL_PROFILES.map((prof) => {
                const selected = tunnelProfile === prof.id;
                return (
                  <motion.button
                    key={prof.id}
                    type="button"
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    transition={SPRING}
                    onClick={() => {
                      setTunnelProfile(prof.id);
                      pushToast(`Switched tunneling profile to ${prof.id}`, 'success');
                    }}
                    className="rounded-[18px] p-3.5 text-left cursor-pointer transition-colors flex flex-col justify-between"
                    style={{
                      backgroundColor: selected ? COLORS.crimson : '#151213',
                      border: `1px solid ${selected ? '#C4232B' : COLORS.surfaceBorder}`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-jakarta font-bold text-[13.5px]" style={{ color: COLORS.textPrimary }}>
                        {prof.id}
                      </span>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: selected ? 'rgba(20, 17, 18, 0.36)' : '#251F20',
                          color: selected ? '#FFE2E2' : COLORS.amber,
                        }}
                      >
                        {prof.subtitle}
                      </span>
                    </div>
                    <p className="text-[11.5px] mt-2" style={{ color: selected ? '#F2D2D2' : COLORS.textMuted }}>
                      {prof.detail}
                    </p>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[24px] px-5 py-2" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}>
            <div className="py-4 flex flex-wrap items-center justify-between gap-3 border-b" style={{ borderColor: '#292223' }}>
              <div className="min-w-0">
                <div className="font-jakarta font-semibold text-[14px]" style={{ color: COLORS.textPrimary }}>
                  Split Tunneling (Local Apps)
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: COLORS.textMuted }}>
                  Exclude selected Windows executables from routing through Xray
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING}
                  onClick={() => setAppsModalOpen(true)}
                  className="h-[34px] px-3 rounded-full text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer"
                  style={{ backgroundColor: COLORS.taupe, border: '1px solid #634947', color: COLORS.textPrimary }}
                >
                  <AppWindow className="w-3.5 h-3.5" />
                  <span>Select Windows Apps (.exe)</span>
                  <span className="px-1.5 py-0.5 rounded-full font-mono text-[10px]" style={{ backgroundColor: '#2A1D1D', color: COLORS.amber }}>
                    {bypassedCount}
                  </span>
                </motion.button>
                <M3ExpressiveSwitch checked={splitTunneling} onChange={setSplitTunneling} ariaLabel="Toggle Split Tunneling" />
              </div>
            </div>

            <div className="py-4 flex items-center justify-between gap-4 border-b" style={{ borderColor: '#292223' }}>
              <div className="min-w-0">
                <div className="font-jakarta font-semibold text-[14px]" style={{ color: COLORS.textPrimary }}>
                  Bypass LAN &amp; Private Subnets
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: COLORS.textMuted }}>
                  Keep 192.168.x.x &amp; 10.x.x.x direct without tunnel
                </div>
              </div>
              <M3ExpressiveSwitch checked={bypassLan} onChange={setBypassLan} ariaLabel="Toggle Bypass LAN & Private Subnets" />
            </div>

            <div className="py-4 flex flex-wrap items-center justify-between gap-3 border-b" style={{ borderColor: '#292223' }}>
              <div className="min-w-0">
                <div className="font-jakarta font-semibold text-[14px]" style={{ color: COLORS.textPrimary }}>
                  Custom DNS Resolvers
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: COLORS.textMuted }}>
                  Encrypted DNS-over-HTTPS upstream inside the tunnel
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {DNS_OPTIONS.map((opt) => {
                  const active = dnsResolver === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setDnsResolver(opt)}
                      className="px-3 py-1.5 rounded-full text-[11.5px] font-semibold cursor-pointer transition-colors"
                      style={{
                        backgroundColor: active ? COLORS.taupe : '#151213',
                        color: active ? COLORS.textPrimary : COLORS.textMuted,
                        border: `1px solid ${active ? '#664B49' : COLORS.surfaceBorder}`,
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
                  className="w-full h-[36px] rounded-[12px] px-3 font-mono text-[12px] focus:outline-none"
                  style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.textPrimary }}
                />
              )}
            </div>

            <div className="py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-jakarta font-semibold text-[14px]" style={{ color: COLORS.textPrimary }}>
                  TUN Interface MTU
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: COLORS.textMuted }}>
                  Maximum transmission unit for the Wintun virtual adapter
                </div>
              </div>
              <div
                className="inline-flex items-center p-1 rounded-[14px] gap-1"
                style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}` }}
              >
                {MTU_OPTIONS.map((val) => {
                  const active = mtu === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setMtu(val)}
                      className="px-3 py-1.5 rounded-[10px] font-mono tabular-nums text-[12px] font-semibold cursor-pointer transition-colors"
                      style={{
                        backgroundColor: active ? COLORS.taupe : 'transparent',
                        color: active ? COLORS.textPrimary : COLORS.textMuted,
                      }}
                    >
                      {val} B
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader title="Security & Diagnostics" badge="SECURITY & CORE" />
        <div className="rounded-[24px] px-5 py-2" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}` }}>
          <div className="py-4 flex items-center justify-between gap-4 border-b" style={{ borderColor: '#292223' }}>
            <div>
              <div className="font-jakarta font-semibold text-[14px]" style={{ color: COLORS.textPrimary }}>
                Strict VCN Cert Pinning
              </div>
              <div className="text-[12px] mt-0.5" style={{ color: COLORS.textMuted }}>
                Verify leaf certificate names &amp; enforce strict TLS verification
              </div>
            </div>
            <M3ExpressiveSwitch checked={certPinning} onChange={setCertPinning} ariaLabel="Toggle Strict VCN Cert Pinning" />
          </div>

          <div className="py-4 flex items-center justify-between gap-4 border-b" style={{ borderColor: '#292223' }}>
            <div>
              <div className="font-jakarta font-semibold text-[14px]" style={{ color: COLORS.textPrimary }}>
                Start with Windows (Minimized to Tray)
              </div>
              <div className="text-[12px] mt-0.5" style={{ color: COLORS.textMuted }}>
                Launch silently in the Windows 11 notification area at sign-in
              </div>
            </div>
            <M3ExpressiveSwitch checked={startWithWindows} onChange={setStartWithWindows} ariaLabel="Toggle Start with Windows" />
          </div>

          <div className="py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-[12px] flex items-center justify-center shrink-0"
                style={{ backgroundColor: '#151213', border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.amber }}
              >
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <div className="font-jakarta font-semibold text-[14px]" style={{ color: COLORS.textPrimary }}>
                  Live Xray Core Logs
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: COLORS.textMuted }}>
                  Inspect real-time VCN, TLS, and DNS socket diagnostics
                </div>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              transition={SPRING}
              onClick={() => setLogsDrawerOpen(true)}
              className="h-[36px] px-4 rounded-full text-[12.5px] font-semibold flex items-center gap-1.5 cursor-pointer"
              style={{ backgroundColor: COLORS.taupe, border: '1px solid #634947', color: COLORS.textPrimary }}
            >
              <span>Open Logs</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </motion.button>
          </div>
        </div>
      </section>
    </motion.div>
  );
}

// ============================================================================
// ADD / IMPORT CONFIG MODAL
// ============================================================================
function AddConfigModal() {
  const {
    addModalOpen,
    setAddModalOpen,
    addModalTab,
    setAddModalTab,
    setNodes,
    connectToNode,
    setActiveRoute,
    pushToast,
  } = useMetro();

  const [uriText, setUriText] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [subUrl, setSubUrl] = useState('');
  const [qrScanning, setQrScanning] = useState(false);
  const [qrUri, setQrUri] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const parsedUri = useMemo(() => parsePreviewNode(uriText, 'uri'), [uriText]);
  const parsedQr = useMemo(() => parsePreviewNode(qrUri, 'uri'), [qrUri]);

  const handleClipboardPaste = async () => {
    setErrorMsg('');
    const text = await readClipboard();
    if (text && (text.toLowerCase().includes('vless://') || text.toLowerCase().includes('vmess://'))) {
      setUriText(text);
      pushToast('Pasted VLESS/VMess URI from clipboard', 'success');
    } else {
      setErrorMsg('Clipboard does not contain a vless:// or vmess:// link.');
    }
  };

  const handleFileRead = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setJsonText(String(ev.target?.result || ''));
      setErrorMsg('');
    };
    reader.readAsText(file);
  };

  const handleQrImageUpload = async (file) => {
    if (!file) return;
    setQrScanning(true);
    setErrorMsg('');
    try {
      const buf = await file.arrayBuffer();
      if (IN_TAURI) {
        const decoded = await invokeCmd('decode_qr_image', { bytes: Array.from(new Uint8Array(buf)) });
        setQrUri(decoded);
        pushToast('Decoded QR code from image', 'success');
      } else {
        setErrorMsg('QR image decoding requires desktop Tauri backend');
      }
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setQrScanning(false);
    }
  };

  const handleConfirm = async () => {
    setErrorMsg('');
    try {
      if (addModalTab === 'uri') {
        if (!uriText.trim()) {
          setErrorMsg('Enter a valid vless:// or vmess:// link.');
          return;
        }
        const imported = await invokeCmd('import_uri', { input: uriText, mode: 'uri' });
        const all = await invokeCmd('list_servers');
        setNodes(all);
        if (imported[0]) await connectToNode(imported[0].id);
        pushToast(`Imported ${imported.length} node(s)`, 'success');
      } else if (addModalTab === 'file') {
        if (!jsonText.trim()) {
          setErrorMsg('Drop a valid .json / .conf profile first.');
          return;
        }
        const imported = await invokeCmd('import_uri', { input: jsonText, mode: 'json' });
        const all = await invokeCmd('list_servers');
        setNodes(all);
        if (imported[0]) await connectToNode(imported[0].id);
        pushToast(`Imported JSON profile ${imported[0]?.name || ''}`, 'success');
      } else if (addModalTab === 'sub') {
        if (!subUrl.trim()) {
          setErrorMsg('Please enter a valid subscription URL.');
          return;
        }
        const imported = await invokeCmd('import_subscription', { url: subUrl.trim() });
        const all = await invokeCmd('list_servers');
        setNodes(all);
        if (imported[0]) await connectToNode(imported[0].id);
        pushToast(`Synced ${imported.length} subscription node(s)`, 'success');
      } else if (addModalTab === 'qr') {
        if (!qrUri.trim()) {
          setErrorMsg('Upload a QR image containing a vless:// or vmess:// URI first.');
          return;
        }
        const imported = await invokeCmd('import_uri', { input: qrUri, mode: 'uri' });
        const all = await invokeCmd('list_servers');
        setNodes(all);
        if (imported[0]) await connectToNode(imported[0].id);
        pushToast(`Imported QR node ${imported[0]?.name || ''}`, 'success');
      }
      setUriText('');
      setJsonText('');
      setQrUri('');
      setAddModalOpen(false);
      setActiveRoute('servers');
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const TABS = [
    { id: 'uri', label: 'Clipboard URI', icon: ClipboardPaste },
    { id: 'file', label: '.json / .conf', icon: FileJson },
    { id: 'sub', label: 'Subscription', icon: Link2 },
    { id: 'qr', label: 'QR Image', icon: QrCode },
  ];

  return (
    <AnimatePresence>
      {addModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(12, 10, 11, 0.76)', backdropFilter: 'blur(6px)' }}
          onClick={() => setAddModalOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={SPRING}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[540px] rounded-[26px] p-5 shadow-2xl"
            style={{ backgroundColor: COLORS.surface, border: '1px solid #3D3132' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-[12px] flex items-center justify-center"
                  style={{ backgroundColor: COLORS.surfaceActive, border: `1px solid ${COLORS.surfaceActiveBorder}`, color: COLORS.coral }}
                >
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-jakarta font-bold text-[15.5px]" style={{ color: COLORS.textPrimary }}>
                    Add / Import Tunnel Config
                  </h3>
                  <p className="text-[11.5px]" style={{ color: COLORS.textMuted }}>
                    VLESS, VMess, Strict VCN, Subscription URL, or QR Image
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#2A2223]"
                style={{ color: COLORS.textMuted }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              className="grid grid-cols-4 p-1 rounded-[15px] mb-4 gap-1"
              style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}` }}
            >
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = addModalTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setAddModalTab(t.id);
                      setErrorMsg('');
                    }}
                    className="py-2 px-1 rounded-[11px] text-[11.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    style={{
                      backgroundColor: active ? COLORS.taupe : 'transparent',
                      color: active ? COLORS.textPrimary : COLORS.textMuted,
                    }}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>

            {addModalTab === 'uri' && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleClipboardPaste}
                    className="flex-1 h-[36px] px-3 rounded-[12px] text-[12px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary, border: '1px solid #634947' }}
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    <span>Paste vless:// / vmess:// from Clipboard</span>
                  </motion.button>
                  <button
                    type="button"
                    onClick={() => {
                      setUriText(SAMPLE_VLESS_URI);
                      setErrorMsg('');
                    }}
                    className="h-[36px] px-3 rounded-[12px] text-[11.5px] font-semibold flex items-center gap-1.5 cursor-pointer"
                    style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Sample</span>
                  </button>
                </div>

                <textarea
                  rows={3}
                  value={uriText}
                  onChange={(e) => {
                    setUriText(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="vless://uuid@host:443?security=tls&sni=st1.zoom.us&vcn=vpn.metrodens.site#NodeName"
                  className="w-full rounded-[16px] p-3 font-mono text-[11.5px] leading-relaxed resize-none focus:outline-none focus:border-[#593B39]"
                  style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.textPrimary }}
                />

                {parsedUri && (
                  <div
                    className="rounded-[15px] p-3 flex items-center justify-between"
                    style={{ backgroundColor: COLORS.surfaceActive, border: `1px solid ${COLORS.surfaceActiveBorder}` }}
                  >
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-bold truncate" style={{ color: COLORS.textPrimary }}>
                        {parsedUri.name}
                      </div>
                      <div className="text-[11px] font-mono" style={{ color: '#D0B4B3' }}>
                        {parsedUri.isp} — {parsedUri.sni} • {parsedUri.protocol}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold" style={{ backgroundColor: '#1E332B', color: COLORS.mint }}>
                      Parsed
                    </span>
                  </div>
                )}
              </div>
            )}

            {addModalTab === 'file' && (
              <div className="flex flex-col gap-3">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    handleFileRead(e.dataTransfer.files?.[0]);
                  }}
                  className="rounded-[18px] border border-dashed p-5 text-center transition-colors"
                  style={{
                    borderColor: isDragging ? COLORS.coral : '#4B3A3B',
                    backgroundColor: isDragging ? '#261A1B' : COLORS.obsidian,
                  }}
                >
                  <Upload className="w-6 h-6 mx-auto mb-2" style={{ color: COLORS.coral }} />
                  <p className="text-[13px] font-semibold" style={{ color: COLORS.textPrimary }}>
                    Drag &amp; drop Xray <span className="font-mono">.json</span> or <span className="font-mono">.conf</span> file
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <label
                      className="px-3 py-1.5 rounded-full text-[11.5px] font-semibold cursor-pointer"
                      style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary }}
                    >
                      Browse Files
                      <input type="file" accept=".json,.conf,.txt" className="hidden" onChange={(e) => handleFileRead(e.target.files?.[0])} />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setJsonText(SAMPLE_JSON_PROFILE);
                        setErrorMsg('');
                      }}
                      className="px-3 py-1.5 rounded-full text-[11.5px] font-semibold cursor-pointer"
                      style={{ backgroundColor: COLORS.amberBg, color: COLORS.amber }}
                    >
                      Sample Xray JSON
                    </button>
                  </div>
                </div>
                {jsonText && (
                  <pre
                    className="rounded-[14px] p-3 font-mono text-[10.5px] max-h-[108px] overflow-y-auto custom-scrollbar"
                    style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.textMuted }}
                  >
                    {jsonText}
                  </pre>
                )}
              </div>
            )}

            {addModalTab === 'sub' && (
              <div className="flex flex-col gap-3">
                <label className="text-[12px] font-medium" style={{ color: COLORS.textMuted }}>
                  Remote Xray / V2Ray Subscription URL
                </label>
                <input
                  type="url"
                  value={subUrl}
                  onChange={(e) => setSubUrl(e.target.value)}
                  placeholder="https://your-panel.example/sub/..."
                  className="w-full h-[42px] rounded-[14px] px-3.5 font-mono text-[12px] focus:outline-none focus:border-[#593B39]"
                  style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.textPrimary }}
                />
                <div
                  className="rounded-[14px] p-3 text-[11.5px]"
                  style={{ backgroundColor: '#171314', border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.textMuted }}
                >
                  Syncing pulls updated VLESS Reality &amp; Strict VCN edge endpoints and parses <span className="font-mono">Subscription-Userinfo</span> quota headers automatically.
                </div>
              </div>
            )}

            {addModalTab === 'qr' && (
              <div className="flex flex-col gap-3">
                <div
                  className="rounded-[18px] p-5 flex flex-col items-center text-center gap-3"
                  style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}` }}
                >
                  <div
                    className="w-12 h-12 rounded-[16px] flex items-center justify-center"
                    style={{ backgroundColor: COLORS.surfaceActive, border: `1px solid ${COLORS.surfaceActiveBorder}`, color: COLORS.coral }}
                  >
                    <Camera className={`w-6 h-6 ${qrScanning ? 'animate-pulse' : ''}`} />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: COLORS.textPrimary }}>
                      {qrScanning ? 'Decoding QR code...' : 'Decode QR Image File'}
                    </p>
                    <p className="text-[11.5px] mt-0.5" style={{ color: COLORS.textMuted }}>
                      Upload a screenshot or PNG/JPG QR code exported from Metrovpn
                    </p>
                  </div>
                  <label
                    className="h-[34px] px-4 rounded-full text-[12px] font-semibold inline-flex items-center cursor-pointer"
                    style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary }}
                  >
                    Upload QR Image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleQrImageUpload(e.target.files?.[0])}
                    />
                  </label>
                </div>

                {parsedQr && (
                  <div
                    className="rounded-[15px] p-3 flex items-center justify-between"
                    style={{ backgroundColor: COLORS.surfaceActive, border: `1px solid ${COLORS.surfaceActiveBorder}` }}
                  >
                    <div>
                      <div className="text-[12.5px] font-bold" style={{ color: COLORS.textPrimary }}>
                        {parsedQr.name}
                      </div>
                      <div className="text-[11px] font-mono" style={{ color: '#D0B4B3' }}>
                        {parsedQr.sni} • {parsedQr.protocol}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold" style={{ backgroundColor: '#1E332B', color: COLORS.mint }}>
                      QR Decoded
                    </span>
                  </div>
                )}
              </div>
            )}

            {errorMsg && (
              <p className="mt-2.5 text-[12px] flex items-center gap-1.5" style={{ color: COLORS.coral }}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </p>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="px-4 py-2 rounded-full text-[12.5px] font-semibold cursor-pointer hover:bg-[#2A2223]"
                style={{ color: COLORS.textMuted }}
              >
                Cancel
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                transition={SPRING}
                onClick={handleConfirm}
                className="px-5 py-2 rounded-full text-[12.5px] font-semibold cursor-pointer"
                style={{ backgroundColor: COLORS.crimson, color: COLORS.textPrimary, border: '1px solid #BC1F27' }}
              >
                {addModalTab === 'sub' ? 'Sync Subscription' : 'Add Tunnel Node'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// WINDOWS APPS (.EXE) SPLIT TUNNELING PICKER MODAL
// ============================================================================
function WindowsAppsModal() {
  const { appsModalOpen, setAppsModalOpen, windowsApps, setWindowsApps, toggleWindowsAppBypass, pushToast } =
    useMetro();
  const [search, setSearch] = useState('');

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
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(12, 10, 11, 0.74)', backdropFilter: 'blur(5px)' }}
          onClick={() => setAppsModalOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={SPRING}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[460px] rounded-[24px] p-5 shadow-2xl"
            style={{ backgroundColor: COLORS.surface, border: '1px solid #3D3132' }}
          >
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <h3 className="font-jakarta font-bold text-[15px]" style={{ color: COLORS.textPrimary }}>
                  Select Windows Apps (.exe)
                </h3>
                <p className="text-[11.5px]" style={{ color: COLORS.textMuted }}>
                  Checked executables bypass Xray routing directly
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAppsModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#2A2223]"
                style={{ color: COLORS.textMuted }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <div
                className="flex-1 h-[38px] rounded-full px-3.5 flex items-center gap-2"
                style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}` }}
              >
                <Search className="w-3.5 h-3.5" style={{ color: COLORS.textMuted }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter Windows executables..."
                  className="w-full bg-transparent text-[12.5px] focus:outline-none"
                  style={{ color: COLORS.textPrimary }}
                />
              </div>
              <button
                type="button"
                onClick={handleBrowseExe}
                className="h-[38px] px-3.5 rounded-full text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
                style={{ backgroundColor: COLORS.taupe, color: COLORS.textPrimary, border: '1px solid #634947' }}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Browse .exe</span>
              </button>
            </div>

            <div className="max-h-[270px] overflow-y-auto flex flex-col gap-1.5 pr-1 custom-scrollbar">
              {filtered.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => toggleWindowsAppBypass(app.id)}
                  className="w-full rounded-[14px] px-3 py-2.5 flex items-center justify-between cursor-pointer transition-colors"
                  style={{
                    backgroundColor: app.bypassed ? COLORS.surfaceActive : '#151213',
                    border: `1px solid ${app.bypassed ? COLORS.surfaceActiveBorder : '#272021'}`,
                  }}
                >
                  <div className="text-left min-w-0">
                    <div className="text-[13px] font-semibold truncate" style={{ color: COLORS.textPrimary }}>
                      {app.name}
                    </div>
                    <div className="font-mono text-[11px] truncate" style={{ color: COLORS.textMuted }}>
                      {app.exe}
                    </div>
                  </div>
                  <div
                    className="w-5 h-5 rounded-[6px] flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: app.bypassed ? COLORS.coral : '#2A2223',
                      border: `1px solid ${app.bypassed ? '#FF7970' : '#443839'}`,
                    }}
                  >
                    {app.bypassed && <Check className="w-3.5 h-3.5 text-[#141112]" strokeWidth={3} />}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setAppsModalOpen(false)}
                className="px-5 py-2 rounded-full text-[12.5px] font-semibold cursor-pointer"
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
                whileHover={{ scale: 1.02 }}
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
            <IspBadge node={activeNode} size={24} isActive={true} />
            <span className="text-[12px] font-semibold truncate" style={{ color: COLORS.textPrimary }}>
              {activeNode?.name}
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
              {nodes.map((n) => (
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
              ))}
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
// TOAST NOTIFICATION OVERLAY
// ============================================================================
function ToastOverlay() {
  const { toasts } = useMetro();
  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={SPRING}
            className="px-3.5 py-2.5 rounded-[14px] flex items-center gap-2 text-[12px] font-medium shadow-xl pointer-events-auto"
            style={{ backgroundColor: '#241E1F', border: '1px solid #3F3233', color: COLORS.textPrimary }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor:
                  t.tone === 'success' ? COLORS.mint : t.tone === 'amber' ? COLORS.amber : COLORS.coral,
              }}
            />
            <span>{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// DESKTOP STAGE / MAIN APPLICATION SHELL
// ============================================================================
function DesktopStage() {
  const {
    activeRoute,
    isMaximized,
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

  if (IN_TAURI) {
    return (
      <div
        className="w-screen h-screen relative flex flex-col overflow-hidden"
        style={{ backgroundColor: COLORS.obsidian, border: `1px solid ${COLORS.surfaceBorder}` }}
      >
        <Titlebar />
        <div className="flex-1 flex gap-3.5 p-3.5 min-h-0 overflow-hidden">
          <NavigationRail />
          <main className="flex-1 min-w-0 h-full overflow-y-auto pr-1 custom-scrollbar">
            <AnimatePresence mode="wait">{renderScreen()}</AnimatePresence>
          </main>
        </div>
        <AddConfigModal />
        <WindowsAppsModal />
        <AdminElevationModal />
        <NodeUtilityModals />
        <XrayLogsDrawer />
        <ToastOverlay />
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen w-full flex flex-col items-center justify-center relative transition-all duration-300 ${
        isMaximized ? 'p-2 pb-12' : 'p-3 sm:p-6 pb-14'
      }`}
      style={{
        backgroundColor: COLORS.stage,
        backgroundImage:
          'radial-gradient(circle at 20% 18%, rgba(89, 44, 44, 0.16) 0%, transparent 46%), radial-gradient(circle at 82% 84%, rgba(58, 47, 27, 0.12) 0%, transparent 42%)',
      }}
    >
      <AnimatePresence mode="wait">
        {!windowMinimizedToTray ? (
          <motion.div
            key="main-desktop-window"
            layout
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 40 }}
            transition={SPRING_SOFT}
            className={`relative flex flex-col overflow-hidden w-full ${
              isMaximized
                ? 'max-w-[1440px] h-[calc(100vh-64px)] rounded-[12px]'
                : 'max-w-[1040px] h-[680px] max-h-[calc(100vh-76px)] rounded-[14px]'
            }`}
            style={{
              backgroundColor: COLORS.obsidian,
              border: `1px solid ${COLORS.surfaceBorder}`,
              boxShadow: '0 36px 90px -18px rgba(4, 2, 3, 0.88), 0 0 0 1px rgba(244, 236, 236, 0.04) inset',
            }}
          >
            <Titlebar />
            <div className="flex-1 flex gap-3.5 p-3.5 min-h-0 overflow-hidden">
              <NavigationRail />
              <main className="flex-1 min-w-0 h-full overflow-y-auto pr-1 custom-scrollbar">
                <AnimatePresence mode="wait">{renderScreen()}</AnimatePresence>
              </main>
            </div>
            <AddConfigModal />
            <WindowsAppsModal />
            <AdminElevationModal />
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
            style={{ backgroundColor: '#171314', border: `1px solid ${COLORS.surfaceBorder}` }}
          >
            <div
              className="w-12 h-12 rounded-[16px] flex items-center justify-center"
              style={{ backgroundColor: '#251B1C', border: '1px solid #3E2E2F' }}
            >
              <WolfEmblem className="w-7 h-7" />
            </div>
            <h2 className="font-jakarta font-bold text-[16px]" style={{ color: COLORS.textPrimary }}>
              Metrovpn is running in System Tray
            </h2>
            <motion.button
              whileHover={{ scale: 1.03 }}
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
            style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.surfaceBorder}`, color: COLORS.textPrimary }}
          >
            <Monitor className="w-3.5 h-3.5" style={{ color: COLORS.coral }} />
            <span>Open Window</span>
          </motion.button>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          transition={SPRING}
          onClick={() => setTrayFlyoutOpen((v) => !v)}
          className="h-[34px] px-3.5 rounded-full flex items-center gap-2.5 cursor-pointer shadow-xl select-none"
          style={{
            backgroundColor: trayFlyoutOpen ? COLORS.surfaceActive : '#1B1718',
            border: `1px solid ${trayFlyoutOpen ? COLORS.surfaceActiveBorder : '#33292A'}`,
            color: COLORS.textPrimary,
          }}
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

      <ToastOverlay />
    </div>
  );
}

// ============================================================================
// DEFAULT EXPORT APP
// ============================================================================
export default function App() {
  const isTray = isTrayWindowMode();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');

        body {
          margin: 0;
          background-color: ${isTray ? 'transparent' : '#0C0A0B'};
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #F4ECEC;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .font-jakarta {
          font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
        }

        .font-mono {
          font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
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
          background: #2E2627;
          border-radius: 999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #4B3635;
        }
      `}</style>

      <MetroProvider>
        {isTray ? (
          <div className="w-[320px] h-[420px] overflow-hidden bg-transparent">
            <TrayFlyoutCard standalone={true} />
          </div>
        ) : (
          <DesktopStage />
        )}
      </MetroProvider>
    </>
  );
}

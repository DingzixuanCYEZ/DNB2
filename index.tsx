import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Play, Square, Volume2, History, X, AlertCircle, Settings, Percent, Trophy, Scroll, Clock, Zap, Lock, Download, Upload, Smartphone, Monitor, Save, ChevronDown, ChevronRight, Calendar, Search, Activity, VolumeX, Volume1, Volume2 as VolumeIcon, Hash, Gauge, Hand, Briefcase, Gift, Star, Shield, ArrowUpCircle, Layers, Info } from 'lucide-react';

// --- Constants & Types ---

const LETTERS = ['c', 'h', 'k', 'l', 'q', 'r', 's', 't'];
const GRID_SIZE = 9;
const DEFAULT_N = 2;
const BASE_ROUNDS = 20;
const DEFAULT_INTERVAL = 3.0;
const DEFAULT_DISPLAY_TIME = 0.5;

const REALMS = ['', '锻体', '炼气', '筑基', '结丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
const STAGES = ['前期', '前期巅峰', '中期', '中期巅峰', '后期', '后期巅峰', '圆满', '大圆满'];

// 丹药相关常量
type PillType = 'spirit' | 'focus' | 'foundation' | 'heavenly';
// virtual(虚品) 和 real(实品) 为护基丹专用
type PillGrade = 'low' | 'mid' | 'high' | 'peak' | 'human' | 'earth' | 'heaven' | 'virtual' | 'real';

// 0:前期, 1:中期, 2:后期, 3:圆满, 4:大圆满
type SubRealm = 0 | 1 | 2 | 3 | 4; 

interface Pill {
  id: string;
  type: PillType;
  realm: number; // 丹药的大境界
  subRealm?: SubRealm; // 灵元丹、凝神丹、护基丹需要
  grade: PillGrade;
  timestamp: number;
}

// 用于背包显示的聚合类型
interface StackedPill extends Pill {
  count: number;
  ids: string[]; // 存储该组所有丹药的ID
}

interface GachaState {
  accumulatedTime: number; // 累计秒数
  availableDraws: number;
}

type RoundMode = 'standard' | 'linear' | 'custom';
type PacingMode = 'standard' | 'self-paced' | 'dynamic';

interface GameStep {
  position: number;
  letter: string;
  nBack: number; 
}

interface ScoreDetail {
  hits: number;    
  misses: number;  
  falseAlarms: number; 
  correctRejections: number;
}

interface GameResult {
  id: string;
  timestamp: number;
  n: number;
  interval: number;
  totalTrials: number;
  audioScore: ScoreDetail;
  visualScore: ScoreDetail;
  isVariable: boolean;
  variableDifficulty?: number; 
  score?: number; 
  accuracy: number; // 0-100
  device?: 'mobile' | 'desktop';
  realmLevel?: number; // Snapshot of realm when game started
  stage?: number; // Snapshot of stage when game started
  afterRealmLevel?: number; // Snapshot after game
  afterStage?: number; // Snapshot after game
  pacingMode?: PacingMode;
  
  // 丹药记录
  pillUsed?: Pill;
  pillEffectLog?: string;
  pillAcquired?: Pill[];
}

interface CultivationState {
  realmLevel: number; 
  stage: number; 
  currentXP: number;
  recentScores: number[]; 
  totalStudyTime: number; 
  stageStudyTime: number;
  totalSessions: number; // Cumulative total games played
  stageSessions: number; // Games played in current stage
}

interface Milestone {
  id: string;
  timestamp: number;
  type: 'minor' | 'major' | 'peak';
  title: string;
  description: string;
  stageDuration?: number;
  totalDuration?: number;
  stageSessions?: number;
  totalSessions?: number;
}

// --- Styles ---
const styles = `
  :root {
    --grid-border: #e5e7eb;
    --active-color: #3b82f6;
    --cultivation-bg: #f0f9ff;
    --cultivation-border: #bae6fd;
    --cultivation-text: #0369a1;
  }
  html {
    height: auto;
    min-height: 100%;
  }
  body {
    background-color: #f8fafc;
    color: #1e293b;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    margin: 0;
    min-height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }
  .app-container {
    width: 100%;
    min-height: 100vh; 
    display: flex;
    flex-direction: column;
    padding: 10px;
    box-sizing: border-box;
  }
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 4px 10px;
    flex-shrink: 0;
    width: 100%;
    max-width: 600px;
    align-self: center;
  }
  
  /* Cultivation Panel */
  .cultivation-card {
    background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
    border: 1px solid #bae6fd;
    border-radius: 16px;
    padding: 16px;
    margin-bottom: 20px;
    width: 100%;
    max-width: 600px;
    align-self: center;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  }

  .realm-title {
    font-size: 1.25rem;
    font-weight: 800;
    color: #0c4a6e;
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .cultivation-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 0.85rem;
    color: #0369a1;
    margin-bottom: 12px;
  }

  .xp-bar-container {
    height: 10px;
    background: #e2e8f0; 
    border-radius: 5px;
    overflow: hidden;
    position: relative;
    margin-top: 8px;
  }

  .xp-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #3b82f6, #06b6d4);
    transition: width 2.0s ease-out;
  }

  .xp-text {
    font-size: 0.75rem;
    color: #64748b;
    margin-top: 4px;
    text-align: right;
  }

  .bottleneck-info {
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid #bae6fd;
    border-radius: 8px;
    padding: 10px;
    margin-top: 10px;
    font-size: 0.85rem;
  }

  .game-area {
    margin: auto 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    padding-bottom: 60px; 
  }

  /* Landscape Mode Optimization */
  @media (min-aspect-ratio: 1/1) and (max-height: 600px) {
    .app-container { flex-direction: row; align-items: center; justify-content: center; min-height: 100%; }
    .header { position: absolute; top: 10px; left: 10px; width: auto; flex-direction: row; padding: 0; gap: 10px; }
    .cultivation-card {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 280px;
      margin: 0;
      padding: 10px;
      z-index: 10;
      max-height: 90vh;
      overflow-y: auto;
    }
    /* Hide during play in landscape */
    .game-playing .header, .game-playing .cultivation-card, .game-playing .settings-container {
        display: none !important;
    }

    .game-area { 
      margin: 0;
      flex-direction: row; 
      gap: 30px; 
      justify-content: center; 
      align-items: center;
      padding-bottom: 0;
      height: auto;
      width: auto;
    }
    .control-panel { 
      flex-direction: column !important; 
      margin-top: 0 !important; 
      gap: 16px !important; 
    }
    .match-btn { width: 110px !important; padding: 10px !important; height: auto; }
    
    .settings-container {
      position: absolute;
      right: 20px;
      bottom: 20px;
      top: auto;
      transform: none;
      width: 280px;
      max-height: 40vh;
      overflow-y: auto;
      z-index: 20;
    }
  }

  @media (max-aspect-ratio: 1/1) {
    .settings-container {
      width: 100%;
      max-width: 500px;
      margin-top: 24px;
    }
  }

  /* Grid Board */
  .grid-board {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    background-color: #cbd5e1; 
    gap: 1px;
    border: 1px solid #cbd5e1;
    width: min(92vmin, 500px);
    height: min(92vmin, 500px);
    flex-shrink: 0;
    position: relative;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  }

  .grid-cell {
    background-color: #ffffff;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden; 
  }
  
  .active-block {
    width: 92%;
    height: 92%;
    background-color: var(--active-color);
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    transition: transform 0.1s;
  }

  /* Improved Cross Styling - Centered */
  .disabled-cross {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .disabled-cross::before, .disabled-cross::after {
    content: '';
    position: absolute;
    background-color: #f1f5f9;
    border-radius: 2px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  .disabled-cross::before { width: 60%; height: 2px; }
  .disabled-cross::after { height: 60%; width: 2px; }

  .center-number {
    font-size: min(15vmin, 70px);
    font-weight: 800;
    color: #0f172a;
    user-select: none;
    line-height: 1;
    position: absolute; 
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 5;
  }

  .game-config-display {
    width: min(92vmin, 500px);
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 0.85rem;
    color: #64748b;
    font-family: monospace;
    font-weight: 600;
  }

  .progress-info {
    width: min(92vmin, 500px);
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    font-size: 0.9rem;
    color: #64748b;
    font-weight: 500;
  }
  
  .progress-bar-bg {
    flex: 1;
    height: 8px;
    background: #e2e8f0;
    border-radius: 4px;
    margin-right: 12px;
    overflow: hidden;
  }
  
  .progress-bar-fill {
    height: 100%;
    background: #3b82f6;
    transition: width 0.3s linear;
  }

  .control-panel {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin-top: 24px;
    flex-shrink: 0;
    z-index: 10;
  }

  .match-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100px;
    padding: 12px 8px;
    background-color: #ffffff;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    cursor: pointer;
    user-select: none;
    touch-action: manipulation;
  }
  
  .match-btn:active, .match-btn.pressed {
    background-color: #f1f5f9;
    border-color: #94a3b8;
    transform: translateY(2px);
  }
  
  .match-btn.correct { border-color: #22c55e; background-color: #dcfce7; }
  .match-btn.wrong { border-color: #ef4444; background-color: #fee2e2; }

  .btn {
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .btn-primary { background-color: #3b82f6; color: white; }
  .btn-secondary { background-color: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
  .btn-danger { background-color: #ef4444; color: white; }
  .btn-ghost { background-color: transparent; color: #64748b; padding: 8px; }
  .btn.active { background-color: #e0f2fe; color: #0284c7; border-color: #7dd3fc; }
  
  .play-btn-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
  }

  .settings-container {
    background: #ffffff;
    padding: 20px;
    border-radius: 16px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  }

  .setting-section {
    margin-bottom: 20px;
    border-bottom: 1px solid #f1f5f9;
    padding-bottom: 16px;
  }
  .setting-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }

  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  
  .input-control {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .val-display {
    font-size: 1.1rem;
    font-weight: 700;
    min-width: 36px;
    text-align: center;
  }
  
  .val-input {
    font-size: 1.1rem;
    font-weight: 700;
    width: 60px;
    text-align: center;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 4px;
    background: #f8fafc;
  }

  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
  }
  .toggle-switch input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute;
    cursor: pointer;
    top: 0; left: 0; right: 0; bottom: 0;
    background-color: #cbd5e1;
    transition: .4s;
    border-radius: 34px;
  }
  .slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: .4s;
    border-radius: 50%;
    box-shadow: 0 1px 2px rgba(0,0,0,0.2);
  }
  input:checked + .slider { background-color: #3b82f6; }
  input:checked + .slider:before { transform: translateX(20px); }

  .prob-input {
    width: 44px;
    padding: 6px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    text-align: center;
    font-size: 0.9rem;
  }

  .round-mode-selector {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }
  .round-mode-btn {
    flex: 1;
    padding: 8px 4px;
    font-size: 0.8rem;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    color: #64748b;
    cursor: pointer;
  }
  .round-mode-btn.active {
    background: #eff6ff;
    border-color: #3b82f6;
    color: #2563eb;
    font-weight: 600;
  }
  
  .volume-slider-container {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      justify-content: flex-end;
  }
  .volume-slider {
      width: 100px;
      height: 4px;
      background: #cbd5e1;
      border-radius: 2px;
      appearance: none;
      outline: none;
  }
  .volume-slider::-webkit-slider-thumb {
      appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #3b82f6;
      cursor: pointer;
  }

  .modal-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(15, 23, 42, 0.6);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 50;
    padding: 20px;
  }
  .modal {
    background: #ffffff;
    padding: 24px;
    border-radius: 16px;
    max-width: 500px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  
  .summary-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    margin-top: 16px;
  }
  .summary-item {
    background: #f8fafc;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }
  
  .stats-table {
    width: 100%;
    font-size: 0.85rem;
    border-collapse: collapse;
    margin-top: 8px;
  }
  .stats-table td {
    padding: 4px;
    border-bottom: 1px solid #e2e8f0;
  }
  .stats-table tr:last-child td { border-bottom: none; }
  .stat-label { color: #64748b; }
  .stat-val { font-weight: 600; text-align: right; }
  
  .text-success { color: #16a34a; font-weight: bold; }
  
  /* Milestones */
  .milestone-item {
    padding: 12px;
    border-left: 3px solid #cbd5e1;
    background: #f8fafc;
    margin-bottom: 10px;
    border-radius: 0 8px 8px 0;
  }
  .milestone-item.major { border-left-color: #f59e0b; background: #fffbeb; }
  .milestone-item.peak { border-left-color: #3b82f6; background: #eff6ff; }
  
  .milestone-date {
    font-size: 0.75rem;
    color: #94a3b8;
    margin-bottom: 4px;
    display: flex;
    justify-content: space-between;
  }
  .milestone-title {
    font-weight: 700;
    color: #0f172a;
    font-size: 0.95rem;
  }
  .milestone-desc {
    font-size: 0.85rem;
    color: #475569;
    margin-top: 4px;
  }
  .milestone-meta {
    margin-top: 6px;
    font-size: 0.75rem;
    color: #64748b;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
  }
  
  /* Day Group */
  .day-group {
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    margin-bottom: 12px;
    overflow: hidden;
  }
  .day-header {
    background: #f1f5f9;
    padding: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;
  }
  .day-content {
    background: #fff;
    padding: 10px;
    border-top: 1px solid #e2e8f0;
  }
  
  /* Chart */
  .chart-wrapper {
    overflow-x: auto;
    padding: 10px 0;
    margin-bottom: 10px;
    border-bottom: 1px solid #e2e8f0;
  }
  .chart-svg {
    display: block;
    margin: 0 auto;
  }
  .chart-tooltip {
    font-size: 12px;
    fill: #1e293b;
    font-weight: 600;
  }
  .chart-grid-line {
    stroke: #e2e8f0;
    stroke-width: 1;
    stroke-dasharray: 4 4;
  }
  
  .data-list-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 4px;
    border-bottom: 1px solid #f1f5f9;
    font-size: 0.9rem;
    color: #334155;
  }
  .data-list-row:last-child { border-bottom: none; }

  /* Pill & Inventory */
  .pill-item {
    padding: 12px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: white;
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    position: relative;
  }
  .pill-item.selected {
    border-color: #3b82f6;
    background: #eff6ff;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }
  .pill-tag {
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 700;
    margin-left: 6px;
  }
  .pill-count-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    background: #ef4444;
    color: white;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 10px;
    min-width: 16px;
    text-align: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }
  .tag-spirit { background: #dbeafe; color: #1e40af; }
  .tag-focus { background: #fce7f3; color: #9d174d; }
  .tag-foundation { background: #ecfccb; color: #3f6212; }
  .tag-heavenly { background: #fef3c7; color: #92400e; }

  .pill-select-trigger {
    background: #fff;
    border: 1px solid #cbd5e1;
    padding: 10px;
    border-radius: 12px;
    margin-bottom: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    font-size: 0.9rem;
    color: #334155;
    box-shadow: 0 2px 4px -1px rgba(0,0,0,0.05);
  }
  
  .pill-effect-preview {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px;
    font-size: 0.85rem;
    color: #475569;
    margin-bottom: 16px;
    width: min(92vmin, 500px);
    box-sizing: border-box;
  }

  .hidden-during-play {
    transition: opacity 0.3s;
  }
`;

// --- Helpers ---

// 丹药辅助函数
function getPillName(pill: Pill): string {
  const realmName = REALMS[pill.realm] || '未知';
  let subName = '';
  if (pill.subRealm !== undefined && pill.type !== 'spirit' && pill.type !== 'heavenly') {
    const subNames = ['前期', '中期', '后期', '圆满', '大圆满'];
    subName = subNames[pill.subRealm] || '';
  }

  let gradeName = '';
  if (pill.type === 'focus') {
      if (pill.grade === 'low') gradeName = '次品';
      else if (pill.grade === 'mid') gradeName = '良品';
      else if (pill.grade === 'high') gradeName = '优品';
      else gradeName = '次品'; 
  } else if (pill.type === 'foundation') {
      // 修复：明确区分实品和虚品，旧数据默认视为虚品，避免错误的“实品”显示
      if (pill.grade === 'real') gradeName = '实品';
      else gradeName = '虚品'; 
  } else {
      switch(pill.grade) {
        case 'low': gradeName = '下品'; break;
        case 'mid': gradeName = '中品'; break;
        case 'high': gradeName = '上品'; break;
        case 'peak': gradeName = '极品'; break;
        case 'human': gradeName = '人品'; break;
        case 'earth': gradeName = '地品'; break;
        case 'heaven': gradeName = '天品'; break;
        default: gradeName = '下品';
      }
  }

  if (pill.type === 'heavenly') {
      return `${realmName}期·${gradeName}通天渡厄丹`;
  } else {
      const pName = pill.type === 'spirit' ? '灵元丹' : pill.type === 'focus' ? '凝神丹' : '护基丹';
      return `${realmName}期${subName}·${gradeName}${pName}`;
  }
}

function getPillDescription(pill: Pill): string {
  if (pill.type === 'spirit') {
    // C值: Early=1, Mid=2, Late=4, Perf=6, G.Perf=8
    const C_VALUES = [1, 2, 4, 6, 8];
    const C = C_VALUES[pill.subRealm ?? 0] || 1;
    
    let mult = 0, capBase = 0;
    if (pill.grade === 'low') { mult=1.5; capBase=0.5; }
    else if (pill.grade === 'mid') { mult=2; capBase=1; }
    else if (pill.grade === 'high') { mult=3; capBase=2; }
    else if (pill.grade === 'peak') { mult=5; capBase=4; }
    
    return `增加经验获取 ${mult}倍，额外上限 ${C}*${capBase}*10^N (仅积累期有效)`;
  }
  if (pill.type === 'focus') {
    let effect = '';
    if (pill.grade === 'low') effect = '转化率 75%';
    else if (pill.grade === 'mid') effect = '转化率 85%';
    else if (pill.grade === 'high') effect = '转化率 100%';
    return `小境界冲关辅助。${effect}。若你的境界低于丹药，药效可能升华。`;
  }
  if (pill.type === 'foundation') {
    const typeStr = pill.grade === 'virtual' ? '虚品' : '实品';
    const effectStr = pill.grade === 'virtual' ? '减缓倒退 (取平均值)' : '完全保底 (锁定分数)';
    return `${typeStr}：冲关失败时${effectStr}。只能用于 >= 当前小境界。`;
  }
  if (pill.type === 'heavenly') {
    let req = 0;
    if (pill.grade === 'human') req=75;
    else if (pill.grade === 'earth') req=70;
    else if (pill.grade === 'heaven') req=65;
    return `大境界渡劫神物。将准确率要求降低至 ${req}%。`;
  }
  return '';
}

function getProbabilityThresholds(weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0); 
  let acc = 0;
  return weights.map(w => {
    acc += w / sum;
    return acc;
  });
}

function pickNFromWeights(thresholds: number[]): number {
  const r = Math.random();
  for (let i = 0; i < thresholds.length; i++) {
    if (r < thresholds[i]) return i + 1; 
  }
  return thresholds.length;
}

function generateSequence(length: number, maxN: number, useCenter: boolean, isVariable: boolean, weights: number[]): GameStep[] {
  const seq: GameStep[] = [];
  const MATCH_RATE = 0.25;
  const thresholds = getProbabilityThresholds(weights);
  const centerIndex = 4;

  for (let i = 0; i < length; i++) {
    let currentN = maxN;
    if (isVariable && i >= maxN) {
       currentN = pickNFromWeights(thresholds);
    }
    
    if (i < maxN) {
      let pos = Math.floor(Math.random() * GRID_SIZE);
      const forbiddenCenter = isVariable || !useCenter;
      if (forbiddenCenter) {
         const candidates = Array.from({length: GRID_SIZE}, (_, k) => k).filter(p => p !== centerIndex);
         pos = candidates[Math.floor(Math.random() * candidates.length)];
      }
      seq.push({ position: pos, letter: LETTERS[Math.floor(Math.random() * LETTERS.length)], nBack: maxN });
    } else {
      const prevStep = seq[i - currentN];
      let pos: number;
      if (Math.random() < MATCH_RATE) {
        pos = prevStep.position;
      } else {
        const forbiddenCenter = isVariable || !useCenter;
        let candidates = Array.from({length: GRID_SIZE}, (_, k) => k).filter(p => p !== prevStep.position);
        if (forbiddenCenter) {
          candidates = candidates.filter(p => p !== centerIndex);
        }
        pos = candidates[Math.floor(Math.random() * candidates.length)];
      }

      let char: string;
      if (Math.random() < MATCH_RATE) {
        char = prevStep.letter;
      } else {
        const candidates = LETTERS.filter(l => l !== prevStep.letter);
        char = candidates[Math.floor(Math.random() * candidates.length)];
      }
      seq.push({ position: pos, letter: char, nBack: currentN });
    }
  }
  return seq;
}

function calculateAccuracy(hits: number, misses: number, falseAlarms: number): number {
  const totalTargets = hits + misses;
  const errors = misses + falseAlarms;
  if (totalTargets === 0 && falseAlarms === 0) return 100;
  if (totalTargets === 0) return 0;
  const score = 1 - (errors / totalTargets);
  return Math.max(0, parseFloat((score * 100).toFixed(1)));
}

function formatScore(score: number | undefined): string {
  if (score === undefined) return '';
  if (score >= 1000) return score.toFixed(0);
  if (score >= 100) return score.toFixed(1);
  return score.toFixed(2);
}

function formatDuration(seconds: number): string {
  const m = (seconds / 60).toFixed(1);
  return `${m}分钟`;
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/\//g, '/');
}

function formatDateForFilename(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function getDeviceType(): 'mobile' | 'desktop' {
  // Use window width to determine device type for recording
  return window.innerWidth < 768 ? 'mobile' : 'desktop';
}

function getRoundCount(nVal: number, mode: RoundMode, custom: number) {
  if (mode === 'linear') return 20 + 4 * nVal;
  if (mode === 'custom') return Math.max(1, custom);
  return 20 + nVal * nVal; // standard
}

// Cultivation Logic

function getMaxXP(realm: number, stage: number): number {
  const base = Math.max(1, Math.sqrt(realm));
  const power = Math.pow(10, realm);
  
  // Early (0) -> Peak
  if (stage === 0) return Math.round(base * 4 * power);
  // Mid (2) -> Peak
  if (stage === 2) return Math.round(base * 8 * power);
  // Late (4) -> Peak
  if (stage === 4) return Math.round(base * 16 * power);
  // Perfect (6) -> Great Perfect. Max is Next Realm Early Cap.
  if (stage === 6) {
     const nextRealm = realm + 1;
     const nextBase = Math.max(1, Math.sqrt(nextRealm));
     const nextPower = Math.pow(10, nextRealm);
     return Math.round(nextBase * 4 * nextPower); 
  }
  
  return 100; // Fallback
}

function getBreakthroughTarget(realm: number, stage: number): number {
  const power = Math.pow(10, realm);
  if (stage === 1) return 1 * power; // Early Peak -> Mid
  if (stage === 3) return 2 * power; // Mid Peak -> Late
  if (stage === 5) return 4 * power; // Late Peak -> Perfect
  return 0;
}

function getFullStageName(realm: number, stage: number) {
    if (realm === 0) return '凡人';
    return `${REALMS[realm]}${STAGES[stage]}`;
}

// --- Components ---

// History Day Group Component
interface HistoryDayGroupProps {
    dateStr: string;
    records: GameResult[];
    onToggle: () => void;
    isExpanded: boolean;
}

const HistoryDayGroup: React.FC<HistoryDayGroupProps> = ({ 
    dateStr, 
    records, 
    onToggle, 
    isExpanded 
}) => {
    const totalDuration = records.reduce((acc, r) => acc + (r.totalTrials * r.interval), 0);
    
    // Determine Realm Change
    const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
    const startRecord = sorted[0];
    const endRecord = sorted[sorted.length - 1];
    
    let realmChangeText = "";
    if (startRecord.realmLevel && endRecord.realmLevel && startRecord.stage !== undefined && endRecord.stage !== undefined) {
        // Start is always state BEFORE the first game
        const startName = getFullStageName(startRecord.realmLevel, startRecord.stage);
        
        // End is state AFTER the last game if available, otherwise fallback to BEFORE (legacy data)
        const endRealm = endRecord.afterRealmLevel ?? endRecord.realmLevel ?? 0;
        const endStage = endRecord.afterStage ?? endRecord.stage ?? 0;
        
        const endName = getFullStageName(endRealm, endStage);
        
        if (startName !== endName) {
            realmChangeText = `${startName} -> ${endName}`;
        } else {
            realmChangeText = startName;
        }
    } else {
        realmChangeText = "修炼记录";
    }

    return (
        <div className="day-group">
            <div className="day-header" onClick={onToggle} style={{cursor: 'pointer', userSelect: 'none'}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: 2}}>
                    <div style={{fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6}}>
                        <Calendar size={14} /> {dateStr}
                    </div>
                    <div style={{fontSize: '0.8rem', color: '#64748b'}}>
                        时长: {formatDuration(totalDuration)} | {realmChangeText}
                    </div>
                </div>
                {isExpanded ? <ChevronDown size={20} color="#94a3b8" /> : <ChevronRight size={20} color="#94a3b8" />}
            </div>
            {isExpanded && (
                <div className="day-content">
                    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                        {records.map(run => (
                            <div key={run.id} style={{padding: 12, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc'}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 6}}>
                                    <span style={{fontWeight: 700, color: '#0f172a'}}>
                                    {run.isVariable ? `Var N (${run.variableDifficulty})` : `N = ${run.n}`}
                                    </span>
                                    <span style={{fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6}}>
                                    {run.device === 'mobile' ? '手机' : '电脑'} | {formatDateTime(run.timestamp)}
                                    </span>
                                </div>
                                <div style={{marginBottom: 8}}>
                                    <StatsTable visual={run.visualScore} audio={run.audioScore} />
                                </div>
                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                   {run.pillUsed && (
                                     <span style={{fontSize: '0.75rem', color: '#7c3aed', background: '#f5f3ff', padding: '2px 6px', borderRadius: 4}}>
                                       服: {getPillName(run.pillUsed)}
                                     </span>
                                   )}
                                   {run.score !== undefined && (
                                      <div style={{textAlign: 'right', fontWeight: 700, color: '#ea580c', fontSize: '0.9rem', marginLeft: 'auto'}}>
                                      +{formatScore(run.score)} 经验
                                      </div>
                                   )}
                                </div>
                                {run.pillAcquired && run.pillAcquired.length > 0 && (
                                    <div style={{marginTop: 6, fontSize: '0.8rem', color: '#16a34a'}}>
                                        获得: {run.pillAcquired.map(p => getPillName(p)).join(', ')}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const StatsTable = ({ visual, audio }: { visual: ScoreDetail, audio: ScoreDetail }) => {
    const vAcc = calculateAccuracy(visual.hits, visual.misses, visual.falseAlarms);
    const aAcc = calculateAccuracy(audio.hits, audio.misses, audio.falseAlarms);
    const tHits = visual.hits + audio.hits;
    const tMiss = visual.misses + audio.misses;
    const tFalse = visual.falseAlarms + audio.falseAlarms;
    const tAcc = calculateAccuracy(tHits, tMiss, tFalse);
    
    return (
      <table className="stats-table">
        <thead>
          <tr style={{color: '#64748b', borderBottom: '2px solid #e2e8f0'}}>
            <th style={{textAlign: 'left', paddingBottom: 6}}>类型</th>
            <th style={{textAlign: 'right', paddingBottom: 6}}>总匹配</th>
            <th style={{textAlign: 'right', paddingBottom: 6}}>漏按</th>
            <th style={{textAlign: 'right', paddingBottom: 6}}>多按</th>
            <th style={{textAlign: 'right', paddingBottom: 6}}>准确率</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{fontWeight: 600}}>位置</td>
            <td className="stat-val">{visual.hits + visual.misses}</td>
            <td className="stat-val">{visual.misses}</td>
            <td className="stat-val">{visual.falseAlarms}</td>
            <td className="stat-val">{vAcc}%</td>
          </tr>
          <tr>
            <td style={{fontWeight: 600}}>声音</td>
            <td className="stat-val">{audio.hits + audio.misses}</td>
            <td className="stat-val">{audio.misses}</td>
            <td className="stat-val">{audio.falseAlarms}</td>
            <td className="stat-val">{aAcc}%</td>
          </tr>
          <tr style={{background: '#f1f5f9'}}>
            <td style={{fontWeight: 800}}>综合</td>
            <td className="stat-val">{(visual.hits + visual.misses) + (audio.hits + audio.misses)}</td>
            <td className="stat-val">{tMiss}</td>
            <td className="stat-val">{tFalse}</td>
            <td className="stat-val" style={{color: '#3b82f6'}}>{tAcc}%</td>
          </tr>
        </tbody>
      </table>
    );
};

// Line Chart Component
const LineChart = ({ data }: { data: { day: string; avgAcc: number }[] }) => {
    const height = 150;
    const padding = 20;
    const pointWidth = 50; 
    const width = Math.max(300, data.length * pointWidth); // Ensure min width and dynamic scaling
    
    if (data.length === 0) return null;

    // Y scale: 0 to 100 fixed
    const getY = (val: number) => height - padding - (val / 100) * (height - 2 * padding);
    
    // X scale
    const getX = (index: number) => padding + index * ((width - 2 * padding) / (data.length > 1 ? data.length - 1 : 1));

    // Polyline points
    const points = data.map((d, i) => `${getX(i)},${getY(d.avgAcc)}`).join(' ');

    return (
        <div className="chart-wrapper">
             <svg width={width} height={height} className="chart-svg">
                 {/* Grid Lines */}
                 <line x1={padding} y1={getY(25)} x2={width-padding} y2={getY(25)} className="chart-grid-line" />
                 <line x1={padding} y1={getY(50)} x2={width-padding} y2={getY(50)} className="chart-grid-line" />
                 <line x1={padding} y1={getY(75)} x2={width-padding} y2={getY(75)} className="chart-grid-line" />
                 
                 {/* The Line */}
                 {data.length > 1 && (
                     <polyline 
                       points={points} 
                       fill="none" 
                       stroke="#3b82f6" 
                       strokeWidth="2" 
                       strokeLinejoin="round" 
                       strokeLinecap="round"
                     />
                 )}

                 {/* Dots */}
                 {data.map((d, i) => {
                     const x = getX(i);
                     const y = getY(d.avgAcc);
                     return (
                         <g key={i}>
                             <circle cx={x} cy={y} r="3" fill="#3b82f6" />
                             {/* Only show label if sparse or hovered (simplified: show label above point) */}
                             <text x={x} y={y - 8} textAnchor="middle" className="chart-tooltip">{d.avgAcc}</text>
                             <text x={x} y={height - 2} textAnchor="middle" fontSize="10" fill="#64748b">{d.day.split('/')[1] || d.day}</text>
                         </g>
                     );
                 })}
             </svg>
        </div>
    );
};

// Helper for safe storage access
const getSavedSetting = (key: string, def: any) => {
    try {
        const s = localStorage.getItem('dual-n-back-settings-v2');
        if(s) {
            const p = JSON.parse(s);
            return p[key] !== undefined ? p[key] : def;
        }
    } catch(e) {}
    return def;
};

const Game = () => {
  // --- Persistent Settings State ---
  const [n, setN] = useState(() => getSavedSetting('n', DEFAULT_N));
  const [interval, setInterval] = useState(() => getSavedSetting('interval', DEFAULT_INTERVAL));
  const [useCenter, setUseCenter] = useState(() => getSavedSetting('useCenter', true));
  const [isVariable, setIsVariable] = useState(() => getSavedSetting('isVariable', false));
  const [variableWeights, setVariableWeights] = useState<number[]>(() => getSavedSetting('variableWeights', [1]));
  const [showFeedback, setShowFeedback] = useState(() => getSavedSetting('showFeedback', false));
  const [volume, setVolume] = useState(() => getSavedSetting('volume', 0.5));
  const [displayTime, setDisplayTime] = useState(() => getSavedSetting('displayTime', DEFAULT_DISPLAY_TIME));
  
  const [roundMode, setRoundMode] = useState<RoundMode>(() => getSavedSetting('roundMode', 'standard'));
  const [customRoundCount, setCustomRoundCount] = useState<number>(() => getSavedSetting('customRoundCount', 20));
  
  const [pacingMode, setPacingMode] = useState<PacingMode>(() => getSavedSetting('pacingMode', 'standard'));
  const [showRealtimeInterval, setShowRealtimeInterval] = useState(() => getSavedSetting('showRealtimeInterval', false));

  // New settings for progress display
  const [showProgressBar, setShowProgressBar] = useState(() => getSavedSetting('showProgressBar', true));
  const [showRoundCounter, setShowRoundCounter] = useState(() => getSavedSetting('showRoundCounter', true));
  
  // New setting for input confirmation
  const [showInputConfirmation, setShowInputConfirmation] = useState(() => getSavedSetting('showInputConfirmation', true));

  // **新增**：保存不同 N 下的 variableWeights 配置
  const [savedWeightsMap, setSavedWeightsMap] = useState<Record<number, number[]>>(() => {
      try {
          const s = localStorage.getItem('dual-n-back-weights-map-v1');
          return s ? JSON.parse(s) : {};
      } catch(e) { return {}; }
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [sequence, setSequence] = useState<GameStep[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const currentIndexRef = useRef(-1);
  const [totalGameTrials, setTotalGameTrials] = useState(0);
  
  const [dynamicInterval, setDynamicInterval] = useState(DEFAULT_INTERVAL);
  const runningIntervalRef = useRef(DEFAULT_INTERVAL);
  const startTimeRef = useRef<number>(0);
  
  // --- Persistent Data State (Lazy Load) ---
  const [history, setHistory] = useState<GameResult[]>(() => {
      try {
          const s = localStorage.getItem('dual-n-back-history-v4');
          return s ? JSON.parse(s) : [];
      } catch(e) { return []; }
  });

  const [cultivation, setCultivation] = useState<CultivationState>(() => {
      try {
          const s = localStorage.getItem('dual-n-back-cultivation-v1');
          if (s) {
            const parsed = JSON.parse(s);
            if (parsed.stageStudyTime === undefined) parsed.stageStudyTime = 0;
            return {
                ...parsed,
                totalSessions: parsed.totalSessions || 0,
                stageSessions: parsed.stageSessions || 0
            };
          }
      } catch(e) {}
      return {
          realmLevel: 1, 
          stage: 0, 
          currentXP: 0,
          recentScores: [], 
          totalStudyTime: 0, 
          stageStudyTime: 0, 
          totalSessions: 0,
          stageSessions: 0
      };
  });

  // 修复：将 Realm 名称和阶段名称移至顶层，供整个组件使用
    const realmName = REALMS[cultivation.realmLevel] || '未知';
    const stageName = STAGES[cultivation.stage] || '';
  
  // 【新增】在这里定义瓶颈状态，防止 ReferenceError
  const isBottleneck = [1, 3, 5].includes(cultivation.stage);
  const isGreatPerfect = cultivation.stage === 7;

  const [milestones, setMilestones] = useState<Milestone[]>(() => {
      try {
          const s = localStorage.getItem('dual-n-back-milestones-v1');
          return s ? JSON.parse(s) : [];
      } catch(e) { return []; }
  });

  // --- Pill & Inventory State ---
  const [inventory, setInventory] = useState<Pill[]>(() => {
    try {
      const s = localStorage.getItem('dual-n-back-inventory-v1');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });
  
  const [gachaState, setGachaState] = useState<GachaState>(() => {
    try {
      const s = localStorage.getItem('dual-n-back-gacha-v1');
      return s ? JSON.parse(s) : { accumulatedTime: 0, availableDraws: 0 };
    } catch { return { accumulatedTime: 0, availableDraws: 0 }; }
  });

  const [selectedPillId, setSelectedPillId] = useState<string | null>(null);
  const [showInventory, setShowInventory] = useState(false);
  const [showGacha, setShowGacha] = useState(false);
  const [lastGachaResult, setLastGachaResult] = useState<Pill | null>(null); // New state for gacha result

  const [showHistory, setShowHistory] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  
  const [showSummary, setShowSummary] = useState(false);
  const [showMilestones, setShowMilestones] = useState(false);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);
  
  const [activePos, setActivePos] = useState<number | null>(null);
  const [currentNumberDisplay, setCurrentNumberDisplay] = useState<number | null>(null); 
  
  const [audioPressed, setAudioPressed] = useState(false);
  const [visualPressed, setVisualPressed] = useState(false);
  
  const [audioFeedback, setAudioFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [visualFeedback, setVisualFeedback] = useState<'correct' | 'wrong' | null>(null);

  // Analysis state
  const [searchN, setSearchN] = useState<string>('');
  const [searchType, setSearchType] = useState<'all' | 'fixed' | 'variable'>('all');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const scoreRef = useRef<Record<'audio' | 'visual', ScoreDetail>>({
    audio: { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 },
    visual: { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 }
  });

  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const inputsRef = useRef({ audio: false, visual: false });
  const prevTrialInputsRef = useRef({ audio: false, visual: false });
  const currentTrialStartTimeRef = useRef<number>(0);

  // --- Effects for Auto-Saving ---
  
  // Save Settings
  useEffect(() => {
    const s = { n, interval, useCenter, isVariable, variableWeights, showFeedback, volume, roundMode, customRoundCount, showProgressBar, showRoundCounter, showInputConfirmation, displayTime, pacingMode, showRealtimeInterval };
    localStorage.setItem('dual-n-back-settings-v2', JSON.stringify(s));
  }, [n, interval, useCenter, isVariable, variableWeights, showFeedback, volume, roundMode, customRoundCount, showProgressBar, showRoundCounter, showInputConfirmation, displayTime, pacingMode, showRealtimeInterval]);

  // Save Weights Map
  useEffect(() => {
      localStorage.setItem('dual-n-back-weights-map-v1', JSON.stringify(savedWeightsMap));
  }, [savedWeightsMap]);

  // Save History
  useEffect(() => {
     localStorage.setItem('dual-n-back-history-v4', JSON.stringify(history));
  }, [history]);

  // Save Cultivation
  useEffect(() => {
     localStorage.setItem('dual-n-back-cultivation-v1', JSON.stringify(cultivation));
  }, [cultivation]);

  // Save Milestones
  useEffect(() => {
     localStorage.setItem('dual-n-back-milestones-v1', JSON.stringify(milestones));
  }, [milestones]);
  
  // Save Inventory & Gacha
  useEffect(() => {
    localStorage.setItem('dual-n-back-inventory-v1', JSON.stringify(inventory));
  }, [inventory]);
  
  useEffect(() => {
    localStorage.setItem('dual-n-back-gacha-v1', JSON.stringify(gachaState));
  }, [gachaState]);


  const handleExportData = () => {
    const data = {
      history,
      cultivation,
      milestones,
      inventory,
      gachaState,
      savedWeightsMap
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dualn-back-${formatDateForFilename(Date.now())}.json`;
    a.click();
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.history) setHistory(data.history);
        if (data.cultivation) setCultivation(data.cultivation);
        if (data.milestones) setMilestones(data.milestones);
        if (data.inventory) setInventory(data.inventory);
        if (data.gachaState) setGachaState(data.gachaState);
        if (data.savedWeightsMap) setSavedWeightsMap(data.savedWeightsMap);
        alert('存档导入成功！');
      } catch (err) {
        alert('存档文件无效');
      }
    };
    reader.readAsText(file);
  };

  // **修改**：当 N 改变时，尝试从 savedWeightsMap 恢复权重，否则重置
  useEffect(() => {
    if (savedWeightsMap[n]) {
        setVariableWeights(savedWeightsMap[n]);
    } else {
        const newWeights = new Array(n).fill(10);
        setVariableWeights(newWeights);
    }
  }, [n]);

  useEffect(() => {
    const initAudio = async () => {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioContextRef.current = new AudioCtx();
        try {
            const sRes = await fetch('/silence.wav');
            if (sRes.ok) {
                const sBuf = await sRes.arrayBuffer();
                const sDecoded = await audioContextRef.current.decodeAudioData(sBuf);
                audioBuffersRef.current.set('silence', sDecoded);
            }
        } catch(e) { console.warn("Silence load failed"); }

        for (const letter of LETTERS) {
          try {
            const response = await fetch(`/${letter}.wav?t=${Date.now()}`);
            const type = response.headers.get('Content-Type');
            if (type && type.includes('text/html')) {
                continue;
            }

            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
              audioBuffersRef.current.set(letter, audioBuffer);
            }
          } catch (e) {
            console.error(`⚠️ 解码错误 ${letter}:`, e);
          }
        }
      }
    };
    initAudio();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []); 

  const playSound = (letter: string) => {
    if (!audioContextRef.current) return;
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
    const buffer = audioBuffersRef.current.get(letter);
    if (buffer) {
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = volume;
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      source.start(0);
    } else {
      window.speechSynthesis.cancel(); // ensure previous is cleared
      const utterance = new SpeechSynthesisUtterance(letter.toUpperCase());
      utterance.lang = 'en-US';
      utterance.rate = 1.6;
      utterance.volume = volume;
      window.speechSynthesis.speak(utterance);
    }
  };

  const startGame = async() => {
    if (isPlaying) return;
    
    startTimeRef.current = Date.now();

    if (audioContextRef.current) {
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      try {
          const buffer = audioBuffersRef.current.get('silence') || ctx.createBuffer(1, 1, 22050);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
      } catch(e) { console.error("Unlock failed", e); }
    }
    
    const trials = getRoundCount(n, roundMode, customRoundCount);
    setTotalGameTrials(trials);
    
    const currentWeights = variableWeights.length === n ? variableWeights : new Array(n).fill(10);
    
    const newSeq = generateSequence(trials, n, useCenter, isVariable, currentWeights);
    setSequence(newSeq);
    setCurrentIndex(-1);
    currentIndexRef.current = -1;
    setIsPlaying(true);
    setShowSummary(false);
    
    // Reset Dynamic Interval to base
    setDynamicInterval(interval);
    runningIntervalRef.current = interval;
    
    scoreRef.current = {
      audio: { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 },
      visual: { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 }
    };

    // Delay start by 2000ms
    setTimeout(() => nextTrial(0, newSeq), 2000);
  };

  const stopGame = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPlaying(false);
    setActivePos(null);
    setCurrentNumberDisplay(null);
  };

  const calculateVariableDifficulty = () => {
    if (!isVariable) return n;
    const totalW = variableWeights.reduce((a, b) => a + b, 0);
    if (totalW === 0) return 0;
    let weightedSum = 0;
    variableWeights.forEach((w, i) => {
      weightedSum += (i + 1) * w;
    });
    return parseFloat((weightedSum / totalW).toFixed(2));
  };

  const saveResults = () => {
    const vScore = scoreRef.current.visual;
    const aScore = scoreRef.current.audio;
    const totalHits = vScore.hits + aScore.hits;
    const totalMisses = vScore.misses + aScore.misses;
    const totalFalse = vScore.falseAlarms + aScore.falseAlarms;
    const totalAccVal = calculateAccuracy(totalHits, totalMisses, totalFalse);
    const accFraction = totalAccVal / 100;

    const difficulty = isVariable ? calculateVariableDifficulty() : n;
    
    // Base Score
    const multiplier = (Math.pow(64, accFraction) - 1) / 63;
    let calculatedScore = Math.pow(10, difficulty) * multiplier;

    // --- Pill & Gacha Logic ---
    const nextCultivation = { ...cultivation };
    const newMilestonesList: Milestone[] = [];
    const acquiredPills: Pill[] = [];
    let pillEffectLog = '';

    // Calculate REAL session duration for Gacha
    const endTime = Date.now();
    const sessionTime = (endTime - startTimeRef.current) / 1000;
    
    // Update Gacha State (every 10 mins = 600s)
    const newGachaState = { ...gachaState };
    newGachaState.accumulatedTime += sessionTime;
    const addedDraws = Math.floor(newGachaState.accumulatedTime / 600);
    if (addedDraws > 0) {
       newGachaState.availableDraws += addedDraws;
       newGachaState.accumulatedTime %= 600;
    }
    setGachaState(newGachaState);

    // Apply Selected Pill
    const usedPill = inventory.find(p => p.id === selectedPillId);
    let scoreMultiplier = 1;
    let bottleneckMultiplier = 2/3; // Default
    let protectXP = false;
    let tribulationReqOffset = 0;
    
    if (usedPill) {
        // Consumption logic: remove from inventory
        setInventory(prev => prev.filter(p => p.id !== selectedPillId));
        setSelectedPillId(null);
        
        // Spirit Pill Effect
        if (usedPill.type === 'spirit') {
             // 1. Check if user is in Accumulation Phase (0, 2, 4, 6)
             if ([0, 2, 4, 6].includes(nextCultivation.stage)) {
                 // C值逻辑: Pre=1, Mid=2, Late=4, Perf=6, G.Perf=8
                 const C_VALUES = [1, 2, 4, 6, 8];
                 const C = C_VALUES[usedPill.subRealm ?? 0] || 1;
                 
                 let mult = 1; 
                 let capBase = 0;
                 if (usedPill.grade === 'low') { mult = 1.5; capBase = 0.5; }
                 else if (usedPill.grade === 'mid') { mult = 2.0; capBase = 1.0; }
                 else if (usedPill.grade === 'high') { mult = 3.0; capBase = 2.0; }
                 else if (usedPill.grade === 'peak') { mult = 5.0; capBase = 4.0; }
                 
                 // Cap is based on Pill Realm.
                 let realCap = C * capBase * Math.pow(10, usedPill.realm);

                 const rawExtra = calculatedScore * (mult - 1);
                 const finalExtra = Math.min(rawExtra, realCap);
                 
                 calculatedScore += finalExtra;
                 pillEffectLog = `灵元丹生效: 额外获得 ${formatScore(finalExtra)} 经验 (上限 ${formatScore(realCap)})`;
             } else {
                 pillEffectLog = `灵元丹无效: 当前不在修炼积累期`;
             }
        }
        
        // Focus Pill Effect
        if (usedPill.type === 'focus') {
             // Check if Bottleneck (1, 3, 5)
             if ([1, 3, 5].includes(nextCultivation.stage)) {
                 // Dynamic Grade Logic
                 // Map User Stage to SubRealm Index (0,1,2)
                 const userSubIdx = Math.floor((nextCultivation.stage - 1) / 2);
                 const userLinear = nextCultivation.realmLevel * 3 + userSubIdx;
                 
                 const pillSubIdx = usedPill.subRealm ?? 0;
                 const pillLinear = usedPill.realm * 3 + pillSubIdx;
                 
                 const diff = pillLinear - userLinear;
                 
                 // Base Grade Value: Low=0, Mid=1, High=2
                 let baseGradeVal = 0;
                 if (usedPill.grade === 'mid') baseGradeVal = 1;
                 if (usedPill.grade === 'high') baseGradeVal = 2;
                 
                 // Result Grade Value
                 let resultGradeVal = baseGradeVal + diff;
                 
                 // If diff implies downgrading below Low -> Invalid
                 if (resultGradeVal < 0) {
                     pillEffectLog = `凝神丹失效: 丹药阶位过低`;
                     bottleneckMultiplier = 2/3;
                 } else {
                     // Cap at High (2)
                     resultGradeVal = Math.min(2, resultGradeVal);
                     
                     // Apply multiplier
                     if (resultGradeVal === 0) bottleneckMultiplier = 0.75;
                     else if (resultGradeVal === 1) bottleneckMultiplier = 0.85;
                     else if (resultGradeVal === 2) bottleneckMultiplier = 1.0;
                     
                     const gradeStr = resultGradeVal === 2 ? '优品' : resultGradeVal === 1 ? '良品' : '次品';
                     pillEffectLog = `凝神丹(${gradeStr})生效: 转化率提升至 ${(bottleneckMultiplier*100).toFixed(0)}%`;
                 }
             } else {
                 pillEffectLog = `凝神丹无效: 当前不在瓶颈期`;
             }
        }
        
        // Foundation Pill Effect
        if (usedPill.type === 'foundation') {
            if ([1, 3, 5].includes(nextCultivation.stage)) {
                const userSubRealm = Math.floor((nextCultivation.stage - 1) / 2);
                
                // 计算线性值进行比较
                const userVal = nextCultivation.realmLevel * 10 + userSubRealm;
                const pillVal = usedPill.realm * 10 + (usedPill.subRealm ?? 0);

                if (pillVal >= userVal) {
                    let effectiveType = 'virtual';
                    
                    // 逻辑：如果丹药 > 自身，或者是同级实品，则为实品效果
                    if (pillVal > userVal) {
                        effectiveType = 'real';
                    } else if (pillVal === userVal && usedPill.grade === 'real') {
                        effectiveType = 'real';
                    }
                    
                    if (effectiveType === 'real') {
                        protectXP = true; // 锁定逻辑
                        pillEffectLog = `实品护基丹激活(含阶位压制): 若突破失败将锁定修为`;
                        // 这是一个临时标记，告诉下面的逻辑它是实品保护
                        // 我们用一个特殊的变量名来传递这个状态给下面计算分数的逻辑
                        // 由于 protectXP 只是个 boolean，我们需要区分虚/实
                        // 建议在 saveResults 作用域顶端定义 let foundationEffect = 'none'; // 'none', 'real', 'virtual'
                    } else {
                        // 虚品且同级
                        protectXP = false; 
                        // 这里需要传递虚品状态给下面的计算逻辑
                        // 为了不破坏现有结构，我们利用 protectXP 变量含义的局限性
                        // 建议修改下面的计算逻辑来读取 usedPill
                        pillEffectLog = `虚品护基丹激活: 若突破失败将减缓修为倒退`;
                    }
                } else {
                    pillEffectLog = `护基丹无效: 丹药境界不足`;
                }
            } else {
                pillEffectLog = `护基丹无效: 当前不在瓶颈期`;
            }
        }
        
        // Heavenly Pill Effect
        if (usedPill.type === 'heavenly') {
             if (nextCultivation.stage === 6 || nextCultivation.stage === 7) {
                 if (usedPill.realm >= nextCultivation.realmLevel) {
                     if (usedPill.grade === 'human') tribulationReqOffset = 5; 
                     else if (usedPill.grade === 'earth') tribulationReqOffset = 10; 
                     else if (usedPill.grade === 'heaven') tribulationReqOffset = 15; 
                     pillEffectLog = `通天渡厄丹生效: 渡劫要求降低 ${tribulationReqOffset}%`;
                 } else {
                     pillEffectLog = `通天渡厄丹无效: 丹药境界过低`;
                 }
             } else {
                 pillEffectLog = `通天渡厄丹无效: 未至渡劫之时`;
             }
        }
    }

    // --- Pill Drop Logic ---
    
    // 1. Focus Pill (Variable Mode only)
    if (isVariable && difficulty > 0) {
        const realm = Math.floor(difficulty);
        const dec = difficulty - realm;
        let sub: SubRealm = 0;
        if (dec >= 0.67) sub = 2; // Late
        else if (dec >= 0.34) sub = 1; // Mid
        
        let dropGrade: PillGrade | null = null;
        if (totalAccVal === 100) dropGrade = 'high'; // 优品
        else if (totalAccVal >= 90) dropGrade = 'mid'; // 良品
        else if (totalAccVal >= 80) dropGrade = 'low'; // 次品
        
        if (dropGrade) {
            acquiredPills.push({
                id: Date.now().toString() + 'f',
                type: 'focus',
                realm: realm,
                subRealm: sub,
                grade: dropGrade,
                timestamp: Date.now()
            });
        }
    }

// 2. Foundation Pill (护基丹掉落逻辑重构)
    const dropRealmBase = Math.floor(difficulty);
    if (dropRealmBase > 0) {
         // 获取三个小境界瓶颈的目标分数
         // index 0: 前期->中期 (对应 SubRealm 0)
         // index 1: 中期->后期 (对应 SubRealm 1)
         // index 2: 后期->圆满 (对应 SubRealm 2)
         const targets = [
             getBreakthroughTarget(dropRealmBase, 1),
             getBreakthroughTarget(dropRealmBase, 3),
             getBreakthroughTarget(dropRealmBase, 5)
         ];
         
         // 计算当前用户的可比对 SubRealm (用于过滤)
         const userRealm = nextCultivation.realmLevel;
         let currentUserSub = 0;
         if (nextCultivation.stage >= 6) currentUserSub = 3;
         else if (nextCultivation.stage >= 4) currentUserSub = 2;
         else if (nextCultivation.stage >= 2) currentUserSub = 1;
         else currentUserSub = 0;

         let foundPill = null;

         // 从高到低遍历 (后期 -> 中期 -> 前期)，以获得“对应的最高境界”
         for (let i = 2; i >= 0; i--) {
             const target = targets[i];
             if (target <= 0) continue; // 防御性检查

             // 判定标准：
             // 实品：分数 >= 瓶颈要求
             // 虚品：分数 >= 瓶颈要求 * 0.6 (且 < 下一级的要求，但这里通过从高到低遍历解决)
             
             let grade: PillGrade | null = null;
             
             if (calculatedScore >= target) {
                 grade = 'real';
             } else if (calculatedScore >= target * 0.6) {
                 grade = 'virtual';
             }

             if (grade) {
                 // 命中区间，检查是否满足“境界高于自己”或“同境界但小境界>=自己”
                 // 您的要求：境界 <= 自己就不要出现。这里特指大境界低于，或者同大境界且小境界低于的情况。
                 
                 let isUseful = false;
                 if (dropRealmBase > userRealm) {
                     isUseful = true;
                 } else if (dropRealmBase === userRealm) {
                     // i 是丹药的小境界 (0,1,2), currentUserSub 是用户的小境界
                     if (i >= currentUserSub) {
                         isUseful = true;
                     }
                 }

                 if (isUseful) {
                     foundPill = {
                         sub: i as SubRealm,
                         grade: grade
                     };
                     break; // 找到了最高境界符合条件的，停止遍历
                 }
             }
         }
         
         if (foundPill) {
             acquiredPills.push({
                 id: Date.now().toString() + 'fd',
                 type: 'foundation',
                 realm: dropRealmBase,
                 subRealm: foundPill.sub,
                 grade: foundPill.grade, 
                 timestamp: Date.now() + 1 
             });
         }
    }    
// 3. Heavenly Pill
    if (dropRealmBase > 0) {
        let hGrade: PillGrade | null = null;
        if (totalAccVal === 100) hGrade = 'heaven';
        else if (totalAccVal >= 90) hGrade = 'earth';
        else if (totalAccVal >= 80) hGrade = 'human';
        
        if (hGrade) {
             // 严格检查：只有当 掉落境界 > 自身境界 时才获得
             if (dropRealmBase > nextCultivation.realmLevel) {
                 acquiredPills.push({
                     id: Date.now().toString() + 'h',
                     type: 'heavenly',
                     realm: dropRealmBase,
                     grade: hGrade,
                     timestamp: Date.now() + 2 
                 });
             }
        }
    }
    
    // Add acquired pills to inventory
    if (acquiredPills.length > 0) {
        setInventory(prev => [...prev, ...acquiredPills]);
    }

    // --- Update Cultivation ---
    
    nextCultivation.totalStudyTime += sessionTime;
    nextCultivation.stageStudyTime += sessionTime;
    nextCultivation.totalSessions = (nextCultivation.totalSessions || 0) + 1;
    nextCultivation.stageSessions = (nextCultivation.stageSessions || 0) + 1;

    const realm = nextCultivation.realmLevel;
    const stage = nextCultivation.stage;

    // Major Breakthrough (Tribulation)
    if (stage === 6 || stage === 7) {
        const isHardEnough = difficulty >= (realm + 1);
        const reqAcc = 80 - tribulationReqOffset;
        const isAccurateEnough = totalAccVal >= reqAcc;

        if (isHardEnough && isAccurateEnough) {
             const inheritedXP = Math.floor(nextCultivation.currentXP / 2);
             
             newMilestonesList.push({
                id: Date.now().toString(),
                timestamp: Date.now(),
                type: 'major',
                title: `渡劫成功！晋升${REALMS[realm + 1]}`,
                description: `从${STAGES[stage]}突破桎梏。获得初始经验 ${formatScore(inheritedXP)}。难度 N=${n}, 准确率 ${totalAccVal}% (要求 ${reqAcc}%)。`,
                stageDuration: nextCultivation.stageStudyTime,
                totalDuration: nextCultivation.totalStudyTime,
                stageSessions: nextCultivation.stageSessions,
                totalSessions: nextCultivation.totalSessions
             });
             
             nextCultivation.realmLevel += 1;
             nextCultivation.stage = 0;
             nextCultivation.currentXP = inheritedXP;
             nextCultivation.recentScores = [];
             nextCultivation.stageStudyTime = 0;
             nextCultivation.stageSessions = 0;
             
             finalizeResults(nextCultivation, newMilestonesList, calculatedScore, totalAccVal, difficulty, usedPill, pillEffectLog, acquiredPills);
             return;
        }
    }

    // Normal Progression
    if (stage === 0 || stage === 2 || stage === 4) {
      // Accumulation Stages
      nextCultivation.currentXP += calculatedScore;
      const maxXP = getMaxXP(realm, stage);
      
      if (nextCultivation.currentXP >= maxXP) {
        newMilestonesList.push({
          id: Date.now().toString(),
          timestamp: Date.now(),
          type: 'peak',
          title: `到达${REALMS[realm]}${STAGES[stage]}巅峰`,
          description: `修为积累圆满 (需达到 ${formatScore(maxXP)} 经验)。`,
          stageDuration: nextCultivation.stageStudyTime,
          totalDuration: nextCultivation.totalStudyTime,
          stageSessions: nextCultivation.stageSessions,
          totalSessions: nextCultivation.totalSessions
        });

        nextCultivation.stage += 1; 
        nextCultivation.currentXP = 0;
        nextCultivation.recentScores = []; 
        nextCultivation.stageStudyTime = 0;
        nextCultivation.stageSessions = 0;
      }
    } else if (stage === 1 || stage === 3 || stage === 5) {
      // Bottleneck Stages
      const prevWeighted = nextCultivation.currentXP;
      // Apply Focus Pill Multiplier
      let newWeighted = prevWeighted * bottleneckMultiplier + calculatedScore;
      
      // Apply Foundation Pill Protection
      if (newWeighted < prevWeighted && usedPill && usedPill.type === 'foundation') {
          // 重新计算一次判定，确保逻辑一致
          const userSubRealm = Math.floor((stage - 1) / 2);
          const userVal = realm * 10 + userSubRealm;
          const pillVal = usedPill.realm * 10 + (usedPill.subRealm ?? 0);
          
          if (pillVal > userVal) {
              // 高境界 -> 强制实品效果
              newWeighted = prevWeighted;
              pillEffectLog += ' | 阶位压制生效：修为完全锁定';
          } else if (pillVal === userVal) {
              if (usedPill.grade === 'real') {
                  newWeighted = prevWeighted;
                  pillEffectLog += ' | 实品药效：修为完全锁定';
              } else {
                  // 虚品
                  newWeighted = (prevWeighted + newWeighted) / 2;
                  pillEffectLog += ' | 虚品药效：修为倒退减缓';
              }
          }
      } else if (protectXP && newWeighted < prevWeighted) { 
          // 兼容旧逻辑/其他情况（如果有）
          newWeighted = prevWeighted;
      }

      nextCultivation.currentXP = newWeighted;
      // ... 后续代码不变
      
      const target = getBreakthroughTarget(realm, stage);
      
      if (newWeighted >= target) {
        const nextStageIdx = stage + 1;
        const nextStageName = STAGES[nextStageIdx];
        
        newMilestonesList.push({
          id: Date.now().toString(),
          timestamp: Date.now(),
          type: 'minor',
          title: `突破至${REALMS[realm]}${nextStageName}`,
          description: `瓶颈突破成功！本次综合评分 ${formatScore(newWeighted)} (要求 ≥ ${formatScore(target)})。`,
          stageDuration: nextCultivation.stageStudyTime,
          totalDuration: nextCultivation.totalStudyTime,
          stageSessions: nextCultivation.stageSessions,
          totalSessions: nextCultivation.totalSessions
        });

        nextCultivation.stage = nextStageIdx;
        nextCultivation.currentXP = 0;
        nextCultivation.recentScores = [];
        nextCultivation.stageStudyTime = 0;
        nextCultivation.stageSessions = 0;
      }
    } else if (stage === 6) {
        // Perfect Stage (圆满)
        nextCultivation.currentXP += calculatedScore;
        const maxXP = getMaxXP(realm, stage); 
        
        if (nextCultivation.currentXP >= maxXP) {
            newMilestonesList.push({
                id: Date.now().toString(),
                timestamp: Date.now(),
                type: 'peak',
                title: `到达${REALMS[realm]}大圆满`,
                description: `修为已至化境，无可再进。需寻找契机渡劫飞升。`,
                stageDuration: nextCultivation.stageStudyTime,
                totalDuration: nextCultivation.totalStudyTime,
                stageSessions: nextCultivation.stageSessions,
                totalSessions: nextCultivation.totalSessions
            });
            
            nextCultivation.currentXP = maxXP; 
            nextCultivation.stage = 7; 
            nextCultivation.recentScores = [];
            nextCultivation.stageStudyTime = 0;
            nextCultivation.stageSessions = 0;
        }
    }

    finalizeResults(nextCultivation, newMilestonesList, calculatedScore, totalAccVal, difficulty, usedPill, pillEffectLog, acquiredPills);
  };
  
  const finalizeResults = (
      nextCultivation: CultivationState, 
      newMilestonesList: Milestone[], 
      calculatedScore: number, 
      totalAccVal: number,
      difficulty: number,
      usedPill?: Pill,
      pillEffectLog?: string,
      acquiredPills?: Pill[]
  ) => {
    const result: GameResult = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      n,
      interval,
      totalTrials: sequence.length,
      audioScore: { ...scoreRef.current.audio },
      visualScore: { ...scoreRef.current.visual },
      isVariable,
      variableDifficulty: isVariable ? difficulty : undefined,
      score: calculatedScore,
      accuracy: totalAccVal,
      device: getDeviceType(),
      realmLevel: cultivation.realmLevel,
      stage: cultivation.stage,
      afterRealmLevel: nextCultivation.realmLevel,
      afterStage: nextCultivation.stage,
      pacingMode,
      pillUsed: usedPill,
      pillEffectLog,
      pillAcquired: acquiredPills
    };
    
    setLastResult(result);

    setHistory(prev => {
        const newH = [result, ...prev];
        if (newH.length > 3000) newH.pop();
        return newH;
    });
    
    setCultivation(nextCultivation);
    if (newMilestonesList.length > 0) {
        setMilestones(prev => [...newMilestonesList, ...prev]);
    }

    setShowSummary(true);
  };

  const nextTrial = (idx: number, seq: GameStep[], overrideDuration?: number) => {
    if (idx >= seq.length) {
      stopGame();
      saveResults();
      return;
    }

    setCurrentIndex(idx);
    currentIndexRef.current = idx;
    prevTrialInputsRef.current = { ...inputsRef.current };
    inputsRef.current = { audio: false, visual: false };
    currentTrialStartTimeRef.current = Date.now();
    
    const step = seq[idx];
    
    setActivePos(step.position);
    if (isVariable && idx >= n) {
      setCurrentNumberDisplay(step.nBack);
    } else {
      setCurrentNumberDisplay(null);
    }

    playSound(step.letter);

    setAudioPressed(false);
    setVisualPressed(false);
    setAudioFeedback(null);
    setVisualFeedback(null);

    // If not self-paced, schedule next trial
    if (pacingMode !== 'self-paced') {
       // Use overrideDuration if provided (calculated from previous step), otherwise default logic
       let dur = interval * 1000;
       
       if (pacingMode === 'dynamic') {
           // Prioritize override, fallback to ref, fallback to interval
           const dyn = overrideDuration !== undefined ? overrideDuration : runningIntervalRef.current;
           dur = dyn * 1000;
       }

       timerRef.current = window.setTimeout(() => {
          finishTrialAndNext(idx, seq);
       }, dur);
    }
  };

  const finishTrialAndNext = (idx: number, seq: GameStep[]) => {
    const step = seq[idx];
    const effectiveN = isVariable ? step.nBack : n;
    
    // Dynamic Logic Variables
    let hasError = false;
    let hasHit = false;

    if (idx >= effectiveN) {
       const currentStep = seq[idx];
       const nBackStep = seq[idx - effectiveN];
       
       const isAudioMatch = currentStep.letter === nBackStep.letter;
       const isVisualMatch = currentStep.position === nBackStep.position;
       
       const aPressed = inputsRef.current.audio;
       const vPressed = inputsRef.current.visual;

       if (isAudioMatch) {
         if (aPressed) { scoreRef.current.audio.hits++; hasHit = true; }
         else { scoreRef.current.audio.misses++; hasError = true; }
       } else {
         if (aPressed) { scoreRef.current.audio.falseAlarms++; hasError = true; }
         else scoreRef.current.audio.correctRejections++;
       }

       if (isVisualMatch) {
         if (vPressed) { scoreRef.current.visual.hits++; hasHit = true; }
         else { scoreRef.current.visual.misses++; hasError = true; }
       } else {
         if (vPressed) { scoreRef.current.visual.falseAlarms++; hasError = true; }
         else scoreRef.current.visual.correctRejections++;
       }
    }
    
    let nextIntervalVal = runningIntervalRef.current;

    if (pacingMode === 'dynamic') {
        let delta = 0;
        // Prioritize Error Logic
        if (hasError) {
            const rawNext = parseFloat((runningIntervalRef.current + 0.1).toFixed(2));
            // Ensure not shorter than default (interval), clamp to max
            const clampedMin = Math.max(rawNext, interval);
            const absoluteMax = parseFloat((interval + 1.0).toFixed(2));
            nextIntervalVal = Math.min(clampedMin, absoluteMax);
        } else if (hasHit) {
            // Success Logic
            const rawNext = parseFloat((runningIntervalRef.current - 0.05).toFixed(2));
            // Clamp to min
            const absoluteMin = Math.max(0.1, parseFloat((interval - 0.5).toFixed(2)));
            nextIntervalVal = Math.max(rawNext, absoluteMin);
        }
        
        runningIntervalRef.current = nextIntervalVal;
        setDynamicInterval(nextIntervalVal);
    }

    setActivePos(null); 
    nextTrial(idx + 1, seq, nextIntervalVal);
  };

  useEffect(() => {
    if (currentIndex >= 0 && isPlaying) {
      // Flash duration for visual stimulus
      const showDuration = displayTime * 1000;
      const t = setTimeout(() => {
        setActivePos(null);
        setCurrentNumberDisplay(null); // Hide number as well
      }, showDuration); 
      return () => clearTimeout(t);
    }
  }, [currentIndex, isPlaying, interval, displayTime]);

  const handleInput = useCallback((type: 'audio' | 'visual') => {
    if (!isPlaying) return;
    
    // Grace Period Logic (0.2s)
    const now = Date.now();
    const idx = currentIndexRef.current;

    if (now - currentTrialStartTimeRef.current < 200 && idx > 0) {
        const prevIdx = idx - 1;
        const prevStep = sequence[prevIdx];
        const prevEffectiveN = isVariable ? prevStep.nBack : n;
        
        if (prevIdx >= prevEffectiveN) {
            const prevNBackStep = sequence[prevIdx - prevEffectiveN];
            
            // Check if user ALREADY pressed for previous trial
            const alreadyPressed = type === 'audio' ? prevTrialInputsRef.current.audio : prevTrialInputsRef.current.visual;
            
            if (!alreadyPressed) {
                // Determine if previous trial was a match
                let isMatch = false;
                if (type === 'audio') isMatch = prevStep.letter === prevNBackStep.letter;
                else isMatch = prevStep.position === prevNBackStep.position;
                
                if (isMatch) {
                    // It was a match, but user missed it. Convert Miss to Hit.
                    if (type === 'audio') {
                        scoreRef.current.audio.misses--;
                        scoreRef.current.audio.hits++;
                        if (showFeedback) setAudioFeedback('correct');
                        prevTrialInputsRef.current.audio = true;
                    } else {
                        scoreRef.current.visual.misses--;
                        scoreRef.current.visual.hits++;
                        if (showFeedback) setVisualFeedback('correct');
                        prevTrialInputsRef.current.visual = true;
                    }
                    return; 
                } else {
                    // It was NOT a match. User didn't press (Correct Rejection).
                    // Now they press late -> False Alarm.
                    if (type === 'audio') {
                        scoreRef.current.audio.correctRejections--;
                        scoreRef.current.audio.falseAlarms++;
                        if (showFeedback) setAudioFeedback('wrong');
                        prevTrialInputsRef.current.audio = true;
                    } else {
                        scoreRef.current.visual.correctRejections--;
                        scoreRef.current.visual.falseAlarms++;
                        if (showFeedback) setVisualFeedback('wrong');
                        prevTrialInputsRef.current.visual = true;
                    }
                    return;
                }
            }
        }
    }

    const currentStep = sequence[idx];
    const effectiveN = isVariable ? currentStep.nBack : n;
    
    if (idx < effectiveN) return; 
    
    const nBackStep = sequence[idx - effectiveN];
    
    if (type === 'audio') {
      if (inputsRef.current.audio) return;
      inputsRef.current.audio = true;
      setAudioPressed(true);
      if (showFeedback) {
        const isMatch = currentStep.letter === nBackStep.letter;
        setAudioFeedback(isMatch ? 'correct' : 'wrong');
      }
    } else {
      if (inputsRef.current.visual) return;
      inputsRef.current.visual = true;
      setVisualPressed(true);
      if (showFeedback) {
        const isMatch = currentStep.position === nBackStep.position;
        setVisualFeedback(isMatch ? 'correct' : 'wrong');
      }
    }
  }, [isPlaying, n, sequence, isVariable, showFeedback]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') handleInput('visual');
      if (e.code === 'KeyL' || e.code === 'ArrowRight') handleInput('audio');
      
      // Self-paced Mode Logic
      if (pacingMode === 'self-paced' && isPlaying && e.code === 'Space') {
          e.preventDefault();
          // Advance manually
          finishTrialAndNext(currentIndex, sequence);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleInput, pacingMode, isPlaying, currentIndex, sequence]);

  const handleWeightChange = (index: number, val: string) => {
    const newW = [...variableWeights];
    const num = parseInt(val) || 0;
    newW[index] = Math.max(0, num);
    setVariableWeights(newW);
    // **修改**: 实时更新 savedWeightsMap，这样切换时可以保存
    setSavedWeightsMap(prev => ({ ...prev, [n]: newW }));
  };
  
  // --- Gacha Logic ---
  const handleGachaDraw = () => {
    if (gachaState.availableDraws <= 0) return;
    
    const realm = cultivation.realmLevel;
    const rand = Math.random();
    let grade: PillGrade = 'low';
    if (rand < 0.02) grade = 'peak';
    else if (rand < 0.10) grade = 'high';
    else if (rand < 0.40) grade = 'mid';
    
    // 决定灵元丹的小境界
    const userStage = cultivation.stage;
    let pillSub: SubRealm = 0;
    if (userStage <= 1) pillSub = 0; // 前期/前期巅峰 -> 前期
    else if (userStage <= 3) pillSub = 1; // 中期
    else if (userStage <= 5) pillSub = 2; // 后期
    else if (userStage === 6) pillSub = 3; // 圆满
    else pillSub = 4; // 大圆满

    const newPill: Pill = {
        id: Date.now().toString(),
        type: 'spirit',
        realm: realm,
        subRealm: pillSub,
        grade: grade,
        timestamp: Date.now()
    };
    
    setInventory(prev => [...prev, newPill]);
    setGachaState(prev => ({...prev, availableDraws: prev.availableDraws - 1}));
    setLastGachaResult(newPill); // 记录抽奖结果用于显示
  };

  const renderSummary = (result: GameResult) => {
    return (
      <div className="modal-overlay" onClick={() => setShowSummary(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div style={{textAlign: 'center', marginBottom: 20}}>
            <h2 style={{margin: 0, fontSize: '1.5rem'}}>训练报告</h2>
            <div style={{color: '#64748b', margin: '8px 0', fontSize: '0.95rem'}}>
              {result.isVariable ? (
                <>Variable N ({result.variableDifficulty})</>
              ) : (
                 <>N = {result.n}</>
              )}
               {' '}| {result.interval}s 
            </div>
            {result.score !== undefined && (
               <div style={{display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff7ed', color: '#ea580c', padding: '6px 12px', borderRadius: 20, fontWeight: 700, fontSize: '1.1rem', marginTop: 8}}>
                 <Trophy size={18} /> {formatScore(result.score)}
               </div>
            )}
          </div>

          <div className="summary-grid">
            <div className="summary-item">
               <StatsTable visual={result.visualScore} audio={result.audioScore} />
            </div>
            
            {result.pillUsed && (
                <div className="summary-item" style={{background: '#f5f3ff', borderColor: '#ddd6fe'}}>
                    <div style={{fontWeight: 700, color: '#7c3aed', marginBottom: 4}}>丹药消耗</div>
                    <div style={{fontSize: '0.9rem'}}>{getPillName(result.pillUsed)}</div>
                    <div style={{fontSize: '0.8rem', color: '#5b21b6', marginTop: 4}}>{result.pillEffectLog}</div>
                </div>
            )}

            {result.pillAcquired && result.pillAcquired.length > 0 && (
                <div className="summary-item" style={{background: '#ecfdf5', borderColor: '#a7f3d0'}}>
                    <div style={{fontWeight: 700, color: '#059669', marginBottom: 4}}>获得物品</div>
                    {result.pillAcquired.map(p => (
                        <div key={p.id} style={{fontSize: '0.9rem', marginBottom: 2}}>{getPillName(p)}</div>
                    ))}
                </div>
            )}
          </div>

          <button className="btn btn-primary" style={{width: '100%', marginTop: 24, justifyContent: 'center', padding: 12}} onClick={() => setShowSummary(false)}>
            完成
          </button>
        </div>
      </div>
    );
  };

  const getBtnClassName = (feedback: 'correct' | 'wrong' | null, pressed: boolean) => {
    let classes = 'match-btn';
    if (showFeedback && feedback) {
      classes += ` ${feedback}`;
    } else if (pressed && showInputConfirmation) {
      classes += ' pressed';
    }
    return classes;
  };
  
  // Sorted Inventory for Display (with Grouping)
// Sorted Inventory for Display (with Grouping)
  const groupedInventory = useMemo(() => {
      const groups = new Map<string, StackedPill>();
      
      inventory.forEach(p => {
          // 修复：确保 subRealm 即使是 0 也被正确处理，undefined/null 转为特定字符串
          const srKey = (p.subRealm !== undefined && p.subRealm !== null) ? p.subRealm : 'none';
          const key = `${p.type}-${p.realm}-${srKey}-${p.grade}`;
          
          if (!groups.has(key)) {
              groups.set(key, { ...p, count: 0, ids: [] });
          }
          
          const g = groups.get(key)!;
          g.count++;
          g.ids.push(p.id);
      });
      
      const stackList = Array.from(groups.values());
      
      // 排序逻辑保持不变
      return stackList.sort((a, b) => {
          if (b.realm !== a.realm) return b.realm - a.realm;
          
          const subA = a.subRealm ?? -1;
          const subB = b.subRealm ?? -1;
          if (subB !== subA) return subB - subA;
          
          const getGradeVal = (g: PillGrade, type: PillType) => {
              if (type === 'focus') {
                   if (g === 'high') return 3;
                   if (g === 'mid') return 2;
                   return 1;
              }
              if (type === 'foundation') {
                  return g === 'real' ? 2 : 1; // 实品 > 虚品
              }
              const map: Record<string, number> = { low: 1, mid: 2, high: 3, peak: 4, human: 5, earth: 6, heaven: 7 };
              return map[g] || 0;
          };
          
          return getGradeVal(b.grade, b.type) - getGradeVal(a.grade, a.type);
      });
  }, [inventory]);

  const getPillTagClass = (type: PillType) => {
      if (type === 'spirit') return 'tag-spirit';
      if (type === 'focus') return 'tag-focus';
      if (type === 'foundation') return 'tag-foundation';
      return 'tag-heavenly';
  };

  // Helper to preview pill effect
const getPillEffectPreview = (pill: Pill) => {
      if (!pill) return '';
      
      const userRealm = cultivation.realmLevel;
      const userStage = cultivation.stage;
      
      if (pill.type === 'spirit') {
          if ([0, 2, 4, 6].includes(userStage)) {
             const C_VALUES = [1, 2, 4, 6, 8];
             const C = C_VALUES[pill.subRealm ?? 0] || 1;
             
             let capBase = 0;
             if (pill.grade === 'low') capBase = 0.5;
             else if (pill.grade === 'mid') capBase = 1.0;
             else if (pill.grade === 'high') capBase = 2.0;
             else if (pill.grade === 'peak') capBase = 4.0;
             
             const cap = C * capBase * Math.pow(10, pill.realm);
             return `✅ 生效：本次训练经验加倍 (额外上限 ${formatScore(cap)})。`;
          }
          return "❌ 无效：当前不处于修为积累期。";
      }
      
      if (pill.type === 'focus') {
          if (![1, 3, 5].includes(userStage)) return "❌ 无效：当前不处于小境界瓶颈期。";
          
          const userSubIdx = Math.floor((userStage - 1) / 2);
          const userLinear = userRealm * 3 + userSubIdx;
          const pillSubIdx = pill.subRealm ?? 0;
          const pillLinear = pill.realm * 3 + pillSubIdx;
          const diff = pillLinear - userLinear;
          
          let baseGradeVal = 0;
          if (pill.grade === 'mid') baseGradeVal = 1;
          if (pill.grade === 'high') baseGradeVal = 2;
          
          let resultGradeVal = baseGradeVal + diff;
          let displayStatus = "";
          
          if (diff > 0) displayStatus = `✨ 药效提升 (+${diff}阶)`;
          else if (diff < 0) displayStatus = `⚠️ 药效衰减 (${diff}阶)`;
          else displayStatus = "✅ 标准药效";
          
          if (resultGradeVal < 0) return `❌ 无效：${displayStatus}，药力已散。`;
          
          resultGradeVal = Math.min(2, resultGradeVal);
          const finalRate = resultGradeVal === 2 ? 100 : resultGradeVal === 1 ? 85 : 75;
          const finalGradeStr = resultGradeVal === 2 ? '优品' : resultGradeVal === 1 ? '良品' : '次品';
          
          return `${displayStatus}：效果相当于${finalGradeStr}，转化率提升至 ${finalRate}%。`;
      }
      
      if (pill.type === 'foundation') {
          if (![1, 3, 5].includes(userStage)) return "❌ 无效：当前不处于瓶颈期。";
          const userSub = Math.floor((userStage - 1)/2);
          
          // 线性数值比较 (大境界*10 + 小境界) 简单粗暴
          const userVal = userRealm * 10 + userSub;
          const pillVal = pill.realm * 10 + (pill.subRealm ?? 0);

          if (pillVal > userVal) {
              return `✨ 完美药效：丹药阶位高于自身，虚品亦化为实品，完全锁定分数。`;
          } else if (pillVal === userVal) {
              if (pill.grade === 'real') return "✅ 生效：实品护基，完全锁定分数不倒退。";
              else return "✅ 生效：虚品护基，取 (原分+新分)/2 减缓倒退。";
          }
          
          return "❌ 无效：丹药境界/阶位不足。";
      }
      
      if (pill.type === 'heavenly') {
           if (userStage === 6 || userStage === 7) {
               if (pill.realm >= userRealm) {
                   return "✅ 生效：降低渡劫准确率要求。";
               }
               return "❌ 无效：丹药境界过低 (必须高于当前大境界)。";
           }
           return "❌ 无效：未至渡劫之时。";
      }
      return "";
  };

  const selectedPillObj = inventory.find(p => p.id === selectedPillId);
  // --- 插入计算进度的逻辑 ---
  
  // Calculate filtered history for display and chart
  const filteredHistory = useMemo(() => {
     let data = history;
     if (searchType === 'fixed') data = data.filter(h => !h.isVariable);
     else if (searchType === 'variable') data = data.filter(h => h.isVariable);
     const targetN = parseFloat(searchN);
     if (!isNaN(targetN) && searchN !== '') {
         data = data.filter(h => {
             if (h.isVariable) return Math.abs((h.variableDifficulty || 0) - targetN) < 0.05;
             return h.n === targetN;
         });
     }
     return data;
  }, [history, searchN, searchType]);

  const groupedHistory = useMemo(() => {
    const groups: Record<string, GameResult[]> = {};
    filteredHistory.forEach(h => {
        const d = new Date(h.timestamp).toLocaleDateString('zh-CN');
        if (!groups[d]) groups[d] = [];
        groups[d].push(h);
    });
    return groups;
  }, [filteredHistory]);

  const toggleDay = (dateStr: string) => {
      setExpandedDays(prev => ({ ...prev, [dateStr]: !prev[dateStr] }));
  };
  
  const statsData = useMemo(() => {
      const targetN = parseFloat(searchN);
      if (isNaN(targetN) || searchN === '') return null;
      const dayMap = new Map();
      for (const r of filteredHistory) {
          const d = new Date(r.timestamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
           if (!dayMap.has(d)) dayMap.set(d, { totalAcc: 0, count: 0 });
          const entry = dayMap.get(d);
          entry.totalAcc += r.accuracy;
          entry.count += 1;
      }
      const list: { day: string, avgAcc: number }[] = [];
      dayMap.forEach((val, key) => {
          list.push({
              day: key,
              avgAcc: parseFloat((val.totalAcc / val.count).toFixed(1))
          });
      });
      return list.reverse(); 
  }, [filteredHistory, searchN]);

  let progressPercent = 0;
  let progressText = '';
  let bottleneckContent = null;
  
  if (cultivation.realmLevel >= 10) {
      progressPercent = 100;
      progressText = "渡劫飞升";
  } else if (isGreatPerfect) { // 这个变量已经在最上面定义了，可以直接用
      progressPercent = 100;
      progressText = "大圆满 (待渡劫)";
      bottleneckContent = (
         <div className="bottleneck-info">
           <div style={{fontWeight: 600, marginBottom: 4, color: '#b45309'}}>渡劫条件</div>
           <div>1. 难度 N ≥ {cultivation.realmLevel + 1}</div>
           <div>2. 准确率 ≥ 80%</div>
           <div style={{fontSize: '0.8rem', marginTop: 6, color: '#64748b'}}>* 成功可继承50%当前经验</div>
         </div>
      );
  } else if (!isBottleneck) { // 这个变量也已经定义了
      // 积累期 (0, 2, 4, 6)
      const maxXP = getMaxXP(cultivation.realmLevel, cultivation.stage);
      // 防止除以0
      const safeMax = maxXP > 0 ? maxXP : 100; 
      progressPercent = Math.min(100, (cultivation.currentXP / safeMax) * 100);
      progressText = `修为: ${formatScore(cultivation.currentXP)} / ${formatScore(maxXP)}`;
      
      if (cultivation.stage === 6) {
          // 圆满期提示
          bottleneckContent = (
             <div className="bottleneck-info">
               <div style={{fontWeight: 600, marginBottom: 4, color: '#0369a1'}}>圆满之境</div>
               <div style={{fontSize: '0.8rem', color: '#475569', marginBottom: 4}}>
                   可继续积累至大圆满，或直接尝试渡劫。
               </div>
               <div style={{fontSize: '0.8rem', color: '#64748b'}}>
                   渡劫要求: N ≥ {cultivation.realmLevel + 1}, 准确率 ≥ 80%
               </div>
             </div>
          );
      }
  } else {
      // 瓶颈期 (1, 3, 5)
      const weightedScore = cultivation.currentXP;
      const target = getBreakthroughTarget(cultivation.realmLevel, cultivation.stage);
      const safeTarget = target > 0 ? target : 100;
      progressPercent = Math.min(100, (weightedScore / safeTarget) * 100);
      progressText = `冲关进度: ${formatScore(weightedScore)} / ${formatScore(target)}`;
      
      bottleneckContent = (
         <div className="bottleneck-info">
           <div style={{fontWeight: 600, marginBottom: 4, color: '#0369a1'}}>瓶颈突破</div>
           <div style={{fontSize: '0.8rem', color: '#475569', marginBottom: 8}}>
              当前积累: <span style={{fontWeight: 700}}>{formatScore(weightedScore)}</span> / {formatScore(target)}
           </div>
           <div style={{fontSize: '0.75rem', color: '#94a3b8'}}>
              * 规则: 每次得分累计 (旧分×⅔ + 新分)
           </div>
         </div>
      );
  }
  return (
    <div className={`app-container ${isPlaying ? 'game-playing' : ''}`}>
      <style>{styles}</style>
      
      {/* Header - Hidden during play */}
      {!isPlaying && (
        <header className="header">
          <div>
             <h1 style={{margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a'}}>Dual N-Back</h1>
          </div>
          <div style={{display: 'flex', gap: 8}}>
            <button className="btn btn-secondary" onClick={() => setShowGacha(true)} style={{padding: '6px 10px', fontSize: '0.9rem', color: '#7c3aed'}}>
                <Gift size={16} /> 坊市
                {gachaState.availableDraws > 0 && <span style={{background: '#ef4444', color: 'white', borderRadius: '50%', width: 14, height: 14, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', top: -4, right: -4}}>{gachaState.availableDraws}</span>}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowMilestones(true)} style={{padding: '6px 10px', fontSize: '0.9rem'}}>
              <Scroll size={16} /> 仙途
            </button>
            <button className="btn btn-secondary" onClick={() => setShowHistory(true)} style={{padding: '6px 10px', fontSize: '0.9rem'}}>
              <History size={16} /> 记录
            </button>
          </div>
        </header>
      )}

      {/* Cultivation Panel - Hidden during play */}
      {!isPlaying && (
        <div className="cultivation-card">
          <div className="realm-title">
            <span>{realmName} <span style={{fontSize: '1rem', fontWeight: 600, color: '#0369a1'}}>{stageName}</span></span>
            <span style={{fontSize: '0.9rem', color: '#0ea5e9', display: 'flex', alignItems: 'center', gap: 4}}>
               {isBottleneck || isGreatPerfect ? <Lock size={16} /> : <Zap size={16} fill="currentColor" />} {isGreatPerfect ? '大圆满' : isBottleneck ? '瓶颈' : '修炼中'}
            </span>
          </div>
          <div className="cultivation-stats">
            <span style={{display: 'flex', alignItems: 'center', gap: 4}}>
              <Clock size={14} /> 累计: {formatDuration(cultivation.totalStudyTime)}
            </span>
            <span style={{display: 'flex', alignItems: 'center', gap: 4, color: '#64748b'}}>
               (本阶: {formatDuration(cultivation.stageStudyTime)})
            </span>
            <span style={{display: 'flex', alignItems: 'center', gap: 4}}>
               <Activity size={14} /> 累计练习: {cultivation.totalSessions || 0}次
            </span>
            <span style={{display: 'flex', alignItems: 'center', gap: 4, color: '#64748b'}}>
               (本阶: {cultivation.stageSessions || 0}次)
            </span>
          </div>
          <div className="xp-bar-container">
            <div className="xp-bar-fill" style={{width: `${progressPercent}%`, background: isBottleneck ? '#f59e0b' : 'linear-gradient(90deg, #3b82f6, #06b6d4)'}} />
          </div>
          <div className="xp-text">
            {progressText}
          </div>
          
          {bottleneckContent}
        </div>
      )}

      <div className="game-area">
        {/* Pill Selection (Before Game) - Hidden during play */}
        {!isPlaying && (
            <>
                <div className="pill-select-trigger" onClick={() => setShowInventory(true)} style={{width: 'min(92vmin, 500px)'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                        <Briefcase size={18} color="#64748b" />
                        {selectedPillObj ? (
                            <span style={{fontWeight: 600, color: '#4f46e5'}}>{getPillName(selectedPillObj)}</span>
                        ) : (
                            <span style={{color: '#94a3b8'}}>未选择丹药 (点击选择)</span>
                        )}
                    </div>
                    {selectedPillObj && <ChevronDown size={16} color="#94a3b8" />}
                </div>
                {selectedPillObj && (
                    <div className="pill-effect-preview">
                        <div style={{display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontWeight: 600}}>
                           <Info size={14} /> 预计效果
                        </div>
                        <div>{getPillEffectPreview(selectedPillObj)}</div>
                    </div>
                )}
            </>
        )}

        {isPlaying && (
            <div className="game-config-display">
                <span style={{display: 'flex', alignItems: 'center', gap: 4}}>
                    N={n} {isVariable ? `(Var ${calculateVariableDifficulty()})` : ''} 
                    {pacingMode === 'self-paced' && <span style={{fontSize: '0.75rem', background: '#e0f2fe', color: '#0284c7', padding: '1px 4px', borderRadius: 4}}>手动</span>}
                </span>
                <span style={{display: 'flex', alignItems: 'center', gap: 4}}>
                    {pacingMode === 'dynamic' ? (
                        <>
                           <Gauge size={14} /> 
                           {showRealtimeInterval ? dynamicInterval : interval}s {showRealtimeInterval ? `(基准${interval}s)` : '(动态)'}
                        </>
                    ) : (
                        <>{interval}s</>
                    )}
                </span>
                <span>
                   {showRoundCounter ? `Trials: ${currentIndex + 1}/${totalGameTrials}` : `Total: ${totalGameTrials}`}
                </span>
            </div>
        )}
        
        {/* Progress Info */}
        {(showProgressBar || showRoundCounter) && (
          <div className="progress-info" style={{ justifyContent: showProgressBar ? 'space-between' : 'flex-end' }}>
            {showProgressBar && (
              <div className="progress-bar-bg">
                 <div className="progress-bar-fill" style={{width: isPlaying ? `${((currentIndex + 1) / sequence.length) * 100}%` : '0%'}} />
              </div>
            )}
            {showRoundCounter && (
              <span style={{minWidth: '70px', textAlign: 'right'}}>
                 {isPlaying && pacingMode === 'self-paced' ? <span style={{color: '#f59e0b', fontWeight: 700}}>空格继续</span> : null}
              </span>
            )}
          </div>
        )}

        {/* The Grid */}
        <div className="grid-board">
          {Array.from({ length: GRID_SIZE }).map((_, i) => (
            <div key={i} className="grid-cell">
               {/* Disabled Cross for center (index 4) if NOT Variable and NOT UseCenter */}
               {i === 4 && (!useCenter && !isVariable) && <div className="disabled-cross" />}
               
               {activePos === i && <div className="active-block" />}
               
               {/* Show number in center (index 4) if Variable */}
               {i === 4 && isVariable && currentNumberDisplay !== null && (
                 <div className="center-number">{currentNumberDisplay}</div>
               )}
            </div>
          ))}
        </div>

        {/* Control Panel */}
        <div className="control-panel">
          <div 
            className={getBtnClassName(visualFeedback, visualPressed)}
            onClick={() => handleInput('visual')}
          >
            <Square size={24} color={(showFeedback && visualFeedback === 'correct') ? '#22c55e' : (showFeedback && visualFeedback === 'wrong') ? '#ef4444' : '#64748b'} />
            <span style={{marginTop: 8, fontWeight: 700, fontSize: '0.9rem'}}>位置</span>
            <span style={{fontSize: '0.7rem', color: '#94a3b8'}}>Key: A</span>
          </div>

          <div className="play-btn-wrapper">
             {!isPlaying ? (
               <button className="btn btn-primary" style={{width: 64, height: 64, borderRadius: '50%', padding: 0, justifyContent: 'center', boxShadow: '0 4px 10px rgba(59, 130, 246, 0.3)'}} onClick={startGame}>
                 <Play size={28} fill="white" style={{marginLeft: 4}} />
               </button>
             ) : (
               <button className="btn btn-danger" style={{width: 56, height: 56, borderRadius: '50%', padding: 0, justifyContent: 'center'}} onClick={stopGame}>
                 <X size={24} />
               </button>
             )}
          </div>

          <div 
            className={getBtnClassName(audioFeedback, audioPressed)}
            onClick={() => handleInput('audio')}
          >
            <Volume2 size={24} color={(showFeedback && audioFeedback === 'correct') ? '#22c55e' : (showFeedback && audioFeedback === 'wrong') ? '#ef4444' : '#64748b'} />
            <span style={{marginTop: 8, fontWeight: 700, fontSize: '0.9rem'}}>声音</span>
            <span style={{fontSize: '0.7rem', color: '#94a3b8'}}>Key: L</span>
          </div>
        </div>

        {/* Manual Next Button */}
        {isPlaying && pacingMode === 'self-paced' && (
           <div style={{marginTop: 20, width: '100%', display: 'flex', justifyContent: 'center'}}>
               <button 
                 className="btn btn-secondary" 
                 style={{
                    width: 'min(92vmin, 350px)', 
                    padding: '14px', 
                    justifyContent: 'center', 
                    fontSize: '1rem',
                    border: '2px solid #cbd5e1',
                    background: '#fff',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.05)'
                 }}
                 onClick={() => finishTrialAndNext(currentIndex, sequence)}
               >
                 <Hand size={20} /> 下一轮 (空格)
               </button>
           </div>
        )}

        {/* Settings - Hidden during play */}
        {!isPlaying && (
          <div className="settings-container">
            <h3 style={{margin: '0 0 16px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8}}>
              <Settings size={20} /> 设置
            </h3>

            {/* Data Management */}
             <div className="setting-section">
               <div style={{display: 'flex', gap: 10, marginBottom: 12}}>
                 <button className="btn btn-secondary" style={{flex: 1, fontSize: '0.85rem', justifyContent: 'center'}} onClick={handleExportData}>
                   <Download size={16} /> 导出存档
                 </button>
                 <button className="btn btn-secondary" style={{flex: 1, fontSize: '0.85rem', justifyContent: 'center'}} onClick={() => fileInputRef.current?.click()}>
                   <Upload size={16} /> 导入存档
                 </button>
                 <input type="file" ref={fileInputRef} onChange={handleImportData} style={{display: 'none'}} accept=".json" />
               </div>
            </div>
            
            <div className="setting-section">
              <div className="setting-row">
                <span style={{fontSize: '0.9rem', fontWeight: 600}}>实时对错反馈</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={showFeedback} onChange={e => setShowFeedback(e.target.checked)} />
                  <span className="slider"></span>
                </label>
              </div>
              
              <div className="setting-row">
                <span style={{fontSize: '0.9rem', fontWeight: 600}}>按键确认反馈</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={showInputConfirmation} onChange={e => setShowInputConfirmation(e.target.checked)} />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="setting-row">
                <span style={{fontSize: '0.9rem', fontWeight: 600}}>显示进度条</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={showProgressBar} onChange={e => setShowProgressBar(e.target.checked)} />
                  <span className="slider"></span>
                </label>
              </div>
              
              <div className="setting-row">
                <span style={{fontSize: '0.9rem', fontWeight: 600}}>显示剩余轮数</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={showRoundCounter} onChange={e => setShowRoundCounter(e.target.checked)} />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="setting-row">
                <span style={{fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6}}>
                  {volume === 0 ? <VolumeX size={18} /> : volume < 0.5 ? <Volume1 size={18} /> : <VolumeIcon size={18} />} 音量
                </span>
                <div className="volume-slider-container">
                   <input 
                     type="range" 
                     min="0" 
                     max="1" 
                     step="0.05" 
                     value={volume} 
                     onChange={(e) => setVolume(parseFloat(e.target.value))}
                     className="volume-slider"
                   />
                </div>
              </div>
            </div>
            
            <div className="setting-section">
               <div className="setting-row" style={{marginBottom: 8}}>
                  <span style={{fontSize: '0.9rem', fontWeight: 600}}>训练轮数 (Trials)</span>
               </div>
               <div className="round-mode-selector">
                  <button 
                    className={`round-mode-btn ${roundMode === 'standard' ? 'active' : ''}`}
                    onClick={() => setRoundMode('standard')}
                  >
                    20 + N²
                  </button>
                  <button 
                    className={`round-mode-btn ${roundMode === 'linear' ? 'active' : ''}`}
                    onClick={() => setRoundMode('linear')}
                  >
                    20 + 4N
                  </button>
                  <button 
                    className={`round-mode-btn ${roundMode === 'custom' ? 'active' : ''}`}
                    onClick={() => setRoundMode('custom')}
                  >
                    自定义
                  </button>
               </div>
               {roundMode === 'custom' && (
                  <div style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10}}>
                      <span style={{fontSize: '0.85rem', color: '#64748b'}}>设置次数:</span>
                      <div className="input-control">
                          <input 
                              type="number"
                              className="val-input"
                              value={customRoundCount}
                              onChange={e => {
                                  const v = parseInt(e.target.value);
                                  if (!isNaN(v)) setCustomRoundCount(v);
                              }}
                              onBlur={e => {
                                 const v = parseInt(e.target.value);
                                 if (isNaN(v) || v < 1) setCustomRoundCount(1);
                              }}
                          />
                      </div>
                  </div>
               )}
            </div>

            <div className="setting-section">
               <div className="setting-row" style={{marginBottom: 8}}>
                  <span style={{fontSize: '0.9rem', fontWeight: 600}}>游戏模式</span>
               </div>
               <div className="round-mode-selector">
                  <button 
                    className={`round-mode-btn ${pacingMode === 'standard' ? 'active' : ''}`}
                    onClick={() => setPacingMode('standard')}
                  >
                    标准
                  </button>
                  <button 
                    className={`round-mode-btn ${pacingMode === 'dynamic' ? 'active' : ''}`}
                    onClick={() => setPacingMode('dynamic')}
                  >
                    动态间隔
                  </button>
                  <button 
                    className={`round-mode-btn ${pacingMode === 'self-paced' ? 'active' : ''}`}
                    onClick={() => setPacingMode('self-paced')}
                  >
                    手动 (空格)
                  </button>
               </div>
            </div>

            <div className="setting-section">
              <div className="setting-row">
                <span style={{fontSize: '0.9rem', fontWeight: 600}}>难度 (N)</span>
                <div className="input-control">
                  <button className="btn btn-secondary" style={{padding: '6px 10px'}} onClick={() => setN(Math.max(1, n - 1))}>-</button>
                  <span className="val-display">{n}</span>
                  <button className="btn btn-secondary" style={{padding: '6px 10px'}} onClick={() => setN(n + 1)}>+</button>
                </div>
              </div>
              <div className="setting-row">
                <span style={{fontSize: '0.9rem', fontWeight: 600}}>间隔 (秒)</span>
                <div className="input-control">
                  <button className="btn btn-secondary" style={{padding: '6px 10px'}} 
                          onClick={() => setInterval(prev => Math.max(1.0, parseFloat((prev - 0.1).toFixed(1))))}>-</button>
                  <input 
                      type="number"
                      className="val-input"
                      value={interval}
                      onChange={e => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v >= 0.1) setInterval(v);
                      }}
                      step="0.1"
                  />
                  <button className="btn btn-secondary" style={{padding: '6px 10px'}} 
                          onClick={() => setInterval(prev => parseFloat((prev + 0.1).toFixed(1)))}>+</button>
                </div>
              </div>
              {pacingMode === 'dynamic' && (
                <div className="setting-row">
                    <span style={{fontSize: '0.9rem', fontWeight: 600}}>显示实时时间</span>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={showRealtimeInterval} onChange={e => setShowRealtimeInterval(e.target.checked)} />
                      <span className="slider"></span>
                    </label>
                </div>
              )}
              <div className="setting-row">
                <span style={{fontSize: '0.9rem', fontWeight: 600}}>显示时间 (秒)</span>
                <div className="input-control">
                  <button className="btn btn-secondary" style={{padding: '6px 10px'}} 
                          onClick={() => setDisplayTime(prev => Math.max(0.1, parseFloat((prev - 0.1).toFixed(1))))}>-</button>
                  <input 
                      type="number"
                      className="val-input"
                      value={displayTime}
                      onChange={e => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v >= 0.1) setDisplayTime(v);
                      }}
                      step="0.1"
                  />
                  <button className="btn btn-secondary" style={{padding: '6px 10px'}} 
                          onClick={() => setDisplayTime(prev => parseFloat((prev + 0.1).toFixed(1)))}>+</button>
                </div>
              </div>
            </div>

            <div className="setting-section">
              <div className="setting-row">
                <span style={{fontSize: '0.9rem', fontWeight: 600}}>启用中间格</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={useCenter} onChange={e => setUseCenter(e.target.checked)} disabled={isVariable} />
                  <span className="slider"></span>
                </label>
              </div>
              {isVariable && <div style={{fontSize: '0.75rem', color: '#f59e0b', marginTop: -8, marginBottom: 8}}>* Variable 模式强制禁用中间格 (用于显示数字)</div>}

              <div className="setting-row">
                <span style={{fontSize: '0.9rem', fontWeight: 600}}>Variable 模式</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={isVariable} onChange={e => setIsVariable(e.target.checked)} />
                  <span className="slider"></span>
                </label>
              </div>

              {isVariable && (
                <div style={{marginTop: 10, background: '#f8fafc', padding: 10, borderRadius: 8}}>
                  <div style={{fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 6}}>数字出现概率权重 (1 - {n})</div>
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
                    {variableWeights.map((w, i) => (
                      <div key={i} style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                         <label style={{fontSize: '0.7rem', color: '#94a3b8'}}>{i + 1}</label>
                         <input 
                           className="prob-input"
                           type="number" 
                           value={w} 
                           onChange={e => handleWeightChange(i, e.target.value)}
                         />
                      </div>
                    ))}
                  </div>
                  <div style={{fontSize: '0.7rem', color: '#94a3b8', marginTop: 6}}>当前平均难度: {calculateVariableDifficulty()}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showSummary && lastResult && renderSummary(lastResult)}
      
      {/* Inventory Modal */}
      {showInventory && (
        <div className="modal-overlay" onClick={() => setShowInventory(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                    <h2 style={{margin: 0, fontSize: '1.25rem'}}>储物袋</h2>
                    <button style={{background: 'none', border: 'none', color: '#64748b', cursor: 'pointer'}} onClick={() => setShowInventory(false)}>
                        <X />
                    </button>
                </div>
                
                {groupedInventory.length === 0 ? (
                    <div style={{textAlign: 'center', padding: '40px 0', color: '#94a3b8'}}>
                        <Briefcase size={40} style={{marginBottom: 10, opacity: 0.5}} />
                        <p>空空如也</p>
                    </div>
                ) : (
                    <div>
                        <div style={{fontSize: '0.85rem', color: '#64748b', marginBottom: 12}}>点击选择本轮使用的丹药：</div>
                        {groupedInventory.map(stack => {
                            // Check if the currently selected pill is within this stack's IDs
                            const isSelected = selectedPillId !== null && stack.ids.includes(selectedPillId);
                            
                            return (
                                <div 
                                    key={`${stack.type}-${stack.realm}-${stack.subRealm ?? 'x'}-${stack.grade}`}
                                    className={`pill-item ${isSelected ? 'selected' : ''}`}
                                    onClick={() => {
                                        // Toggle selection: Select first ID in stack OR Deselect
                                        setSelectedPillId(isSelected ? null : stack.ids[0]);
                                    }}
                                >
                                    {stack.count > 1 && (
                                        <div className="pill-count-badge">x{stack.count}</div>
                                    )}
                                    
                                    <div>
                                        <div style={{fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center'}}>
                                            {getPillName(stack)}
                                            <span className={`pill-tag ${getPillTagClass(stack.type)}`}>
                                                {stack.type === 'spirit' ? '经验' : stack.type === 'focus' ? '冲关' : stack.type === 'foundation' ? '护基' : '渡劫'}
                                            </span>
                                        </div>
                                        <div style={{fontSize: '0.8rem', color: '#64748b', marginTop: 4}}>
                                            {getPillDescription(stack)}
                                        </div>
                                    </div>
                                    {isSelected && <div style={{color: '#3b82f6'}}><ArrowUpCircle size={24} /></div>}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
      )}
      
      {/* Gacha Modal */}
      {showGacha && (
          <div className="modal-overlay" onClick={() => setShowGacha(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                    <h2 style={{margin: 0, fontSize: '1.25rem'}}>坊市抽奖</h2>
                    <button style={{background: 'none', border: 'none', color: '#64748b', cursor: 'pointer'}} onClick={() => setShowGacha(false)}>
                        <X />
                    </button>
                </div>
                
                <div style={{textAlign: 'center', padding: '20px 0'}}>
                    <Gift size={64} color="#7c3aed" style={{marginBottom: 20}} />
                    <div style={{fontSize: '1rem', fontWeight: 600, marginBottom: 8}}>
                        当前抽奖机会: <span style={{color: '#7c3aed', fontSize: '1.2rem'}}>{gachaState.availableDraws}</span> 次
                    </div>
                    <div style={{fontSize: '0.85rem', color: '#64748b', marginBottom: 24}}>
                        每专注修炼 10 分钟获得一次机会。<br/>
                        当前累计: {(gachaState.accumulatedTime / 60).toFixed(1)} / 10.0 分钟
                    </div>
                    
                    <button 
                        className="btn btn-primary" 
                        style={{width: '80%', margin: '0 auto', justifyContent: 'center', padding: 14, background: gachaState.availableDraws > 0 ? '#7c3aed' : '#cbd5e1', cursor: gachaState.availableDraws > 0 ? 'pointer' : 'not-allowed'}}
                        onClick={handleGachaDraw}
                        disabled={gachaState.availableDraws <= 0}
                    >
                        {gachaState.availableDraws > 0 ? '抽取灵元丹' : '机会不足'}
                    </button>
                    
                    {lastGachaResult && (
                        <div style={{marginTop: 20, animation: 'fadeIn 0.5s'}}>
                            <div style={{fontSize: '0.9rem', color: '#059669', fontWeight: 600}}>恭喜获得：</div>
                            <div style={{marginTop: 8, padding: 10, border: '1px solid #10b981', background: '#ecfdf5', borderRadius: 8, display: 'inline-block'}}>
                                {getPillName(lastGachaResult)}
                            </div>
                        </div>
                    )}
                    
                    <div style={{marginTop: 20, textAlign: 'left', background: '#f9fafb', padding: 12, borderRadius: 8, fontSize: '0.8rem', color: '#4b5563'}}>
                        <div style={{fontWeight: 700, marginBottom: 4}}>概率公示:</div>
                        <div>• 下品灵元丹 (60%)</div>
                        <div>• 中品灵元丹 (30%)</div>
                        <div>• 上品灵元丹 (8%)</div>
                        <div>• 极品灵元丹 (2%)</div>
                        <div style={{marginTop: 4, color: '#9ca3af', fontSize: '0.75rem'}}>*丹药境界取决于当前修为</div>
                    </div>
                </div>
              </div>
          </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
              <h2 style={{margin: 0, fontSize: '1.25rem'}}>记录</h2>
              <button style={{background: 'none', border: 'none', color: '#64748b', cursor: 'pointer'}} onClick={() => setShowHistory(false)}>
                <X />
              </button>
            </div>
            
            {/* Search / Analysis Filter */}
            <div style={{marginBottom: 16, background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8}}>
                    <Search size={16} color="#64748b" />
                    <span style={{fontSize: '0.9rem', fontWeight: 600, color: '#475569'}}>筛选分析</span>
                </div>
                
                <div style={{display: 'flex', gap: 8, marginBottom: 8}}>
                    <button 
                        onClick={() => setSearchType('all')}
                        style={{
                            padding: '4px 12px', 
                            borderRadius: 6, 
                            border: `1px solid ${searchType === 'all' ? '#3b82f6' : '#e2e8f0'}`,
                            background: searchType === 'all' ? '#eff6ff' : '#fff',
                            color: searchType === 'all' ? '#2563eb' : '#64748b',
                            fontSize: '0.8rem',
                            fontWeight: searchType === 'all' ? 600 : 400,
                            cursor: 'pointer'
                        }}
                    >
                        全部
                    </button>
                    <button 
                        onClick={() => setSearchType('fixed')}
                        style={{
                            padding: '4px 12px', 
                            borderRadius: 6, 
                            border: `1px solid ${searchType === 'fixed' ? '#3b82f6' : '#e2e8f0'}`,
                            background: searchType === 'fixed' ? '#eff6ff' : '#fff',
                            color: searchType === 'fixed' ? '#2563eb' : '#64748b',
                            fontSize: '0.8rem',
                            fontWeight: searchType === 'fixed' ? 600 : 400,
                            cursor: 'pointer'
                        }}
                    >
                        固定N
                    </button>
                    <button 
                        onClick={() => setSearchType('variable')}
                        style={{
                            padding: '4px 12px', 
                            borderRadius: 6, 
                            border: `1px solid ${searchType === 'variable' ? '#3b82f6' : '#e2e8f0'}`,
                            background: searchType === 'variable' ? '#eff6ff' : '#fff',
                            color: searchType === 'variable' ? '#2563eb' : '#64748b',
                            fontSize: '0.8rem',
                            fontWeight: searchType === 'variable' ? 600 : 400,
                            cursor: 'pointer'
                        }}
                    >
                        可变N
                    </button>
                </div>

                <div style={{display: 'flex', gap: 10}}>
                    <input 
                       type="number" 
                       step="0.1"
                       placeholder={searchType === 'variable' ? "输入难度 (如 2.5)" : "输入N (如 2)"}
                       value={searchN}
                       onChange={e => setSearchN(e.target.value)}
                       style={{padding: '8px', borderRadius: 8, border: '1px solid #cbd5e1', width: '100%', fontSize: '0.9rem'}}
                    />
                </div>
            </div>

            {/* Analysis Area: Chart + List */}
            {statsData && statsData.length > 0 && (
                <div style={{marginBottom: 20}}>
                    <div style={{fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6}}>
                         <Activity size={16} /> 准确率趋势 (N={searchN})
                    </div>
                    
                    {/* Line Chart */}
                    <LineChart data={statsData} />

                    {/* Data List */}
                    <div style={{background: '#f1f5f9', borderRadius: 8, padding: 8, maxHeight: '120px', overflowY: 'auto'}}>
                        {statsData.map((d, i) => (
                           <div key={i} className="data-list-row">
                               <span>{d.day}</span>
                               <span style={{fontWeight: 700, color: d.avgAcc >= 80 ? '#16a34a' : '#334155'}}>{d.avgAcc}%</span>
                           </div>
                        ))}
                    </div>
                </div>
            )}
            
            {Object.keys(groupedHistory).length === 0 ? (
              <div style={{textAlign: 'center', padding: '30px 0', color: '#94a3b8'}}>
                <AlertCircle size={40} style={{margin: '0 auto 10px', opacity: 0.5}} />
                <p>暂无符合条件的记录</p>
              </div>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 20}}>
                {Object.keys(groupedHistory).sort((a,b) => new Date(b).getTime() - new Date(a).getTime()).map(dateStr => (
                    <HistoryDayGroup 
                        key={dateStr}
                        dateStr={dateStr}
                        records={groupedHistory[dateStr]}
                        onToggle={() => toggleDay(dateStr)}
                        isExpanded={!!expandedDays[dateStr]}
                    />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Milestones Modal */}
      {showMilestones && (
        <div className="modal-overlay" onClick={() => setShowMilestones(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
              <h2 style={{margin: 0, fontSize: '1.25rem'}}>修仙路</h2>
              <button style={{background: 'none', border: 'none', color: '#64748b', cursor: 'pointer'}} onClick={() => setShowMilestones(false)}>
                <X />
              </button>
            </div>
            
            {milestones.length === 0 ? (
              <div style={{textAlign: 'center', padding: '30px 0', color: '#94a3b8'}}>
                <Scroll size={40} style={{margin: '0 auto 10px', opacity: 0.5}} />
                <p>大道漫漫，始于足下</p>
              </div>
            ) : (
              <div>
                {milestones.slice().reverse().map(m => (
                  <div key={m.id} className={`milestone-item ${m.type}`}>
                    <div className="milestone-date">
                       <span>{formatDateTime(m.timestamp)}</span>
                    </div>
                    <div className="milestone-title">{m.title}</div>
                    <div className="milestone-desc">{m.description.replace(/&ge;/g, '≥')}</div>
                    <div className="milestone-meta">
                      {m.stageDuration !== undefined && <span>此阶耗时: {formatDuration(m.stageDuration)}</span>}
                      {m.totalDuration !== undefined && <span>累计修炼: {formatDuration(m.totalDuration)}</span>}
                      {m.stageSessions !== undefined && <span>本阶练习: {m.stageSessions}次</span>}
                      {m.totalSessions !== undefined && <span>累计练习: {m.totalSessions}次</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<Game />);

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
type PlayMode = 'memorize' | 'intuition' | 'technique' | 'score';
const MODE_LABELS: Record<PlayMode, string> = {
    memorize: '强记',
    intuition: '直觉',
    technique: '良性技巧',
    score: '刷分'
};
// 丹药类型
type PillType = 'spirit' | 'focus' | 'foundation' | 'heavenly' | 'preservation';

// 丹药品级
// low/mid/high/peak: 灵元丹
// virtual/real: 凝神丹、护基丹 (虚/实)
// unique/rare/fine/finished/defective: 保元丹 (孤/珍/精/成/次)
// human/earth/heaven: 通天
type PillGrade = 'low' | 'mid' | 'high' | 'peak' 
               | 'human' | 'earth' | 'heaven' 
               | 'virtual' | 'real'
               | 'unique' | 'rare' | 'fine' | 'finished' | 'defective';

// 0:前期, 1:中期, 2:后期 3:圆满 4:大圆满
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
  fires: { spirit: number; focus: number; foundation: number; preservation: number; heavenly: number }; // 各类真火数量
  selectedFireTypes: PillType[]; // 当前勾选的真火偏好
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
  avgInterval?: number; // 实际平均间隔
  sessionDuration?: number; // 总耗时
  totalTrials: number;
  audioScore: ScoreDetail;
  visualScore: ScoreDetail;
  isVariable: boolean;
  variableDifficulty?: number; 
  score?: number; // 最终总分 (原分数+加成)
  baseScore?: number; // 原分数 (无加成)
  bonusScore?: number; // 加成部分
  accuracy: number; // 0-100
  device?: 'mobile' | 'desktop';
  realmLevel?: number; // Snapshot of realm when game started
  stage?: number; // Snapshot of stage when game started
  afterRealmLevel?: number; // Snapshot after game
  beforeXP?: number; // 【新增】游戏前的经验
  afterXP?: number; // 【新增】游戏后的经验
  afterStage?: number; // Snapshot after game
  mode?: string; // 【新增】记录该局属于哪个模式
  pacingMode?: PacingMode;
  
  // 丹药记录
  pillUsed?: Pill;
  pillEffectLog?: string;
  pillAcquired?: Pill[];
  acquireLogs?: string[]; // 记录掉落判定的文字描述
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
// --- 真火凝聚效率计算 ---
function getFireReqTime(selectedCount: number): number {
    if (selectedCount >= 5) return 300; // 5种: 5分钟
    if (selectedCount === 4) return 360; // 4种: 6分钟
    if (selectedCount === 3) return 420; // 3种: 7分钟
    if (selectedCount === 2) return 540; // 2种: 9分钟
    if (selectedCount === 1) return 720; // 1种: 12分钟
    return 300; // 兜底
}
// --- 绝对等级转换 (用于凝神/护基丹) ---
function getPillFromAbsoluteIndex(index: number) {
    // 限制最低为 6 (锻体前期虚品)
    const safeIndex = Math.max(6, index);
    return {
        realm: Math.floor(safeIndex / 6),
        sub: Math.floor((safeIndex % 6) / 2) as SubRealm,
        grade: (safeIndex % 2 === 1) ? 'real' : 'virtual' as PillGrade
    };
}
// 获取用户在功能丹药体系下的绝对等级索引 (只看前中后)
function getUserAbsoluteIndex(realm: number, stage: number) {
    const subIdx = Math.min(2, Math.floor(stage / 2)); // 0,1->前(0); 2,3->中(1); 4+->后(2)
    return realm * 6 + subIdx * 2; // 默认算作虚品
}
// --- 保元丹概率计算 (将炸炉纳入正态分布) ---
function calculatePreservationProbs(variance: number) {
    const sigma = Math.sqrt(variance);
    const p0 = standardNormalCDF(0); // 0.5
    
    // 区间划分: 0.5, 1.2, 1.9, 2.6, 3.3
    const pFail = (standardNormalCDF(0.5 / sigma) - p0) * 2;
    const pDef  = (standardNormalCDF(1.2 / sigma) - standardNormalCDF(0.5 / sigma)) * 2;
    const pFin  = (standardNormalCDF(1.9 / sigma) - standardNormalCDF(1.2 / sigma)) * 2;
    const pFine = (standardNormalCDF(2.6 / sigma) - standardNormalCDF(1.9 / sigma)) * 2;
    const pRare = (standardNormalCDF(3.3 / sigma) - standardNormalCDF(2.6 / sigma)) * 2;
    const pUni  = (1.0 - standardNormalCDF(3.3 / sigma)) * 2;
    
    return { fail: pFail, def: pDef, fin: pFin, fine: pFine, rare: pRare, uni: pUni };
}
// 丹药辅助函数
function getPillName(pill: Pill): string {
  const realmName = REALMS[pill.realm] || '未知';
  let subName = '';
  if (pill.subRealm !== undefined && pill.type !== 'heavenly') {
    const subNames = ['前期', '中期', '后期', '圆满', '大圆满'];
    subName = subNames[pill.subRealm] || '';
  }

  let gradeName = '';
  if (pill.type === 'focus' || pill.type === 'foundation') {
      gradeName = pill.grade === 'real' ? '实品' : '虚品';
  } else if (pill.type === 'preservation') {
      const pGrades: Record<string, string> = { unique: '孤品', rare: '珍品', fine: '精品', finished: '成品', defective: '次品' };
      gradeName = pGrades[pill.grade] || '次品';
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

  // 命名格式修正：
  // 如果有小境界(subName不为空)，则不加"期"，例如 "元婴中期"
  // 如果无小境界，则加"期"，例如 "元婴期"
  const realmPart = subName ? realmName : `${realmName}期`;

  if (pill.type === 'heavenly') {
      return `${realmPart}·${gradeName}通天渡厄丹`;
  } else if (pill.type === 'preservation') {
      return `${REALMS[pill.realm]}期·${gradeName}保元丹`;
  } else {
      const pName = pill.type === 'spirit' ? '灵元丹' : pill.type === 'focus' ? '凝神丹' : '护基丹';
      return `${realmPart}${subName}·${gradeName}${pName}`;
  }
}

function getPillDescription(pill: Pill): string {
  if (pill.type === 'spirit') {
    const C_VALUES = [1, 2, 4, 6, 8];
    const C = C_VALUES[pill.subRealm ?? 0] || 1;
    let mult = 0, capBase = 0;
    if (pill.grade === 'low') { mult=1.5; capBase=0.5; }
    else if (pill.grade === 'mid') { mult=2; capBase=1; }
    else if (pill.grade === 'high') { mult=3; capBase=2; }
    else if (pill.grade === 'peak') { mult=5; capBase=4; }
    return `增加经验获取 ${mult}倍，额外上限 ${C}*${capBase}*10^N。`;
  }
  if (pill.type === 'focus') {
    return `小境界冲关辅助。提升转化率 (72%~100%)。丹药境界需匹配瓶颈。`;
  }
  if (pill.type === 'foundation') {
    return `减缓或阻止冲关失败时的修为倒退。丹药境界需匹配。`;
  }
  if (pill.type === 'preservation') {
      const bases = { unique: 16, rare: 22, fine: 30, finished: 40, defective: 52 };
      const base = bases[pill.grade as keyof typeof bases] || 64;
      return `改变得分算法底数为 ${base} (原64)，降低失误惩罚。仅对低于等于自身大境界(N≤${pill.realm})的难度生效。`;
  }
  if (pill.type === 'heavenly') {
    return `大境界渡劫神物。降低准确率要求。`;
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

// 辅助计算积累期经验常数 (带根号)
function getAccumulationMax(realm: number, subRealm: SubRealm): number {
    const n = Math.max(1, realm); // 防止 realm=0 出错，虽然后面有保护
    const sqrtN = Math.sqrt(n);
    const power = Math.pow(10, n);
    
    let c = 4; // 前期
    if (subRealm === 1) c = 8; // 中期
    if (subRealm === 2) c = 16; // 后期
    
    // 公式: C * sqrt(n) * 10^n
    return Math.round(c * sqrtN * power);
}

// 获取当前阶段的最大经验值 (用于进度条分母)
function getMaxXP(realm: number, stage: number): number {
  if (stage === 0) return getAccumulationMax(realm, 0); // 前期积累
  if (stage === 2) return getAccumulationMax(realm, 1); // 中期积累
  if (stage === 4) return getAccumulationMax(realm, 2); // 后期积累
  if (stage === 6) {
     // 圆满 -> 下一大境界，按下一境界的前期标准算，或者按当前圆满算(C=4*sqrt(next)*10^next)
     // 通常圆满是为了突破大境界，这里沿用下一境界前期标准作为“圆满”的积累量
     const nextRealm = realm + 1;
     return Math.round(4 * Math.sqrt(nextRealm) * Math.pow(10, nextRealm)); 
  }
  return 100;
}

// 获取瓶颈突破目标 (不带根号，严格按 1, 2, 4 倍率)
function getBreakthroughTarget(realm: number, stage: number): number {
  const power = Math.pow(10, realm);
  if (stage === 1) return 1 * power; // 前期巅峰 -> 中期
  if (stage === 3) return 2 * power; // 中期巅峰 -> 后期
  if (stage === 5) return 4 * power; // 后期巅峰 -> 圆满
  return 0;
}

// 辅助函数：用于丹药掉落判定 (复用上述逻辑)
// isReal 参数用于区分实品/虚品丹药倍率
// 辅助函数：用于丹药掉落判定（严格按照瓶颈突破需要作为虚品基准）
function getExpConstant(realm: number, subRealm: SubRealm, isReal: boolean): number {
    const power = Math.pow(10, realm);
    let virtualVal = 0;
    
    // 虚品对应的经验常数
    if (subRealm === 0) virtualVal = 1 * power;      // 前期
    else if (subRealm === 1) virtualVal = 2 * power; // 中期
    else if (subRealm === 2) virtualVal = 4 * power; // 后期
    
    if (!isReal) return virtualVal; // 虚品直接返回
    
    // 实品对应的经验常数（在虚品基础上乘倍率）
    if (subRealm === 0 || subRealm === 1) {
        return Math.round(virtualVal * 1.4);
    } else if (subRealm === 2) {
        return Math.round(virtualVal * 1.5625);
    }
    
    return virtualVal;
}

// New unified target getter matching the prompt's implied constants
function getRealBreakthroughTarget(realm: number, sub: SubRealm): number {
    // Reusing the getExpConstant(..., false) logic which aligns with "Virtual"
    return getExpConstant(realm, sub, false);
}

function getFullStageName(realm: number, stage: number) {
    if (realm === 0) return '凡人';
    return `${REALMS[realm]}${STAGES[stage]}`;
}
// --- 新增：坊市炼丹概率数学模型 ---

// 误差函数 (erf) 实现，用于精确计算正态分布
function erf(x: number): number {
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
}

// 标准正态分布 CDF Φ(x)
function standardNormalCDF(x: number): number {
    return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

// 根据方差计算各品级概率 (下品 [0,1), 中品 [1,2), 上品 [2,3), 极品 [3, inf))
function calculatePillProbabilities(variance: number) {
    const sigma = Math.sqrt(variance);
    const p0 = standardNormalCDF(0);
    const pLow = (standardNormalCDF(1 / sigma) - p0) * 2;
    const pMid = (standardNormalCDF(2 / sigma) - standardNormalCDF(1 / sigma)) * 2;
    const pHigh = (standardNormalCDF(3 / sigma) - standardNormalCDF(2 / sigma)) * 2;
    const pPeak = (1.0 - standardNormalCDF(3 / sigma)) * 2;
    
    return { low: pLow, mid: pMid, high: pHigh, peak: pPeak };
}

// 获取小境界底分系数
function getRealmBaseCoeff(idx: number): number {
    const map = [1, 2, 4, 6, 8]; // 前期, 中期, 后期, 圆满, 大圆满
    return map[idx] || 1;
}

// 计算绝对底分 (10^Realm * Coeff)
function calculateBaseScore(realm: number, subRealmIndex: number): number {
    return Math.pow(10, realm) * getRealmBaseCoeff(subRealmIndex);
}

// 将用户的 stage (0-7) 映射到丹药的 subRealm (0-4)
function userStageToSubIndex(stage: number): number {
    if (stage <= 1) return 0; // 前期/前期巅峰
    if (stage <= 3) return 1; // 中期/中期巅峰
    if (stage <= 5) return 2; // 后期/后期巅峰
    if (stage === 6) return 3; // 圆满
    return 4; // 大圆满
}
// --- 坊市数学模型结束 ---
// --- 新增：进度文本格式化函数 ---
const getProgressStr = (realm?: number, stage?: number, xp?: number, mode: 'percent' | 'exact' = 'percent') => {
    if (realm === undefined || stage === undefined || xp === undefined) return '';
    if (realm >= 10 || stage === 7) return ''; // 渡劫飞升 或 大圆满 无进度
    
    const isBottleneck = stage === 1 || stage === 3 || stage === 5;
    const target = isBottleneck ? getBreakthroughTarget(realm, stage) : getMaxXP(realm, stage);
    const safeTarget = target > 0 ? target : 1;
    
    if (mode === 'exact') {
        return `${formatScore(xp)}/${formatScore(target)}`;
    } else {
        const pct = Math.min(100, (xp / safeTarget) * 100);
        return `${pct.toFixed(1)}%`;
    }
};

const formatProgressChange = (sRealm?: number, sStage?: number, sXP?: number, eRealm?: number, eStage?: number, eXP?: number, mode: 'percent' | 'exact' = 'percent') => {
    if (sRealm === undefined || sStage === undefined) return '记录缺失';
    const sName = getFullStageName(sRealm, sStage);
    const eName = getFullStageName(eRealm ?? sRealm, eStage ?? sStage);
    
    const sProg = getProgressStr(sRealm, sStage, sXP, mode);
    const eProg = getProgressStr(eRealm ?? sRealm, eStage ?? sStage, eXP, mode);

    const sPart = sProg ? `${sName} ${sProg}` : sName;
    const ePart = eProg ? `${eName} ${eProg}` : eName;

    if (sName === eName) {
        if (!sProg && !eProg) return sName; // 兼容没有XP的老记录
        return `${sName} ${sProg || '?'} -> ${eProg || '?'}`;
    } else {
        return `${sPart} -> ${ePart}`;
    }
};

// --- Components ---

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
    // 修复：1045:18 错误，加上 [...records]
    const totalDurationSecs = records.reduce((acc, r) => acc + (r.sessionDuration || r.totalTrials * r.interval), 0);
    // 改为按时间倒序排列（最近的在最上面）
    const sorted = [...records].sort((a, b) => b.timestamp - a.timestamp);
    // 因为数组倒序了，所以一天的初始记录变成最后一个，最终记录变成第一个
    const startRecord = sorted[sorted.length - 1];
    const endRecord = sorted[0];
    
    let realmChangeText = "";
    if (startRecord && endRecord) {
        realmChangeText = formatProgressChange(
            startRecord.realmLevel, 
            startRecord.stage, 
            startRecord.beforeXP,
            endRecord.afterRealmLevel ?? endRecord.realmLevel, 
            endRecord.afterStage ?? endRecord.stage, 
            endRecord.afterXP,
            'percent' // 每日总计保持百分比显示
        );
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
                        时长: {formatDuration(totalDurationSecs)} | {realmChangeText}
                    </div>
                </div>
                {isExpanded ? <ChevronDown size={20} color="#94a3b8" /> : <ChevronRight size={20} color="#94a3b8" />}
            </div>
            {isExpanded && (
                <div className="day-content">
                    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                        {sorted.map(run => {
                            const bScore = run.baseScore !== undefined ? run.baseScore : run.score;
                            const bnScore = run.bonusScore || 0;
                            const timeStr = run.sessionDuration ? run.sessionDuration.toFixed(2) : ((run.totalTrials || 0) * (run.interval || 0)).toFixed(2);
                            const intervalStr = run.interval.toFixed(2);

                            return (
                                <div key={run.id} style={{padding: 12, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc'}}>
                                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 6}}>
                                        <span style={{fontWeight: 700, color: '#0f172a'}}>
                                           <span style={{background: '#e2e8f0', color: '#475569', padding: '2px 6px', borderRadius: 4, marginRight: 6, fontSize: '0.7rem'}}>{MODE_LABELS[run.mode as PlayMode] || '未知'}</span>
                                           {run.isVariable ? `Var N (${run.variableDifficulty})` : `N = ${run.n}`}
                                        </span>
                                        <span style={{fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6}}>
                                        耗时: {timeStr}s ({run.totalTrials}次) | 间隔: {intervalStr}s | {formatDateTime(run.timestamp)}
                                        </span>
                                    </div>
                                  <div style={{fontSize: '0.8rem', color: '#475569', marginBottom: 8, display: 'flex', alignItems: 'center'}}>
                                        <span style={{background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600}}>
                                            {formatProgressChange(run.realmLevel, run.stage, run.beforeXP, run.afterRealmLevel ?? run.realmLevel, run.afterStage ?? run.stage, run.afterXP,'exact')}
                                        </span>
                                    </div>
                                    <div style={{marginBottom: 8}}>
                                        <StatsTable visual={run.visualScore} audio={run.audioScore} />
                                    </div>
                                    <div style={{display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8}}>
                                        {/* 消耗丹药及效果 */}
                                        {run.pillUsed && (
                                            <div style={{fontSize: '0.75rem', color: '#7c3aed', background: '#f5f3ff', padding: '4px 8px', borderRadius: 4}}>
                                                <span style={{fontWeight: 'bold'}}>服用: {getPillName(run.pillUsed)}</span>
                                                {run.pillEffectLog && <span style={{marginLeft: 6, opacity: 0.8}}>- {run.pillEffectLog}</span>}
                                            </div>
                                        )}
                                        
                                        {/* 分数分离显示 */}
                                        {/* 历史记录：红字大显原分数，下方橘色小字标加成 */}
                                        {bScore !== undefined && (
                                            <div style={{textAlign: 'right'}}>
                                                <div style={{fontWeight: 700, color: '#ea580c', fontSize: '1.05rem'}}>
                                                    +{formatScore(bScore)} 经验
                                                </div>
                                                {bnScore > 0 && (
                                                    <div style={{fontSize: '0.75rem', color: '#f59e0b', marginTop: 2}}>
                                                        (+{formatScore(bnScore)} 丹药加成)
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {run.pillAcquired && run.pillAcquired.length > 0 && (
                                        <div style={{marginTop: 6, fontSize: '0.75rem', color: '#059669', background: '#ecfdf5', padding: '6px 8px', borderRadius: 4}}>
                                            <div style={{fontWeight: 'bold', marginBottom: 2}}>获得丹药: {run.pillAcquired.map(p => getPillName(p)).join(', ')}</div>
                                            {/* 渲染获得原因 */}
                                            {run.acquireLogs && run.acquireLogs.map((log, i) => (
                                                <div key={i} style={{opacity: 0.85}}>• {log}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
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

// --- Master Multi-Mode State ---

const Game = () => {
  const DEFAULT_MODE_DATA = {
      history:[],
      cultivation: { realmLevel: 1, stage: 0, currentXP: 0, recentScores:[], totalStudyTime: 0, stageStudyTime: 0, totalSessions: 0, stageSessions: 0 },
      milestones: [],
      inventory:[],
      savedWeightsMap: {},
      settings: {
          n: DEFAULT_N, interval: DEFAULT_INTERVAL, useCenter: true, isVariable: false,
          variableWeights: [1], showFeedback: false, volume: 0.5, displayTime: DEFAULT_DISPLAY_TIME,
          roundMode: 'standard', customRoundCount: 20, pacingMode: 'standard',
          showRealtimeInterval: false, showProgressBar: true, showRoundCounter: true, showInputConfirmation: true
      }
  };

  const [masterData, setMasterData] = useState(() => {
      try {
          const s = localStorage.getItem('dual-n-back-master-v2');
          if (s) {
              const parsed = JSON.parse(s);
              // 【向下兼容】将老版本的 availableDraws 转换为 spirit (灵元) 真火
              if (parsed.gachaState && typeof parsed.gachaState.availableDraws === 'number') {
                  parsed.gachaState = {
                      accumulatedTime: parsed.gachaState.accumulatedTime || 0,
                      fires: { spirit: parsed.gachaState.availableDraws, focus: 0, foundation: 0, preservation: 0, heavenly: 0 },
                      selectedFireTypes:['spirit', 'focus', 'foundation', 'preservation', 'heavenly']
                  };
                  delete parsed.gachaState.availableDraws;
              } else if (parsed.gachaState && !parsed.gachaState.fires) {
                  parsed.gachaState.fires = { spirit: 0, focus: 0, foundation: 0, preservation: 0, heavenly: 0 };
                  parsed.gachaState.selectedFireTypes =['spirit', 'focus', 'foundation', 'preservation', 'heavenly'];
              }
              return parsed;
          }
      } catch(e) {}
      return {
          gachaState: { 
              accumulatedTime: 0, 
              fires: { spirit: 0, focus: 0, foundation: 0, preservation: 0, heavenly: 0 },
              selectedFireTypes: ['spirit', 'focus', 'foundation', 'preservation', 'heavenly']
          },
          modes: {
              memorize: JSON.parse(JSON.stringify(DEFAULT_MODE_DATA)),
              intuition: JSON.parse(JSON.stringify(DEFAULT_MODE_DATA)),
              technique: JSON.parse(JSON.stringify(DEFAULT_MODE_DATA)),
              score: JSON.parse(JSON.stringify(DEFAULT_MODE_DATA))
          }
      };
  });

  const [activeMode, setActiveMode] = useState<PlayMode>('score');
  const [showGlobalHistory, setShowGlobalHistory] = useState(false);

  // 统一持久化存储
  useEffect(() => {
      localStorage.setItem('dual-n-back-master-v2', JSON.stringify(masterData));
  }, [masterData]);

  const updateModeData = useCallback((key: string, value: any) => {
      setMasterData(prev => ({
          ...prev, modes: { ...prev.modes,[activeMode]: {
              ...prev.modes[activeMode],
              [key]: typeof value === 'function' ? value(prev.modes[activeMode][key]) : value
          }}
      }));
  },[activeMode]);

  const updateSetting = useCallback((key: string, value: any) => {
      setMasterData(prev => ({
          ...prev, modes: { ...prev.modes, [activeMode]: {
              ...prev.modes[activeMode], settings: {
                  ...prev.modes[activeMode].settings,
                  [key]: typeof value === 'function' ? value(prev.modes[activeMode].settings[key]) : value
              }
          }}
      }));
  }, [activeMode]);

  const currentMode = masterData.modes[activeMode];

  const history = currentMode.history;
  const setHistory = (val: any) => updateModeData('history', val);
  const cultivation = currentMode.cultivation;
  const setCultivation = (val: any) => updateModeData('cultivation', val);
  const milestones = currentMode.milestones;
  const setMilestones = (val: any) => updateModeData('milestones', val);
  const inventory = currentMode.inventory;
  const setInventory = (val: any) => updateModeData('inventory', val);
  const savedWeightsMap = currentMode.savedWeightsMap;
  const setSavedWeightsMap = (val: any) => updateModeData('savedWeightsMap', val);

  const { n, interval, useCenter, isVariable, variableWeights, showFeedback, volume, displayTime, roundMode, customRoundCount, pacingMode, showRealtimeInterval, showProgressBar, showRoundCounter, showInputConfirmation } = currentMode.settings;
  // ... 上面是 const { n, interval ... } = currentMode.settings;

  // 【修复开始】补回这些丢失的衍生变量
  const realmName = REALMS[cultivation.realmLevel] || '未知';
  const stageName = STAGES[cultivation.stage] || '';
  const isBottleneck = [1, 3, 5].includes(cultivation.stage);
  const isGreatPerfect = cultivation.stage === 7;
  // 【修复结束】

  // 下面是 const gachaState = masterData.gachaState;
  const setN = (val: any) => updateSetting('n', val);
  const setInterval = (val: any) => updateSetting('interval', val);
  const setUseCenter = (val: any) => updateSetting('useCenter', val);
  const setIsVariable = (val: any) => updateSetting('isVariable', val);
  const setVariableWeights = (val: any) => updateSetting('variableWeights', val);
  const setShowFeedback = (val: any) => updateSetting('showFeedback', val);
  const setVolume = (val: any) => updateSetting('volume', val);
  const setDisplayTime = (val: any) => updateSetting('displayTime', val);
  const setRoundMode = (val: any) => updateSetting('roundMode', val);
  const setCustomRoundCount = (val: any) => updateSetting('customRoundCount', val);
  const setPacingMode = (val: any) => updateSetting('pacingMode', val);
  const setShowRealtimeInterval = (val: any) => updateSetting('showRealtimeInterval', val);
  const setShowProgressBar = (val: any) => updateSetting('showProgressBar', val);
  const setShowRoundCounter = (val: any) => updateSetting('showRoundCounter', val);
  const setShowInputConfirmation = (val: any) => updateSetting('showInputConfirmation', val);

  const gachaState = masterData.gachaState;
  const setGachaState = (val: any) => setMasterData(prev => ({
      ...prev, gachaState: typeof val === 'function' ? val(prev.gachaState) : val
  }));

  // ==========================================
  // 下面是被误删的 核心引擎状态，现在全部恢复！
  // ==========================================
  const [isPlaying, setIsPlaying] = useState(false);
  const [sequence, setSequence] = useState<GameStep[]>([]);
  const[currentIndex, setCurrentIndex] = useState(-1);
  const currentIndexRef = useRef(-1);
  const[totalGameTrials, setTotalGameTrials] = useState(0);
  
  const [dynamicInterval, setDynamicInterval] = useState(DEFAULT_INTERVAL);
  const runningIntervalRef = useRef(DEFAULT_INTERVAL);
  const startTimeRef = useRef<number>(0);

  const [selectedPillId, setSelectedPillId] = useState<string | null>(null);
  const [showInventory, setShowInventory] = useState(false);
  const[inventoryFilter, setInventoryFilter] = useState<PillType | 'all'>('all');
  const[showGacha, setShowGacha] = useState(false);
  const [lastGachaResult, setLastGachaResult] = useState<Pill | null>(null);

  const[gachaTargetRealm, setGachaTargetRealm] = useState(1);
  const [gachaTargetSub, setGachaTargetSub] = useState(0);
  const [gachaTargetType, setGachaTargetType] = useState<PillType>('spirit');

  useEffect(() => {
      if (showGacha) {
          setGachaTargetRealm(Math.max(1, cultivation.realmLevel));
          setGachaTargetSub(userStageToSubIndex(cultivation.stage));
          setGachaTargetType('spirit');
      }
  }, [showGacha, cultivation.realmLevel, cultivation.stage]);

  const [showHistory, setShowHistory] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  
  const [showSummary, setShowSummary] = useState(false);
  const[showMilestones, setShowMilestones] = useState(false);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);
  
  const [activePos, setActivePos] = useState<number | null>(null);
  const [currentNumberDisplay, setCurrentNumberDisplay] = useState<number | null>(null); 
  
  const [audioPressed, setAudioPressed] = useState(false);
  const[visualPressed, setVisualPressed] = useState(false);
  
  const [audioFeedback, setAudioFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [visualFeedback, setVisualFeedback] = useState<'correct' | 'wrong' | null>(null);

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
  const sequenceRef = useRef<GameStep[]>([]); 

  // 这是一个包含所有关键状态的 Ref，确保 saveResults 能读到最新数据
  const latestStateRef = useRef({
      n, interval, isVariable, variableWeights, pacingMode, 
      cultivation, inventory, gachaState, milestones, history, selectedPillId
  });

  // 使用 Effect 实时更新 latestStateRef
  useEffect(() => {
      latestStateRef.current = {
          n, interval, isVariable, variableWeights, pacingMode, 
          cultivation, inventory, gachaState, milestones, history, selectedPillId
      };
  });


  const handleExportData = () => {
    // 【修改】：不再提取局部变量，直接导出整个 masterData 对象
    const blob = new Blob([JSON.stringify(masterData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // 文件名加上 MASTER 标识，方便区分
    a.download = `dualn-back-MASTER-${formatDateForFilename(Date.now())}.json`;
    a.click();
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
          const data = JSON.parse(ev.target?.result as string);
          
          // --- 判定逻辑开始 ---

          // 情况 A：新版大 JSON (包含所有模式)
          if (data.modes && typeof data.modes === 'object') {
              setMasterData(data);
              alert('成功！检测到全量天道存档，所有模式数据已同步。');
          } 
          
          // 情况 B：旧版单模式 JSON (只包含历史、修为等)
          else if (data.history || data.cultivation) {
              setMasterData(prev => {
                  // 仅更新当前活跃的模式，其他模式保持不动
                  const updatedModes = {
                      ...prev.modes,
                      [activeMode]: {
                          ...DEFAULT_MODE_DATA, // 使用默认值兜底缺失字段
                          history: data.history || [],
                          cultivation: data.cultivation || DEFAULT_MODE_DATA.cultivation,
                          milestones: data.milestones || [],
                          inventory: data.inventory || [],
                          settings: { ...DEFAULT_MODE_DATA.settings, ...(data.settings || {}) },
                          savedWeightsMap: data.savedWeightsMap || {}
                      }
                  };

                  return {
                      ...prev,
                      modes: updatedModes,
                      // 全局真火进度取两者的最大值，确保不回退
                      gachaState: {
                          accumulatedTime: Math.max(prev.gachaState.accumulatedTime, data.gachaState?.accumulatedTime || 0),
                          availableDraws: Math.max(prev.gachaState.availableDraws, data.gachaState?.availableDraws || 0)
                      }
                  };
              });
              alert(`成功！已将此存档注入至当前的【${MODE_LABELS[activeMode]}】模式。`);
          } 
          
          else {
              alert('读取失败：此文件不像是有效的修仙存档。');
          }
      } catch (err) {
          alert('解析失败：文件可能损坏或格式不正确。');
      }
      
      // 重置 input 以便下次还能选同一个文件
      if (fileInputRef.current) fileInputRef.current.value = '';
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
    sequenceRef.current = newSeq; // 【关键修改】必须加这一行！将序列存入 Ref
    
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
    timerRef.current = window.setTimeout(() => nextTrial(0, newSeq), 2000);
  };

  const stopGame = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPlaying(false);
    setActivePos(null);
    setCurrentNumberDisplay(null);
    // 新增下面这一行：立即切断可能正在播放的语音播报
    window.speechSynthesis.cancel(); 
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

  const finalizeResults = (
      nextCultivation: CultivationState, 
      newMilestonesList: Milestone[], 
      calculatedScore: number, 
      originalScore: number,
      bonusScore: number,
      totalAccVal: number,
      difficulty: number,
      sessionTime: number,
      finalTrials: number, // 【新增参数】
      usedPill?: Pill,
      pillEffectLog?: string,
      acquiredPills?: Pill[],
      acquireLogs?: string[],
      prevCultivation?: CultivationState
  ) => {
    const avgInt = finalTrials > 0 ? sessionTime / finalTrials : 0;
    
    // 从 Ref 读取最新的配置，防止闭包读取旧的 N 值
    const { n, interval, isVariable, pacingMode } = latestStateRef.current;
    const result: GameResult = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      n,
      interval,
      avgInterval: avgInt,
      sessionDuration: sessionTime,
      totalTrials: finalTrials,
      audioScore: scoreRef.current.audio,
      visualScore: scoreRef.current.visual,
      isVariable,
      variableDifficulty: difficulty,
      score: calculatedScore,
      baseScore: originalScore, 
      bonusScore: bonusScore,
      accuracy: totalAccVal,
      device: getDeviceType(),
      realmLevel: prevCultivation?.realmLevel || cultivation.realmLevel,
      stage: prevCultivation?.stage || cultivation.stage,
      afterRealmLevel: nextCultivation.realmLevel,
      afterStage: nextCultivation.stage,
      mode: activeMode, // 【新增】标记这条记录属于哪个模式
      pacingMode,
      afterRealmLevel: nextCultivation.realmLevel,
      afterStage: nextCultivation.stage,
      beforeXP: prevCultivation?.currentXP ?? cultivation.currentXP, // 【新增】保存期初经验
      afterXP: nextCultivation.currentXP, // 【新增】保存期末经验
      pacingMode,
      pillUsed: usedPill,
      pillEffectLog,
      pillAcquired: acquiredPills,
      acquireLogs: acquireLogs
    };

    setHistory(prev => [...prev, result]);
    setCultivation(nextCultivation);
    if (newMilestonesList.length > 0) setMilestones(prev => [...prev, ...newMilestonesList]);
    setLastResult(result);
    setShowSummary(true);
  };

const saveResults = (overrideTrials?: number) => {
    // 如果传入了精确的次数就用传入的，否则用当前索引兜底
    const finalTrials = overrideTrials !== undefined ? overrideTrials : Math.max(0, currentIndexRef.current);
    if (finalTrials === 0) return;
// 耗时严格按照：设置的时间间隔 * 实际进行的轮数
    const sessionTime = finalTrials * interval;
    const vScore = scoreRef.current.visual;
    const aScore = scoreRef.current.audio;
    const totalHits = vScore.hits + aScore.hits;
    const totalMisses = vScore.misses + aScore.misses;
    const totalFalse = vScore.falseAlarms + aScore.falseAlarms;
    const totalAccVal = calculateAccuracy(totalHits, totalMisses, totalFalse);
    const accFraction = totalAccVal / 100;
    const difficulty = isVariable ? calculateVariableDifficulty() : n;
    
    const usedPill = inventory.find(p => p.id === selectedPillId);
    let pillEffectLog = '';
    
    // Calculate Scores (Preservation pill modifies base 64 formula)
    let formulaBase = 64;
    const n_floor = Math.floor(difficulty);
    
    if (usedPill && usedPill.type === 'preservation') {
        if (n_floor <= usedPill.realm) {
            const bases = { unique: 16, rare: 22, fine: 30, finished: 40, defective: 52 };
            formulaBase = bases[usedPill.grade as keyof typeof bases] || 64;
            pillEffectLog = `保元丹生效: 惩罚底数降至${formulaBase}`;
        } else {
            pillEffectLog = `保元丹无效: 训练难度超过丹药大境界`;
        }
    }

    // 真正的原分数（无任何丹药影响时的得分）
    const pureOriginalScore = Math.pow(10, difficulty) * (Math.pow(64, accFraction) - 1) / 63;
    // 使用保元丹后的分数（如果没吃保元丹，和纯原分数相同）
    const preservedScore = Math.pow(10, difficulty) * (Math.pow(formulaBase, accFraction) - 1) / (formulaBase - 1);
    
    let calculatedScore = preservedScore;
    let originalScoreForDisplay = pureOriginalScore; // The true "原分数"
    let bonusScore = preservedScore - pureOriginalScore; // 此时 bonusScore 是由保元丹带来的额外分数

    // --- Pill Consumption (Remove from Inventory) ---
    if (usedPill) {
        setInventory(prev => prev.filter(p => p.id !== selectedPillId));
        setSelectedPillId(null);
    }

    const prevCultivation = { ...cultivation };
    const nextCultivation = { ...cultivation };
    const newMilestonesList: Milestone[] = [];
    const acquiredPills: Pill[] = [];
    const acquireLogs: string[] = [];
    
    // Gacha Accumulation (只积攒时间，不再自动发真火)
    const newGachaState = { ...gachaState };
    if (!newGachaState.fires) newGachaState.fires = { spirit: 0, focus: 0, foundation: 0, preservation: 0, heavenly: 0 };
    if (!newGachaState.selectedFireTypes) newGachaState.selectedFireTypes = ['spirit', 'focus', 'foundation', 'preservation', 'heavenly'];
    
    newGachaState.accumulatedTime += sessionTime;
    setGachaState(newGachaState);

    let bottleneckMultiplier = 2/3; // Default
    let tribulationReqOffset = 0;

    // --- Process Pill Usage Modifiers ---
    if (usedPill) {
        if (usedPill.type === 'spirit') {
             if ([0, 2, 4, 6].includes(nextCultivation.stage)) {
                 const C_VALUES = [1, 2, 4, 6, 8];
                 const C = C_VALUES[usedPill.subRealm ?? 0] || 1;
                 
                 let mult = 1, capBase = 0;
                 if (usedPill.grade === 'low') { mult = 1.5; capBase = 0.5; }
                 else if (usedPill.grade === 'mid') { mult = 2.0; capBase = 1.0; }
                 else if (usedPill.grade === 'high') { mult = 3.0; capBase = 2.0; }
                 else if (usedPill.grade === 'peak') { mult = 5.0; capBase = 4.0; }
                 
                 const realCap = C * capBase * Math.pow(10, usedPill.realm);
                 const rawExtra = pureOriginalScore * (mult - 1);
                 const spiritBonus = Math.min(rawExtra, realCap);
                 
                 bonusScore += spiritBonus;
                 calculatedScore += spiritBonus;
                 pillEffectLog = `灵元丹生效: 额外获得 ${formatScore(spiritBonus)} 经验`;
             } else {
                 pillEffectLog = `灵元丹无效: 当前不在修为积累期`;
             }
        }
        
        if (usedPill.type === 'focus') {
             if ([1, 3, 5].includes(nextCultivation.stage)) {
                 const userMinor = Math.floor((nextCultivation.stage - 1) / 2);
                 const userLevel = nextCultivation.realmLevel * 6 + userMinor * 2 + 0; // 瓶颈视作虚品(0)
                 const pillLevel = usedPill.realm * 6 + (usedPill.subRealm ?? 0) * 2 + (usedPill.grade === 'real' ? 1 : 0);
                 const diff = pillLevel - userLevel;
                 
                 if (diff < 0) {
                     pillEffectLog = `凝神丹无效: 丹药境界低于当前瓶颈`;
                     bottleneckMultiplier = 2/3;
                 } else {
                     if (diff === 0) bottleneckMultiplier = 0.72;
                     else if (diff === 1) bottleneckMultiplier = 0.78;
                     else if (diff === 2) bottleneckMultiplier = 0.86;
                     else if (diff === 3) bottleneckMultiplier = 0.96;
                     else bottleneckMultiplier = 1.0;
                     
                     pillEffectLog = `凝神丹生效: 转化率提升至 ${(bottleneckMultiplier*100).toFixed(0)}%`;
                 }
             } else {
                 pillEffectLog = `凝神丹无效: 当前不在瓶颈期`;
             }
        }
        
        if (usedPill.type === 'foundation') {
            if (![1, 3, 5].includes(nextCultivation.stage)) {
                pillEffectLog = `护基丹无效: 当前不在瓶颈期`;
            }
        }
        
        if (usedPill.type === 'heavenly') {
             if (nextCultivation.stage === 6 || nextCultivation.stage === 7) {
                 if (usedPill.realm > nextCultivation.realmLevel) {
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
    const dropRealmBase = Math.floor(difficulty);
    const names = ['前期','中期','后期'];

    // 计算玩家当前的绝对级别 (每跨1大境界+6级，每跨1小境界+2级)
    const userMinor = Math.min(2, Math.floor(nextCultivation.stage / 2));
    const userAbsLevel = nextCultivation.realmLevel * 6 + userMinor * 2;

    // 1. Focus Pill Drops (凝神丹 - Variable Mode only)
    if (isVariable) {
        let focusFound = false;
        // 独立掷骰子算机缘
        const randFocus = Math.random() || 0.0001;
        const mFocus = 1.4 * Math.log10(3.3 / randFocus);
        const refinedScoreFocus = pureOriginalScore * mFocus;

        for (let r = 10; r >= 1; r--) {
            if (focusFound) break;
            const levels = [
                {sub: 2, isReal: true, val: getExpConstant(r, 2, true)},
                {sub: 2, isReal: false, val: getExpConstant(r, 2, false)},
                {sub: 1, isReal: true, val: getExpConstant(r, 1, true)},
                {sub: 1, isReal: false, val: getExpConstant(r, 1, false)},
                {sub: 0, isReal: true, val: getExpConstant(r, 0, true)},
                {sub: 0, isReal: false, val: getExpConstant(r, 0, false)},
            ];
            
            for (const l of levels) {
                const threshold = l.val / 3;
                // 【核心：变换前 or 变换后 只要有一个达标即可】
                if (pureOriginalScore >= threshold || refinedScoreFocus >= threshold) {
                    const pillAbsLevel = r * 6 + l.sub * 2 + (l.isReal ? 1 : 0);
                    
                    if (pillAbsLevel >= userAbsLevel) {
                        const g = l.isReal ? 'real' : 'virtual';
                        acquiredPills.push({
                            id: Date.now().toString() + 'f', type: 'focus', realm: r,
                            subRealm: l.sub as SubRealm, grade: g, timestamp: Date.now()
                        });
                        
                        const usedScore = Math.max(pureOriginalScore, refinedScoreFocus);
                        acquireLogs.push(`凝神机缘: M=${mFocus.toFixed(2)}x。原分 ${pureOriginalScore.toFixed(0)} -> 质变 ${refinedScoreFocus.toFixed(0)}。最高匹配: ${usedScore.toFixed(0)} >= ${threshold.toFixed(0)} (${REALMS[r]}${names[l.sub]}${g==='real'?'实品':'虚品'}要求/3)`);
                    }
                    focusFound = true;
                    break; 
                }
            }
        }
    }

    // 2. Foundation Pill Drops (护基丹)
    let foundationFound = false;
    // 独立掷骰子算机缘
    const randFound = Math.random() || 0.0001;
    const mFound = 1.4 * Math.log10(3.3 / randFound);
    const refinedScoreFound = pureOriginalScore * mFound;

    for (let r = 10; r >= 1; r--) {
        if (foundationFound) break;
        const levels = [
            {sub: 2, isReal: true, val: getExpConstant(r, 2, true)},
            {sub: 2, isReal: false, val: getExpConstant(r, 2, false)},
            {sub: 1, isReal: true, val: getExpConstant(r, 1, true)},
            {sub: 1, isReal: false, val: getExpConstant(r, 1, false)},
            {sub: 0, isReal: true, val: getExpConstant(r, 0, true)},
            {sub: 0, isReal: false, val: getExpConstant(r, 0, false)},
        ];
        
        for (const l of levels) {
            const threshold = l.val;
            // 【核心：变换前 or 变换后 只要有一个达标即可】
            if (pureOriginalScore >= threshold || refinedScoreFound >= threshold) {
                const pillAbsLevel = r * 6 + l.sub * 2 + (l.isReal ? 1 : 0);
                
                if (pillAbsLevel >= userAbsLevel - 2) {
                    const g = l.isReal ? 'real' : 'virtual';
                    acquiredPills.push({
                        id: Date.now().toString() + 'fd', type: 'foundation', realm: r,
                        subRealm: l.sub as SubRealm, grade: g, timestamp: Date.now() + 1 
                    });
                    
                    const usedScore = Math.max(pureOriginalScore, refinedScoreFound);
                    acquireLogs.push(`护基机缘: M=${mFound.toFixed(2)}x。原分 ${pureOriginalScore.toFixed(0)} -> 质变 ${refinedScoreFound.toFixed(0)}。最高匹配: ${usedScore.toFixed(0)} >= ${threshold.toFixed(0)} (${REALMS[r]}${names[l.sub]}${g==='real'?'实品':'虚品'}要求)`);
                }
                foundationFound = true;
                break; 
            }
        }
    }
    
    // 3. Preservation Pill (保元丹)
    if (interval <= 2.5 && dropRealmBase > 0) {
        // 独立掷骰子算机缘
        const randPres = Math.random() || 0.0001;
        const mPres = 1.4 * Math.log10(3.3 / randPres);
        
        // 分别计算原实力系数和质变后的系数
        const xBase = Math.min(pureOriginalScore / Math.pow(10, difficulty), 1) * (2.5 - interval);
        const xRefined = Math.min((pureOriginalScore * mPres) / Math.pow(10, difficulty), 1) * (2.5 - interval);
        
        // 取最大值保底
        const xFinal = Math.max(xBase, xRefined);

        let pGrade: PillGrade | null = null;
        if (xFinal >= 1) pGrade = 'unique';
        else if (xFinal >= 0.8) pGrade = 'rare';
        else if (xFinal >= 0.6) pGrade = 'fine';
        else if (xFinal >= 0.4) pGrade = 'finished';
        else if (xFinal >= 0.2) pGrade = 'defective';
        
        if (pGrade) {
            acquiredPills.push({
                id: Date.now().toString() + 'p',
                type: 'preservation',
                realm: dropRealmBase,
                grade: pGrade,
                timestamp: Date.now() + 3
            });
            acquireLogs.push(`保元机缘: M=${mPres.toFixed(2)}x。基础系数 ${xBase.toFixed(2)} -> 质变系数 ${xRefined.toFixed(2)}。最终结算: x=${xFinal.toFixed(2)}，获得保元丹`);
        }
    }

    // 4. Heavenly Pill (通天渡厄丹)
    if (dropRealmBase > 0 && dropRealmBase > nextCultivation.realmLevel) {
        // 独立掷骰子算神识感应
        const randHeav = Math.random() || 0.0001;
        const accBonus = 10 * Math.log10(1 / randHeav);
        const refinedAcc = Math.min(totalAccVal + accBonus, 100);
        
        // 因为总是加分，直接取推演后的准确率
        let hGrade: PillGrade | null = null;
        if (refinedAcc >= 100) hGrade = 'heaven';
        else if (refinedAcc >= 90) hGrade = 'earth';
        else if (refinedAcc >= 80) hGrade = 'human';
        
        if (hGrade) {
             acquiredPills.push({
                 id: Date.now().toString() + 'h',
                 type: 'heavenly',
                 realm: dropRealmBase,
                 grade: hGrade,
                 timestamp: Date.now() + 2 
             });
             acquireLogs.push(`神识通感: 补正 +${accBonus.toFixed(1)}%。实际准确率 ${totalAccVal.toFixed(1)}% -> 推演准确率 ${refinedAcc.toFixed(1)}%，获得通天渡厄丹`);
        }
    }
    
    if (acquiredPills.length > 0) {
        setInventory(prev => [...prev, ...acquiredPills]);
    }

    // --- Update Cultivation ---
    nextCultivation.totalStudyTime += sessionTime;
    nextCultivation.stageStudyTime += sessionTime;
    nextCultivation.totalSessions += 1;
    nextCultivation.stageSessions += 1;

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
             
             finalizeResults(nextCultivation, newMilestonesList, calculatedScore, originalScoreForDisplay, bonusScore, totalAccVal, difficulty, sessionTime, finalTrials, usedPill, pillEffectLog, acquiredPills, acquireLogs, prevCultivation);
             return;
        }
    }

    // Normal Progression
    if (stage === 0 || stage === 2 || stage === 4 || stage === 6) {
      // Accumulation Stages
      nextCultivation.currentXP += calculatedScore;
      const maxXP = getMaxXP(realm, stage);
      
      if (nextCultivation.currentXP >= maxXP) {
        newMilestonesList.push({
          id: Date.now().toString(),
          timestamp: Date.now(),
          type: 'peak',
          title: `到达${REALMS[realm]}${stage === 6 ? '大圆满' : STAGES[stage]+'巅峰'}`,
          // 【修改处】详细列出：当前积累总分 / 目标分数
          description: `修为积累圆满 (当前: ${formatScore(nextCultivation.currentXP)} / 目标: ${formatScore(maxXP)})。即将面临突破瓶颈。`,
          stageDuration: nextCultivation.stageStudyTime,
          totalDuration: nextCultivation.totalStudyTime,
          stageSessions: nextCultivation.stageSessions,
          totalSessions: nextCultivation.totalSessions
        });
        
        if (stage === 6) {
            nextCultivation.currentXP = maxXP; 
            nextCultivation.stage = 7; 
        } else {
            nextCultivation.stage += 1; 
            nextCultivation.currentXP = 0;
        }
        nextCultivation.recentScores = []; 
        nextCultivation.stageStudyTime = 0; 
        nextCultivation.stageSessions = 0;
      }
    } else if (stage === 1 || stage === 3 || stage === 5) {
      // Bottleneck Stages
      const prevWeighted = nextCultivation.currentXP;
      // Apply Focus Pill Multiplier
      let newWeighted = prevWeighted * bottleneckMultiplier + calculatedScore;
      
      // Apply Foundation Pill Protection Logic
      if (newWeighted < prevWeighted && usedPill && usedPill.type === 'foundation') {
          const userMinor = Math.floor((stage - 1) / 2);
          const userLevel = realm * 6 + userMinor * 2 + 0; // 瓶颈视作虚品(0)
          const pillLevel = usedPill.realm * 6 + (usedPill.subRealm ?? 0) * 2 + (usedPill.grade === 'real' ? 1 : 0);
          const diff = pillLevel - userLevel;
          
          if (diff >= 1) {
              newWeighted = prevWeighted;
              pillEffectLog += (pillEffectLog ? ' | ' : '') + `护基丹生效(高阶)：修为完全锁定`;
          } else if (diff === 0) {
              newWeighted = 0.75 * prevWeighted + 0.25 * newWeighted;
              pillEffectLog += (pillEffectLog ? ' | ' : '') + `护基丹生效(同阶)：修为微幅倒退 (0.75/0.25)`;
          } else if (diff === -1) {
              newWeighted = 0.5 * prevWeighted + 0.5 * newWeighted;
              pillEffectLog += (pillEffectLog ? ' | ' : '') + `护基丹生效(低阶)：修为减缓倒退 (0.5/0.5)`;
          } else if (diff === -2) {
              // 【新增】比自己低2个级别，执行 0.25 prev + 0.75 now
              newWeighted = 0.25 * prevWeighted + 0.75 * newWeighted;
              pillEffectLog += (pillEffectLog ? ' | ' : '') + `护基丹生效(残效)：修为微弱保护 (0.25/0.75)`;
          } else {
              pillEffectLog += (pillEffectLog ? ' | ' : '') + `护基丹无效：丹药境界过低`;
          }
      }

      nextCultivation.currentXP = newWeighted;
      const target = getBreakthroughTarget(realm, stage);
      
      if (newWeighted >= target) {
        newMilestonesList.push({
          id: Date.now().toString(),
          timestamp: Date.now(),
          type: 'minor',
          title: `突破至${REALMS[realm]}${STAGES[stage + 1]}`,
          // 【修改处】详细列出：当前综合评分 / 目标评分
          description: `瓶颈突破成功！(当前: ${formatScore(newWeighted)} / 目标: ${formatScore(target)})。`,
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
    }

    finalizeResults(nextCultivation, newMilestonesList, calculatedScore, originalScoreForDisplay, bonusScore, totalAccVal, difficulty, sessionTime, finalTrials, usedPill, pillEffectLog, acquiredPills, acquireLogs, prevCultivation);
  };
  
  const nextTrial = (idx: number, seq: GameStep[], overrideDuration?: number) => {
    if (idx >= seq.length) {
      stopGame();
      saveResults(seq.length);
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
  // --- 凝聚真火 (手动开盲盒) ---
  const handleClaimFire = () => {
      setGachaState((prev: any) => {
          const sel = prev.selectedFireTypes ||['spirit', 'focus', 'foundation', 'preservation', 'heavenly'];
          const reqTime = getFireReqTime(sel.length);
          if (prev.accumulatedTime >= reqTime) {
              const picked = sel[Math.floor(Math.random() * sel.length)]; // 从选中的类型中随机给一个
              return {
                  ...prev,
                  accumulatedTime: prev.accumulatedTime - reqTime,
                  fires: { ...prev.fires, [picked]: (prev.fires[picked] || 0) + 1 }
              };
          }
          return prev;
      });
  };
  const handleGachaDraw = () => {
    if (!gachaState.fires || (gachaState.fires[gachaTargetType] || 0) <= 0) return;
    
    const r = Math.random();
    let isSuccess = false;
    let finalRealm = 1;
    let finalSub: SubRealm = 0;
    let finalGrade: PillGrade = 'low';
    let msg = '✨ 丹韵成型，炼制成功！';

    const userAbsIdx = getUserAbsoluteIndex(cultivation.realmLevel, cultivation.stage);

    if (gachaTargetType === 'spirit') {
        const userSubIdx = userStageToSubIndex(cultivation.stage);
        const uBase = calculateBaseScore(cultivation.realmLevel, userSubIdx);
        const pBase = calculateBaseScore(gachaTargetRealm, gachaTargetSub);
        const variance = Math.max(1, uBase / pBase) * 1.5;
        const probs = calculatePillProbabilities(variance);
        
        isSuccess = true;
        finalRealm = gachaTargetRealm;
        finalSub = gachaTargetSub as SubRealm;
        
        if (r < probs.low) finalGrade = 'low';
        else if (r < probs.low + probs.mid) finalGrade = 'mid';
        else if (r < probs.low + probs.mid + probs.high) finalGrade = 'high';
        else finalGrade = 'peak';

    } else if (gachaTargetType === 'focus') {
        // --- 凝神丹：炸炉 65% | 同级 20% | +1 10% | +2 3.5% | +3 1% | +4 0.5% ---
        if (r < 0.65) {
            msg = '💥 灵力狂暴，凝神丹碎裂化为飞灰...';
        } else {
            isSuccess = true;
            let offset = 0;
            if (r < 0.85) offset = 0;      // 0.65 ~ 0.85 (20%)
            else if (r < 0.95) offset = 1; // 0.85 ~ 0.95 (10%)
            else if (r < 0.985) offset = 2;// 0.95 ~ 0.985 (3.5%)
            else if (r < 0.995) offset = 3;// 0.985 ~ 0.995 (1%)
            else offset = 4;               // 0.995 ~ 1.0 (0.5%)
            
            const pillData = getPillFromAbsoluteIndex(userAbsIdx + offset);
            finalRealm = pillData.realm;
            finalSub = pillData.sub;
            finalGrade = pillData.grade;
            msg = `✨ 悟道空明，炼成凝神丹 (${offset > 0 ? '+'+offset : '同'}阶)!`;
        }

    } else if (gachaTargetType === 'foundation') {
        // --- 护基丹：炸炉 50% | -2级 30% | -1级 12% | 同级 5% | +1级 3% ---
        if (r < 0.50) {
            msg = '💥 炉火不纯，护基丹药效散尽...';
        } else {
            isSuccess = true;
            let offset = 0;
            if (r < 0.80) offset = -2;     // 0.50 ~ 0.80 (30%)
            else if (r < 0.92) offset = -1;// 0.80 ~ 0.92 (12%)
            else if (r < 0.97) offset = 0; // 0.92 ~ 0.97 (5%)
            else offset = 1;               // 0.97 ~ 1.00 (3%)
            
            const pillData = getPillFromAbsoluteIndex(userAbsIdx + offset);
            finalRealm = pillData.realm;
            finalSub = pillData.sub;
            finalGrade = pillData.grade;
            msg = `✨ 固本培元，炼成护基丹 (${offset > 0 ? '+'+offset : offset}阶)!`;
        }

    } else if (gachaTargetType === 'preservation') {
        // --- 保元丹：考虑使用者小境界的正态分布 ---
        // 1. 计算用户的精确底分 (10^Realm * 小境界系数)
        const userSubIdx = userStageToSubIndex(cultivation.stage);
        const userCoeff = getRealmBaseCoeff(userSubIdx);
        const userBase = userCoeff * Math.pow(10, cultivation.realmLevel);

        // 2. 计算保元丹 N 的底分 (作为目标，系数默认为 1)
        const pillBase = 1 * Math.pow(10, gachaTargetRealm);
        
        // 3. 计算跨度倍率与方差
        const ratio = Math.max(0.1, userBase / pillBase); // 允许越级(ratio < 1)，但设置最小值
        const variance = ratio * 1.5;
        const probs = calculatePreservationProbs(variance);
        
        finalRealm = gachaTargetRealm;
        
        // 4. 正态分布判定
        if (r < probs.fail) {
            msg = '💥 药力失衡，炼制出的保元丹当场碎裂。';
        } else {
            isSuccess = true;
            let acc = probs.fail;
            if (r < acc + probs.def) finalGrade = 'defective';
            else if (r < acc + probs.def + probs.fin) finalGrade = 'finished';
            else if (r < acc + probs.def + probs.fin + probs.fine) finalGrade = 'fine';
            else if (r < acc + probs.def + probs.fin + probs.fine + probs.rare) finalGrade = 'rare';
            else finalGrade = 'unique';
        }

    } else if (gachaTargetType === 'heavenly') {
        // --- 通天丹：炸炉 70% | 人品 20% | 地品 8% | 天品 2% ---
        finalRealm = cultivation.realmLevel + 1;
        if (r < 0.70) {
            msg = '🌩️ 强夺造化遭天谴，通天丹化为齑粉！';
        } else {
            isSuccess = true;
            if (r < 0.90) finalGrade = 'human';       // 0.70 ~ 0.90 (20%)
            else if (r < 0.98) finalGrade = 'earth';  // 0.90 ~ 0.98 (8%)
            else finalGrade = 'heaven';               // 0.98 ~ 1.00 (2%)
            msg = '🌈 天降祥瑞，夺天地造化成丹！';
        }
    }
    
    // 扣除真火
    setGachaState(prev => ({
        ...prev,
        fires: {
            ...prev.fires,
            [gachaTargetType]: prev.fires[gachaTargetType] - 1
        }
    }));
    if (isSuccess) {
        const newPill: Pill = {
            id: Date.now().toString(),
            type: gachaTargetType,
            realm: finalRealm,
            subRealm: finalSub,
            grade: finalGrade,
            timestamp: Date.now()
        };
        setInventory(prev =>[...prev, newPill]);
        setLastGachaResult({ pill: newPill, msg });
    } else {
        setLastGachaResult({ pill: null as any, msg });
    }
  };
  const renderSummary = (result: GameResult) => {
    return (
      <div className="modal-overlay" onClick={() => setShowSummary(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div style={{textAlign: 'center', marginBottom: 20}}>
            <h2 style={{margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8}}>
   训练报告 <span style={{fontSize: '0.8rem', background: '#3b82f6', color: 'white', padding: '2px 8px', borderRadius: 12}}>{MODE_LABELS[activeMode]}</span>
</h2>
            <div style={{color: '#64748b', margin: '8px 0', fontSize: '0.95rem'}}>
            {result.isVariable ? (
              <>Variable N ({result.variableDifficulty})</>
            ) : (
              <>N = {result.n}</>
            )}
            {' '}| 耗时: {result.sessionDuration?.toFixed(2)}s ({result.totalTrials}次)
            {' '}| 间隔: {result.interval.toFixed(2)}s 
          </div>

          {result.baseScore !== undefined && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 12 }}>
              {/* 奖杯旁边只放原分数纯数字，去掉中文 */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff7ed', color: '#ea580c', padding: '8px 20px', borderRadius: '32px', fontWeight: 700, fontSize: '1.5rem' }}>
                <Trophy size={20} style={{ strokeWidth: 2.5 }} /> 
                {formatScore(result.baseScore)}
              </div>
              
              {/* 下方附加加成说明 */}
              {result.bonusScore !== undefined && result.bonusScore > 0 && (
                  <div style={{ color: '#f59e0b', fontSize: '0.9rem', fontWeight: 700, marginTop: 4 }}>
                      (+{formatScore(result.bonusScore)} 丹药加成)
                  </div>
              )}
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

            {result.acquireLogs && result.acquireLogs.length > 0 && (
                <div className="summary-item" style={{background: '#ecfdf5', borderColor: '#a7f3d0'}}>
                    <div style={{fontWeight: 700, color: '#059669', marginBottom: 4}}>掉落详情</div>
                    {result.acquireLogs.map((log, i) => (
                        <div key={i} style={{fontSize: '0.85rem', marginBottom: 4, color: '#065f46', lineHeight: 1.4}}>• {log}</div>
                    ))}
                    <div style={{marginTop: 6, fontWeight: 700, fontSize: '0.85rem', color: '#059669'}}>
                        已收入储物袋：{result.pillAcquired?.map(p => getPillName(p)).join(', ')}
                    </div>
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
      
      // 【修改】：先根据当前的过滤器筛选丹药
      const pillsToProcess = inventoryFilter === 'all' 
          ? inventory 
          : inventory.filter(p => p.type === inventoryFilter);
      
      pillsToProcess.forEach(p => {
          // 强制标准化 Key 的生成，确保同类丹药合并
          const normRealm = Number(p.realm);
          const normSub = (p.subRealm !== undefined && p.subRealm !== null) ? Number(p.subRealm) : -1;
          const key = `${p.type}-${normRealm}-${normSub}-${p.grade}`;
          
          if (!groups.has(key)) {
              groups.set(key, { ...p, realm: normRealm, subRealm: normSub === -1 ? undefined : normSub as SubRealm, count: 0, ids: [] });
          }
          
          const g = groups.get(key)!;
          g.count++;
          g.ids.push(p.id);
      });
      
      const stackList = Array.from(groups.values());
      
      // 排序：境界高->低 > 小境界高->低 > 品级高->低
      return stackList.sort((a, b) => {
          if (b.realm !== a.realm) return b.realm - a.realm;
          
          const subA = (a.subRealm !== undefined && a.subRealm !== null) ? Number(a.subRealm) : -1;
          const subB = (b.subRealm !== undefined && b.subRealm !== null) ? Number(b.subRealm) : -1;
          
          if (subB !== subA) return subB - subA;
          
          const getGradeVal = (g: PillGrade, type: PillType) => {
              if (type === 'focus' || type === 'foundation') {
                  return g === 'real' ? 2 : 1;
              }
              if (type === 'preservation') {
                  const map: Record<string, number> = { unique: 5, rare: 4, fine: 3, finished: 2, defective: 1 };
                  return map[g] || 0;
              }
              const map: Record<string, number> = { low: 1, mid: 2, high: 3, peak: 4, human: 5, earth: 6, heaven: 7 };
              return map[g] || 0;
          };
          
          return getGradeVal(b.grade, b.type) - getGradeVal(a.grade, a.type);
      });
  }, [inventory, inventoryFilter]); // 【新增】将 inventoryFilter 加入依赖项

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
          
          const userMinor = Math.floor((userStage - 1) / 2);
          const userLevel = userRealm * 6 + userMinor * 2 + 0; // 用户瓶颈为虚品 (0)
          const pillLevel = pill.realm * 6 + (pill.subRealm ?? 0) * 2 + (pill.grade === 'real' ? 1 : 0);
          const diff = pillLevel - userLevel;
          
          if (diff < 0) return "❌ 无效：丹药境界低于当前瓶颈。";
          
          const rates = [72, 78, 86, 96, 100];
          return `✅ 生效：转化率提升至 ${rates[Math.min(4, diff)]}%。`;
      }
      
      if (pill.type === 'foundation') {
          if (![1, 3, 5].includes(userStage)) return "❌ 无效：当前不处于瓶颈期。";
          const userMinor = Math.floor((userStage - 1) / 2);
          
          const userLevel = userRealm * 6 + userMinor * 2 + 0;
          const pillLevel = pill.realm * 6 + (pill.subRealm ?? 0) * 2 + (pill.grade === 'real' ? 1 : 0);
          const diff = pillLevel - userLevel;

          if (diff >= 1) return `✨ 高阶药效：冲关倒退时修为完全锁定。`;
          if (diff === 0) return `✅ 同阶药效：大幅减缓倒退 (0.75 / 0.25)。`;
          if (diff === -1) return `✅ 低阶药效：减缓倒退 (0.5 / 0.5)。`;
          if (diff === -2) return `⚠️ 残效保护：微弱减缓倒退 (0.25 / 0.75)。`;
          return "❌ 无效：丹药境界过低。";
      }

      if (pill.type === 'preservation') {
          const bases = { unique: 16, rare: 22, fine: 30, finished: 40, defective: 52 };
          return `✅ 生效：得分算法底数降至 ${bases[pill.grade as keyof typeof bases] || 64} (限难度N≤${pill.realm}时有效)。`;
      }
      
      if (pill.type === 'heavenly') {
           if (userStage === 6 || userStage === 7) {
               if (pill.realm > userRealm) {
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
            <button className="btn btn-secondary" onClick={() => setShowGacha(true)} style={{position: 'relative',padding: '6px 10px', fontSize: '0.9rem', color: '#7c3aed'}}>
                <Gift size={16} /> 坊市
                {(() => {
                    const reqTime = getFireReqTime((gachaState.selectedFireTypes ||['spirit', 'focus', 'foundation', 'preservation', 'heavenly']).length);
                    const claimable = Math.floor((gachaState.accumulatedTime || 0) / reqTime);
                    return claimable > 0 ? (
                        <span style={{background: '#ef4444', color: 'white', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', top: -6, right: -6, fontWeight: 700, boxShadow: '0 2px 4px rgba(0,0,0,0.2)'}}>
                            {claimable}
                        </span>
                    ) : null;
                })()}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowMilestones(true)} style={{padding: '6px 10px', fontSize: '0.9rem'}}>
              <Scroll size={16} /> 仙途
            </button>
            <button className="btn btn-secondary" onClick={() => setShowHistory(true)} style={{padding: '6px 10px', fontSize: '0.9rem'}}>
              <History size={16} /> 记录
            </button>
            <button className="btn btn-secondary" onClick={() => setShowGlobalHistory(true)} style={{padding: '6px 10px', fontSize: '0.9rem', color: '#0369a1'}}>
              <Activity size={16} /> 综合
            </button>
          </div>
        </header>
      )}
      {/* 顶部模式导航 */}
      {!isPlaying && (
        <div style={{display: 'flex', gap: 8, padding: '0 4px 16px', maxWidth: 600, alignSelf: 'center', width: '100%'}}>
          {Object.keys(MODE_LABELS).map(mKey => (
             <button
               key={mKey}
               onClick={() => setActiveMode(mKey as PlayMode)}
               style={{
                  flex: 1, padding: '8px 0', borderRadius: '12px',
                  background: activeMode === mKey ? '#3b82f6' : '#fff',
                  color: activeMode === mKey ? 'white' : '#64748b',
                  fontWeight: activeMode === mKey ? 700 : 500,
                  border: activeMode === mKey ? 'none' : '1px solid #cbd5e1',
                  boxShadow: activeMode === mKey ? '0 2px 4px rgba(59,130,246,0.3)' : 'none',
                  cursor: 'pointer', transition: 'all 0.2s'
               }}
             >{MODE_LABELS[mKey as PlayMode]}</button>
          ))}
        </div>
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
                          onClick={() => setInterval(prev => Math.max(1.00, parseFloat((prev - 0.05).toFixed(2))))}>-</button>
                  <input 
                      type="number"
                      className="val-input"
                      value={interval}
                      onChange={e => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v >= 0.1) setInterval(v);
                      }}
                      step="0.05"
                  />
                  <button className="btn btn-secondary" style={{padding: '6px 10px'}} 
                          onClick={() => setInterval(prev => parseFloat((prev + 0.05).toFixed(2)))}>+</button>
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
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
                    <h2 style={{margin: 0, fontSize: '1.25rem'}}>储物袋</h2>
                    <button style={{background: 'none', border: 'none', color: '#64748b', cursor: 'pointer'}} onClick={() => setShowInventory(false)}>
                        <X />
                    </button>
                </div>

                {/* --- 新增：分类导航栏 --- */}
                <div style={{display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 12}}>
                    {[
                        { id: 'all', label: '全部' },
                        { id: 'spirit', label: '经验' },
                        { id: 'focus', label: '冲关' },
                        { id: 'foundation', label: '护基' },
                        { id: 'preservation', label: '保元' },
                        { id: 'heavenly', label: '渡劫' }
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setInventoryFilter(f.id as PillType | 'all')}
                            style={{
                                padding: '4px 10px',
                                borderRadius: '12px',
                                border: '1px solid',
                                borderColor: inventoryFilter === f.id ? '#3b82f6' : '#cbd5e1',
                                background: inventoryFilter === f.id ? '#eff6ff' : '#f8fafc',
                                color: inventoryFilter === f.id ? '#2563eb' : '#64748b',
                                fontSize: '0.8rem',
                                fontWeight: inventoryFilter === f.id ? 700 : 500,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* --- 列表为空的智能提示 --- */}
                {groupedInventory.length === 0 ? (
                    <div style={{textAlign: 'center', padding: '40px 0', color: '#94a3b8'}}>
                        <Briefcase size={40} style={{margin: '0 auto 10px', opacity: 0.5}} />
                        <p>{inventory.length === 0 ? '储物袋空空如也' : '该分类下暂无丹药'}</p>
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
                                                {stack.type === 'spirit' ? '经验' : stack.type === 'focus' ? '冲关' : stack.type === 'foundation' ? '护基' : stack.type === 'preservation' ? '保元' : '渡劫'}
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
                    <h2 style={{margin: 0, fontSize: '1.25rem'}}>坊市炼丹</h2>
                    <button style={{background: 'none', border: 'none', color: '#64748b', cursor: 'pointer'}} onClick={() => setShowGacha(false)}>
                        <X />
                    </button>
                </div>
                
                <div style={{padding: '10px 0'}}>
                    {/* --- 真火库存概览 --- */}
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 20}}>
                        {[
                            {id: 'spirit', label: '灵元真火', color: '#3b82f6'},
                            {id: 'focus', label: '凝神真火', color: '#d946ef'},
                            {id: 'foundation', label: '护基真火', color: '#16a34a'},
                            {id: 'preservation', label: '保元真火', color: '#ea580c'},
                            {id: 'heavenly', label: '通天真火', color: '#9a3412'}
                        ].map(t => (
                            <div key={t.id} style={{background: '#f8fafc', padding: '6px 10px', borderRadius: 8, border: `1px solid ${t.color}40`, fontSize: '0.8rem', color: '#475569'}}>
                                {t.label}: <span style={{fontWeight: 800, color: t.color, marginLeft: 4}}>{(gachaState.fires || {})[t.id as PillType] || 0}</span>
                            </div>
                        ))}
                    </div>

                    {/* --- 天地熔炉：真火凝聚设置 --- */}
                    <div style={{background: '#fffbeb', padding: 16, borderRadius: 12, border: '1px solid #fde68a', marginBottom: 24}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
                            <span style={{fontSize: '0.9rem', fontWeight: 700, color: '#b45309'}}>天地熔炉 (真火牵引)</span>
                            <span style={{fontSize: '0.8rem', color: '#d97706', fontWeight: 600}}>
                                效率: {getFireReqTime((gachaState.selectedFireTypes ||[]).length) / 60} 分钟 / 朵
                            </span>
                        </div>
                        <div style={{display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, justifyContent: 'center'}}>
                            {[
                                {id: 'spirit', label: '灵元'}, {id: 'focus', label: '凝神'}, 
                                {id: 'foundation', label: '护基'}, {id: 'preservation', label: '保元'}, 
                                {id: 'heavenly', label: '通天'}
                            ].map(t => {
                                const isActive = (gachaState.selectedFireTypes ||[]).includes(t.id as PillType);
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => {
                                            setGachaState((prev: any) => {
                                                const sel = prev.selectedFireTypes || ['spirit', 'focus', 'foundation', 'preservation', 'heavenly'];
                                                if (sel.includes(t.id)) {
                                                    if (sel.length <= 1) { alert("天道无常，但熔炉不可熄灭（至少保留一种真火）。"); return prev; }
                                                    return { ...prev, selectedFireTypes: sel.filter((x: string) => x !== t.id) };
                                                } else {
                                                    return { ...prev, selectedFireTypes: [...sel, t.id] };
                                                }
                                            });
                                        }}
                                        style={{
                                            padding: '4px 12px', borderRadius: '16px', border: '1px solid',
                                            borderColor: isActive ? '#f59e0b' : '#cbd5e1',
                                            background: isActive ? '#fffbeb' : '#f1f5f9',
                                            color: isActive ? '#b45309' : '#94a3b8',
                                            fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                                        }}
                                    >
                                        {t.label}
                                    </button>
                                )
                            })}
                        </div>
                        {/* 进度条与提取按钮 */}
                        {(() => {
                            const selTypes = gachaState.selectedFireTypes ||['spirit', 'focus', 'foundation', 'preservation', 'heavenly'];
                            const reqTime = getFireReqTime(selTypes.length);
                            const claimable = Math.floor((gachaState.accumulatedTime || 0) / reqTime);
                            const progressPct = Math.min(100, ((gachaState.accumulatedTime || 0) / reqTime) * 100);

                            return (
                                <div style={{marginTop: 12}}>
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6}}>
                                        <div style={{fontSize: '0.75rem', color: '#b45309', fontWeight: 600}}>
                                            凝聚进度: {((gachaState.accumulatedTime || 0) / 60).toFixed(1)} / {(reqTime / 60).toFixed(1)} 分钟
                                        </div>
                                        {claimable > 0 && (
                                            <span style={{fontSize: '0.75rem', color: '#ef4444', fontWeight: 800}}>
                                                可收取: {claimable} 朵
                                            </span>
                                        )}
                                    </div>
                                    <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
                                        {/* 进度条主体 */}
                                        <div style={{flex: 1, height: 8, background: '#fef3c7', borderRadius: 4, overflow: 'hidden'}}>
                                            <div style={{
                                                height: '100%', 
                                                background: claimable > 0 ? '#ef4444' : 'linear-gradient(90deg, #f59e0b, #ef4444)', 
                                                width: \`\${progressPct}%\`, 
                                                transition: 'width 0.3s'
                                            }} />
                                        </div>
                                        {/* 提取按钮 */}
                                        <button 
                                            onClick={handleClaimFire}
                                            disabled={claimable <= 0}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: claimable > 0 ? '#ef4444' : '#fcd34d',
                                                color: claimable > 0 ? 'white' : '#b45309',
                                                fontWeight: 800,
                                                fontSize: '0.8rem',
                                                cursor: claimable > 0 ? 'pointer' : 'not-allowed',
                                                boxShadow: claimable > 0 ? '0 2px 6px rgba(239, 68, 68, 0.4)' : 'none',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            收取真火
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}

                    {/* --- 炼制操作区 --- */}
                    <div style={{background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 24}}>
                        <div style={{fontSize: '0.9rem', fontWeight: 600, marginBottom: 12, color: '#475569'}}>研习丹方</div>
                        
                        {/* 丹药大类选择 */}
                        <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginBottom: 16}}>
                            {[
                                {id: 'spirit', label: '灵元丹'}, {id: 'focus', label: '凝神丹'}, 
                                {id: 'foundation', label: '护基丹'}, {id: 'preservation', label: '保元丹'}, 
                                {id: 'heavenly', label: '通天丹'}
                            ].map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => { setGachaTargetType(t.id as PillType); setLastGachaResult(null); }}
                                    style={{
                                        padding: '6px 12px', borderRadius: '8px', border: '1px solid',
                                        borderColor: gachaTargetType === t.id ? '#8b5cf6' : '#cbd5e1',
                                        background: gachaTargetType === t.id ? '#ede9fe' : 'white',
                                        color: gachaTargetType === t.id ? '#6d28d9' : '#64748b',
                                        fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer'
                                    }}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* --- 动态渲染每种丹药的配置与概率 --- */}
                        {(() => {
                            const userSub = userStageToSubIndex(cultivation.stage);
                            const uli = cultivation.realmLevel * 6 + userSub * 2;
                            const subNames =['前期', '中期', '后期', '圆满', '大圆满'];

                            if (gachaTargetType === 'spirit') {
                                const uBase = calculateBaseScore(cultivation.realmLevel, userSub);
                                const pBase = calculateBaseScore(gachaTargetRealm, gachaTargetSub);
                                const variance = Math.max(1, uBase / pBase) * 1.5;
                                const probs = calculatePillProbabilities(variance);
                                return (
                                    <>
                                        <div style={{display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16}}>
                                            <select value={gachaTargetRealm} onChange={(e) => { setGachaTargetRealm(parseInt(e.target.value)); setGachaTargetSub(0); }} style={{padding: '6px', borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none'}}>
                                                {Array.from({length: Math.max(1, cultivation.realmLevel)}).map((_, i) => <option key={i+1} value={i+1}>{REALMS[i+1]}</option>)}
                                            </select>
                                            <select value={gachaTargetSub} onChange={(e) => setGachaTargetSub(parseInt(e.target.value))} style={{padding: '6px', borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none'}}>
                                                {[0,1,2,3,4].map(idx => {
                                                    if (gachaTargetRealm === cultivation.realmLevel && idx > userSub) return null;
                                                    return <option key={idx} value={idx}>{['前期', '中期', '后期', '圆满', '大圆满'][idx]}</option>;
                                                })}
                                            </select>
                                        </div>
                                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6}}>
                                            <div style={{background: '#f1f5f9', padding: '8px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#64748b'}}>下品</div><div style={{fontWeight: 800, color: '#334155'}}>{(probs.low * 100).toFixed(1)}%</div></div>
                                            <div style={{background: '#e0f2fe', padding: '8px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#0369a1'}}>中品</div><div style={{fontWeight: 800, color: '#0284c7'}}>{(probs.mid * 100).toFixed(1)}%</div></div>
                                            <div style={{background: '#fae8ff', padding: '8px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#a21caf'}}>上品</div><div style={{fontWeight: 800, color: '#d946ef'}}>{(probs.high * 100).toFixed(1)}%</div></div>
                                            <div style={{background: '#fffbeb', padding: '8px 0', borderRadius: 6, border: '1px solid #fcd34d'}}><div style={{fontSize: '0.7rem', color: '#b45309'}}>极品</div><div style={{fontWeight: 800, color: '#d97706'}}>{(probs.peak * 100).toFixed(1)}%</div></div>
                                        </div>
                                        <div style={{fontSize: '0.7rem', color: '#94a3b8', marginTop: 8}}>灵元丹不具危险，百分百成功出炉。</div>
                                    </>
                                );
                            }

                            if (gachaTargetType === 'focus') {
                                return (
                                    <>
                                        <div style={{marginBottom: 16, fontWeight: 700, color: '#9d174d', background: '#fce7f3', padding: '8px', borderRadius: 8}}>
                                            目标区间：当前等级 ~ 高四级
                                        </div>
                                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6}}>
                                            <div style={{background: '#fee2e2', padding: '6px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#b91c1c'}}>炸炉 (失败)</div><div style={{fontWeight: 800, color: '#991b1b'}}>65.0%</div></div>
                                            <div style={{background: '#f1f5f9', padding: '6px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#64748b'}}>同阶</div><div style={{fontWeight: 800, color: '#334155'}}>20.0%</div></div>
                                            <div style={{background: '#e0f2fe', padding: '6px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#0369a1'}}>高1阶</div><div style={{fontWeight: 800, color: '#0284c7'}}>10.0%</div></div>
                                        </div>
                                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6}}>
                                            <div style={{background: '#fae8ff', padding: '6px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#a21caf'}}>高2阶</div><div style={{fontWeight: 800, color: '#d946ef'}}>3.5%</div></div>
                                            <div style={{background: '#fef3c7', padding: '6px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#b45309'}}>高3阶</div><div style={{fontWeight: 800, color: '#d97706'}}>1.0%</div></div>
                                            <div style={{background: '#ffedd5', padding: '6px 0', borderRadius: 6, border: '1px solid #fb923c'}}><div style={{fontSize: '0.7rem', color: '#9a3412'}}>高4阶 (神迹)</div><div style={{fontWeight: 800, color: '#c2410c'}}>0.5%</div></div>
                                        </div>
                                        <div style={{fontSize: '0.7rem', color: '#94a3b8', marginTop: 8}}>风险极高，但有望炼出跨大境界神药。</div>
                                    </>
                                );
                            }

                            if (gachaTargetType === 'foundation') {
                                return (
                                    <>
                                        <div style={{marginBottom: 16, fontWeight: 700, color: '#3f6212', background: '#ecfccb', padding: '8px', borderRadius: 8}}>
                                            目标区间：低二级 ~ 高一级
                                        </div>
                                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4}}>
                                            <div style={{background: '#fee2e2', padding: '8px 0', borderRadius: 6}}><div style={{fontSize: '0.65rem', color: '#b91c1c'}}>炸炉</div><div style={{fontWeight: 700, fontSize: '0.75rem', color: '#991b1b'}}>50%</div></div>
                                            <div style={{background: '#f1f5f9', padding: '8px 0', borderRadius: 6}}><div style={{fontSize: '0.65rem', color: '#64748b'}}>低2阶</div><div style={{fontWeight: 700, fontSize: '0.75rem', color: '#334155'}}>30%</div></div>
                                            <div style={{background: '#e0f2fe', padding: '8px 0', borderRadius: 6}}><div style={{fontSize: '0.65rem', color: '#0369a1'}}>低1阶</div><div style={{fontWeight: 700, fontSize: '0.75rem', color: '#0284c7'}}>12%</div></div>
                                            <div style={{background: '#dcfce7', padding: '8px 0', borderRadius: 6}}><div style={{fontSize: '0.65rem', color: '#15803d'}}>同阶</div><div style={{fontWeight: 700, fontSize: '0.75rem', color: '#166534'}}>5%</div></div>
                                            <div style={{background: '#fef3c7', padding: '8px 0', borderRadius: 6}}><div style={{fontSize: '0.65rem', color: '#b45309'}}>高1阶</div><div style={{fontWeight: 700, fontSize: '0.75rem', color: '#d97706'}}>3%</div></div>
                                        </div>
                                        <div style={{fontSize: '0.7rem', color: '#94a3b8', marginTop: 8}}>主要用于炼制低阶保底药效。</div>
                                    </>
                                );
                            }

                            if (gachaTargetType === 'preservation') {
                                const userSub = userStageToSubIndex(cultivation.stage);
                                const uBase = getRealmBaseCoeff(userSub) * Math.pow(10, cultivation.realmLevel);
                                const pBase = 1 * Math.pow(10, gachaTargetRealm); 
                                const ratio = uBase / pBase;
                                const variance = Math.max(0.1, ratio) * 1.5;
                                const probs = calculatePreservationProbs(variance);
                                
                                return (
                                    <>
                                        <div style={{display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16}}>
                                            <span style={{fontSize: '0.85rem', alignSelf: 'center'}}>炼制 N =</span>
                                            <select value={gachaTargetRealm} onChange={e => setGachaTargetRealm(parseInt(e.target.value))} style={{padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none', fontWeight: 600, background: 'white'}}>
                                                {Array.from({length: cultivation.realmLevel + 2}).map((_, i) => (
                                                    <option key={i+1} value={i+1}>{i+1} ({REALMS[i+1] || '未知'})</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <div style={{fontSize: '0.75rem', color: '#94a3b8', marginBottom: 10}}>
                                                炼制方差: σ² = {variance.toFixed(2)} ({ratio.toFixed(2)}x 跨度)
                                            </div>
                                            <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 6}}>
                                                <div style={{background: '#fee2e2', padding: '6px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#b91c1c'}}>炸炉</div><div style={{fontWeight: 800, color: '#991b1b'}}>{(probs.fail * 100).toFixed(1)}%</div></div>
                                                <div style={{background: '#f1f5f9', padding: '6px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#64748b'}}>次品</div><div style={{fontWeight: 800, color: '#334155'}}>{(probs.def * 100).toFixed(1)}%</div></div>
                                                <div style={{background: '#e0f2fe', padding: '6px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#0369a1'}}>成品</div><div style={{fontWeight: 800, color: '#0284c7'}}>{(probs.fin * 100).toFixed(1)}%</div></div>
                                            </div>
                                            <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6}}>
                                                <div style={{background: '#dcfce7', padding: '6px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#15803d'}}>精品</div><div style={{fontWeight: 800, color: '#166534'}}>{(probs.fine * 100).toFixed(1)}%</div></div>
                                                <div style={{background: '#fae8ff', padding: '6px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#a21caf'}}>珍品</div><div style={{fontWeight: 800, color: '#d946ef'}}>{(probs.rare * 100).toFixed(1)}%</div></div>
                                                <div style={{background: '#fffbeb', padding: '6px 0', borderRadius: 6, border: '1px solid #fcd34d'}}><div style={{fontSize: '0.7rem', color: '#b45309'}}>孤品</div><div style={{fontWeight: 800, color: '#d97706'}}>{(probs.uni * 100).toFixed(1)}%</div></div>
                                            </div>
                                        </div>
                                    </>
                                );
                            }

                            if (gachaTargetType === 'heavenly') {
                                const probs = getHeavenlyProbs();
                                return (
                                    <>
                                        <div style={{marginBottom: 16, fontWeight: 700, color: '#9a3412', background: '#ffedd5', padding: '8px', borderRadius: 8}}>
                                            目标: {REALMS[cultivation.realmLevel + 1]}·通天渡厄丹
                                        </div>
                                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6}}>
                                            <div style={{background: '#fee2e2', padding: '8px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#b91c1c'}}>炸炉</div><div style={{fontWeight: 800, color: '#991b1b'}}>{(probs.fail * 100).toFixed(0)}%</div></div>
                                            <div style={{background: '#f1f5f9', padding: '8px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#64748b'}}>人品</div><div style={{fontWeight: 800, color: '#334155'}}>{(probs.human * 100).toFixed(0)}%</div></div>
                                            <div style={{background: '#e0f2fe', padding: '8px 0', borderRadius: 6}}><div style={{fontSize: '0.7rem', color: '#0369a1'}}>地品</div><div style={{fontWeight: 800, color: '#0284c7'}}>{(probs.earth * 100).toFixed(0)}%</div></div>
                                            <div style={{background: '#fffbeb', padding: '8px 0', borderRadius: 6, border: '1px solid #fcd34d'}}><div style={{fontSize: '0.7rem', color: '#b45309'}}>天品</div><div style={{fontWeight: 800, color: '#d97706'}}>{(probs.heaven * 100).toFixed(0)}%</div></div>
                                        </div>
                                        <div style={{fontSize: '0.7rem', color: '#94a3b8', marginTop: 12}}>极易遭受天谴炸炉。成功后随机赋予天地人三品。</div>
                                    </>
                                );
                            }
                        })()}
                    </div>
                    
                    <button 
                        className="btn btn-primary" 
                        style={{width: '80%', margin: '0 auto', justifyContent: 'center', padding: 14, background: (gachaState.fires || {})[gachaTargetType] > 0 ? '#7c3aed' : '#cbd5e1', cursor: (gachaState.fires || {})[gachaTargetType] > 0 ? 'pointer' : 'not-allowed'}}
                        onClick={handleGachaDraw}
                        disabled={(gachaState.fires || {})[gachaTargetType] <= 0}
                    >
                        {(gachaState.fires || {})[gachaTargetType] > 0 ? `消耗 1 朵${{'spirit':'灵元','focus':'凝神','foundation':'护基','preservation':'保元','heavenly':'通天'}[gachaTargetType]}真火炼制` : '该类真火不足'}
                    </button>
                    
                    {lastGachaResult && (
                        <div style={{marginTop: 20, animation: 'fadeIn 0.5s'}}>
                            <div style={{fontSize: '0.85rem', color: lastGachaResult.pill ? '#059669' : '#dc2626', fontWeight: 600, marginBottom: 4}}>
                                {lastGachaResult.msg}
                            </div>
                            {lastGachaResult.pill && (
                                <div style={{padding: '10px 16px', border: '1px solid #10b981', background: '#ecfdf5', borderRadius: 8, display: 'inline-block', fontWeight: 700, color: '#065f46'}}>
                                    {getPillName(lastGachaResult.pill)}
                                </div>
                            )}
                        </div>
                    )}
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
                {milestones.slice().sort((a, b) => b.timestamp - a.timestamp).map(m => ( // 【修改点】使用 sort 强制按时间倒序
                  <div key={m.id} className={`milestone-item ${m.type}`}>
                    <div className="milestone-date">
                      <span>{formatDateTime(m.timestamp)}</span>
                    </div>
                    <div className="milestone-title">{m.title}</div>
                    {/* 之前这里可能被简写了，现在确保正确显示描述 */}
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
      {/* Global Comprehensive History Modal */}
      {showGlobalHistory && (
        <div className="modal-overlay" onClick={() => setShowGlobalHistory(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ 
              maxHeight: '85vh', 
              display: 'flex', 
              flexDirection: 'column',
              padding: '20px 16px' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0369a1', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={22} /> 诸天综合卷宗
              </h2>
              <button style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }} onClick={() => setShowGlobalHistory(false)}>
                <X size={24} />
              </button>
            </div>

            {/* 增加显式的滚动容器 */}
            <div style={{ 
                overflowY: 'auto', 
                flex: 1, 
                paddingRight: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
            }}>
              {(() => {
                const dayMap = new Map();
                
                // 遍历所有模式进行聚合
                Object.keys(masterData.modes).forEach(mKey => {
                  const modeHistory = masterData.modes[mKey].history || [];
                  modeHistory.forEach((run: GameResult) => {
                    const dStr = new Date(run.timestamp).toLocaleDateString('zh-CN');
                    if (!dayMap.has(dStr)) dayMap.set(dStr, { totalTime: 0, modes: {} });
                    
                    const dData = dayMap.get(dStr);
                    const rTime = run.sessionDuration || (run.totalTrials * (run.interval || 1));
                    dData.totalTime += rTime;
                    
                    if (!dData.modes[mKey]) dData.modes[mKey] = { time: 0, startRun: run, endRun: run };
                    const mData = dData.modes[mKey];
                    mData.time += rTime;
                    // 记录这一天中该模式的第一局和最后一局
                    if (run.timestamp < mData.startRun.timestamp) mData.startRun = run;
                    if (run.timestamp > mData.endRun.timestamp) mData.endRun = run;
                  });
                });
                
                const sortedDays = Array.from(dayMap.entries()).sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
                
                if (sortedDays.length === 0) return <div style={{textAlign: 'center', color: '#94a3b8', padding: 40}}>大道无痕，暂无修炼记录</div>;

                return sortedDays.map(([dateStr, dData]) => (
                  <div key={dateStr} style={{ border: '1px solid #bae6fd', borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
                    {/* 日期标题 */}
                    <div style={{ background: '#f0f9ff', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #bae6fd' }}>
                      <span style={{ fontWeight: 700, color: '#0c4a6e', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Calendar size={14} /> {dateStr}
                      </span>
                      <span style={{ color: '#0284c7', fontSize: '0.85rem', fontWeight: 600 }}>今日总修: {formatDuration(dData.totalTime)}</span>
                    </div>
                    
                    {/* 模式明细 */}
                    <div style={{ padding: '8px 12px', background: 'white', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {Object.keys(dData.modes).map(mKey => {
                        const mData = dData.modes[mKey];
                        const sRun = mData.startRun;
                        const eRun = mData.endRun;
                        
                        // 计算进度文字
                        const progText = formatProgressChange(
                          sRun.realmLevel, sRun.stage, sRun.beforeXP,
                          eRun.afterRealmLevel ?? eRun.realmLevel, eRun.afterStage ?? eRun.stage, eRun.afterXP,
                          'percent'
                        );

                        return (
                          <div key={mKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, width: 56, textAlign: 'center' }}>
                                  {MODE_LABELS[mKey as PlayMode]}
                                </span>
                                <span style={{ color: '#1e293b', fontWeight: 600 }}>{formatDuration(mData.time)}</span>
                              </div>
                            </div>
                            <div style={{ color: '#0ea5e9', fontWeight: 600, fontSize: '0.8rem', textAlign: 'right', maxWidth: '60%' }}>
                              {progText}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<Game />);

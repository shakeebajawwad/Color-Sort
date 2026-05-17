import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Trophy, RotateCcw, Lightbulb, Play, ChevronLeft, Volume2, VolumeX, Medal, Star } from 'lucide-react';
import confetti from 'canvas-confetti';

// --- Types ---
type Color = 'blue' | 'red' | 'emerald' | 'amber' | 'violet' | 'pink' | 'orange' | 'cyan';
type TubeData = Color[];
type LevelStatus = 'locked' | 'unlocked' | 'completed';

interface Level {
  id: number;
  tubes: TubeData[];
  targetColors: number;
}

// --- Constants & Level Data ---
const TUBE_CAPACITY = 4;

const COLORS: Color[] = ['blue', 'red', 'emerald', 'amber', 'violet', 'pink', 'orange', 'cyan'];

const COLOR_CLASSES: Record<Color, string> = {
  blue: 'bg-l-blue',
  red: 'bg-l-red',
  emerald: 'bg-l-emerald',
  amber: 'bg-l-amber',
  violet: 'bg-l-violet',
  pink: 'bg-l-pink',
  orange: 'bg-l-orange',
  cyan: 'bg-l-cyan',
};

// Preset Level Data to ensure high quality start
const PRESET_LEVELS: TubeData[][] = [
  // Level 1: Very easy
  [['red', 'blue', 'red', 'blue'], ['blue', 'red', 'blue', 'red'], [], []],
  // Level 2
  [['emerald', 'blue', 'emerald', 'blue'], ['blue', 'emerald', 'blue', 'emerald'], ['red', 'red', 'red', 'red'], [], []],
];

const generateLevels = (): Level[] => {
  const levels: Level[] = [];
  
  for (let i = 1; i <= 20; i++) {
    const colorCount = Math.min(COLORS.length, Math.floor((i - 1) / 3) + 3); 
    const emptyCount = 2;
    
    // For the first 2 preset levels
    if (i <= PRESET_LEVELS.length) {
      levels.push({
        id: i,
        tubes: PRESET_LEVELS[i-1],
        targetColors: PRESET_LEVELS[i-1].filter(t => t.length > 0).length
      });
      continue;
    }

    // Procedural generation (random distribution - usually solvable with 2 empty tubes)
    let pool: Color[] = [];
    for (let c = 0; c < colorCount; c++) {
      for (let j = 0; j < TUBE_CAPACITY; j++) {
        pool.push(COLORS[c]);
      }
    }
    
    pool = pool.sort(() => Math.random() - 0.5);
    
    const tubes: TubeData[] = [];
    for (let t = 0; t < colorCount; t++) {
      tubes.push(pool.slice(t * TUBE_CAPACITY, (t + 1) * TUBE_CAPACITY));
    }
    for (let t = 0; t < emptyCount; t++) {
      tubes.push([]);
    }
    
    levels.push({
      id: i,
      tubes,
      targetColors: colorCount
    });
  }
  
  return levels;
};

const LEVELS = generateLevels();

// --- Components ---

export default function App() {
  const [screen, setScreen] = useState<'menu' | 'levels' | 'game'>('menu');
  const [currentLevelIdx, setCurrentLevelIdx] = useState(0);
  const [tubes, setTubes] = useState<TubeData[]>([]);
  const [selectedTubeIdx, setSelectedTubeIdx] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [undoStack, setUndoStack] = useState<TubeData[][]>([]);
  const [isWon, setIsWon] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [progress, setProgress] = useState<Record<number, LevelStatus>>(() => {
    const saved = localStorage.getItem('chromasort_progress');
    if (saved) return JSON.parse(saved);
    return { 1: 'unlocked' };
  });

  // Load level
  const loadLevel = useCallback((idx: number) => {
    const level = LEVELS[idx];
    setTubes(level.tubes.map(t => [...t]));
    setCurrentLevelIdx(idx);
    setMoves(0);
    setUndoStack([]);
    setSelectedTubeIdx(null);
    setIsWon(false);
    setScreen('game');
  }, []);

  // Check Win Condition
  useEffect(() => {
    if (tubes.length === 0 || screen !== 'game') return;

    const allSorted = tubes.every(tube => {
      if (tube.length === 0) return true;
      if (tube.length < TUBE_CAPACITY) return false;
      return tube.every(color => color === tube[0]);
    });

    if (allSorted && !isWon) {
      setIsWon(true);
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#38bdf8', '#10b981', '#f59e0b', '#ec4899']
      });
      
      // Update progress
      const nextLevelId = LEVELS[currentLevelIdx].id + 1;
      const newProgress = { ...progress };
      newProgress[LEVELS[currentLevelIdx].id] = 'completed';
      if (nextLevelId <= LEVELS.length && !newProgress[nextLevelId]) {
        newProgress[nextLevelId] = 'unlocked';
      }
      setProgress(newProgress);
      localStorage.setItem('chromasort_progress', JSON.stringify(newProgress));
    }
  }, [tubes, currentLevelIdx, progress, isWon, screen]);

  // Game Logic: Pouring
  const handleTubeClick = (idx: number) => {
    if (isWon) return;

    if (selectedTubeIdx === null) {
      if (tubes[idx].length > 0) {
        setSelectedTubeIdx(idx);
      }
    } else {
      if (selectedTubeIdx === idx) {
        setSelectedTubeIdx(null);
        return;
      }

      const sourceTube = tubes[selectedTubeIdx];
      const destTube = tubes[idx];

      if (destTube.length === TUBE_CAPACITY) {
        setSelectedTubeIdx(idx);
        return;
      }

      const sourceColor = sourceTube[sourceTube.length - 1];
      const destColor = destTube[destTube.length - 1];

      if (destTube.length === 0 || destColor === sourceColor) {
        // Valid move
        const newTubes = tubes.map(t => [...t]);
        const colorToMove = sourceColor;
        
        // Find how many of the same color can be moved
        let moveCount = 0;
        let tempSource = [...sourceTube];
        while (tempSource.length > 0 && tempSource[tempSource.length - 1] === colorToMove && (destTube.length + moveCount) < TUBE_CAPACITY) {
          tempSource.pop();
          moveCount++;
        }

        if (moveCount > 0) {
          // Push to undo stack
          setUndoStack([...undoStack, tubes.map(t => [...t])]);
          
          const updatedSource = [...sourceTube];
          const updatedDest = [...destTube];
          for (let i = 0; i < moveCount; i++) {
            updatedSource.pop();
            updatedDest.push(colorToMove);
          }
          
          const finalTubes = tubes.map((t, i) => {
            if (i === selectedTubeIdx) return updatedSource;
            if (i === idx) return updatedDest;
            return t;
          });

          setTubes(finalTubes);
          setMoves(m => m + 1);
          setSelectedTubeIdx(null);
        } else {
          setSelectedTubeIdx(idx);
        }
      } else {
        setSelectedTubeIdx(idx);
      }
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0 || isWon) return;
    const lastState = undoStack[undoStack.length - 1];
    setTubes(lastState);
    setUndoStack(undoStack.slice(0, -1));
    setMoves(m => m + 1);
    setSelectedTubeIdx(null);
  };

  const [hint, setHint] = useState<{ from: number; to: number } | null>(null);

  const handleHint = () => {
    // Find first valid move
    for (let i = 0; i < tubes.length; i++) {
      if (tubes[i].length === 0) continue;
      const color = tubes[i][tubes[i].length - 1];
      
      for (let j = 0; j < tubes.length; j++) {
        if (i === j) continue;
        if (tubes[j].length < TUBE_CAPACITY) {
          if (tubes[j].length === 0 || tubes[j][tubes[j].length - 1] === color) {
            setHint({ from: i, to: j });
            setTimeout(() => setHint(null), 1500);
            return;
          }
        }
      }
    }
  };

  // --- Screens ---

  if (screen === 'menu') {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center p-6 bg-brand-bg relative overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center z-10"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
             <div className="w-4 h-12 bg-sky-500 rounded-full"></div>
             <h1 className="text-6xl font-black italic tracking-tighter text-white">CHROMASORT</h1>
          </div>
          <p className="text-sky-500/60 font-medium tracking-[0.4em] uppercase text-xs mb-12">Liquid Intelligence</p>

          <div className="flex flex-col gap-4 w-full max-w-xs">
            <button 
              onClick={() => setScreen('levels')}
              className="bg-sky-500 hover:bg-sky-400 text-white py-6 rounded-2xl font-black shadow-2xl shadow-sky-500/40 tracking-[0.2em] text-sm transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-3"
            >
              <Play className="fill-current w-5 h-5" />
              START GAME
            </button>
            
            <div className="flex gap-3">
              <button 
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="glass flex-1 py-4 rounded-2xl flex items-center justify-center btn-hover text-white/70"
              >
                {soundEnabled ? <Volume2 /> : <VolumeX />}
              </button>
              <button className="glass flex-1 py-4 rounded-2xl flex items-center justify-center btn-hover text-white/70">
                <Settings />
              </button>
            </div>
          </div>
        </motion.div>

        <div className="mt-12 flex gap-2">
           {[...Array(5)].map((_, i) => (
             <div key={i} className={`w-3 h-3 rounded-full ${i === 0 ? 'bg-sky-500 shadow-lg shadow-sky-500/50' : 'bg-slate-700'}`}></div>
           ))}
        </div>
      </div>
    );
  }

  if (screen === 'levels') {
    return (
      <div className="min-h-screen w-full bg-brand-bg p-8 flex flex-col items-center">
         <header className="w-full max-w-4xl flex justify-between items-center mb-12">
            <button onClick={() => setScreen('menu')} className="glass w-12 h-12 rounded-xl flex items-center justify-center btn-hover">
               <ChevronLeft />
            </button>
            <h2 className="text-2xl font-black italic text-white tracking-tight">SELECT LEVEL</h2>
            <div className="w-12"></div>
         </header>

         <div className="grid grid-cols-4 md:grid-cols-5 gap-6 max-w-4xl w-full">
            {LEVELS.map((lvl, idx) => {
              const status = progress[lvl.id] || 'locked';
              return (
                <motion.button
                  key={lvl.id}
                  whileHover={status !== 'locked' ? { scale: 1.05 } : {}}
                  whileTap={status !== 'locked' ? { scale: 0.95 } : {}}
                  onClick={() => status !== 'locked' && loadLevel(idx)}
                  className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${
                    status === 'completed' ? 'bg-sky-500/20 border-sky-500/40 border-2' :
                    status === 'unlocked' ? 'glass border-white/20 border-2' :
                    'bg-slate-900/50 border-white/5 opacity-40 cursor-not-allowed'
                  }`}
                >
                  <span className={`text-2xl font-black ${status === 'locked' ? 'text-slate-600' : 'text-white'}`}>
                    {lvl.id.toString().padStart(2, '0')}
                  </span>
                  {status === 'completed' && <Star size={14} className="fill-sky-500 text-sky-500" />}
                </motion.button>
              );
            })}
         </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col items-center justify-between p-8 bg-brand-bg relative overflow-hidden select-none">
       {/* UI Grid Overlay */}
       <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

       <header className="w-full flex justify-between items-center max-w-5xl z-10">
          <div className="flex items-center gap-6">
             <div className="glass px-6 py-3 rounded-2xl shadow-xl">
                <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-bold mb-1">Current Level</p>
                <div className="flex items-baseline gap-2">
                   <span className="text-3xl font-black text-sky-400">{LEVELS[currentLevelIdx].id.toString().padStart(2, '0')}</span>
                   <span className="text-xs text-slate-500">/ 20</span>
                </div>
             </div>
             <div className="glass px-6 py-3 rounded-2xl shadow-xl">
                <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-bold mb-1">Moves</p>
                <span className="text-3xl font-black">{moves.toString().padStart(3, '0')}</span>
             </div>
          </div>

          <div className="text-center hidden md:block">
             <h1 className="text-4xl font-black tracking-tighter italic text-white flex items-center gap-2">
                <span className="w-3 h-8 bg-sky-500 rounded-full"></span>
                CHROMASORT
             </h1>
          </div>

          <div className="flex gap-3">
             <button onClick={() => setScreen('levels')} className="glass w-14 h-14 rounded-2xl flex items-center justify-center btn-hover text-xl text-white/70">
                <Medal size={28} />
             </button>
             <button onClick={() => setScreen('menu')} className="glass w-14 h-14 rounded-2xl flex items-center justify-center btn-hover text-xl text-white/70">
                <Settings size={28} />
             </button>
          </div>
       </header>

       <main className="flex-grow flex flex-wrap items-center justify-center gap-x-8 gap-y-16 w-full max-w-6xl z-10 py-10">
          {tubes.map((tube, idx) => (
            <div 
              key={idx}
              onClick={() => handleTubeClick(idx)}
              className={`tube ${selectedTubeIdx === idx ? 'tube-selected' : ''} ${
                hint && (hint.from === idx || hint.to === idx) ? 'ring-4 ring-amber-400/50' : ''
              }`}
            >
               {tube.map((color, cIdx) => (
                 <motion.div 
                   key={cIdx} 
                   layoutId={`color-${idx}-${cIdx}-${color}`}
                   className={`liquid ${COLOR_CLASSES[color]}`}
                   initial={{ opacity: 0, scaleY: 0 }}
                   animate={{ opacity: 1, scaleY: 1 }}
                   transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                 />
               ))}
            </div>
          ))}
       </main>

       <footer className="w-full max-w-5xl flex justify-between items-center z-10">
          <div className="flex gap-4">
             <button 
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className={`glass px-8 py-4 rounded-2xl flex items-center gap-3 btn-hover border-white/20 ${undoStack.length === 0 ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}
             >
                <RotateCcw className="w-5 h-5" />
                <span className="text-sm font-bold tracking-widest uppercase">Undo</span>
             </button>
             <button 
              onClick={handleHint}
              className="glass px-8 py-4 rounded-2xl flex items-center gap-3 btn-hover border-white/20"
             >
                <Lightbulb className="w-5 h-5 text-amber-400" />
                <span className="text-sm font-bold tracking-widest uppercase">Hint</span>
             </button>
          </div>

          <button 
            onClick={() => loadLevel(currentLevelIdx)}
            className="bg-sky-500 hover:bg-sky-400 text-white px-12 py-5 rounded-2xl font-black shadow-2xl shadow-sky-500/40 tracking-[0.2em] text-sm transition-all transform hover:scale-105 active:scale-95"
          >
             RESTART LEVEL
          </button>

          <div className="flex gap-2">
             {[...Array(5)].map((_, i) => (
               <div key={i} className={`w-3 h-3 rounded-full ${i === 0 ? 'bg-sky-500' : 'bg-slate-700'}`}></div>
             ))}
          </div>
       </footer>

       <AnimatePresence>
          {isWon && (
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="absolute inset-0 bg-brand-bg/90 backdrop-blur-md z-50 flex items-center justify-center p-6"
             >
                <motion.div 
                   initial={{ scale: 0.8, y: 20 }}
                   animate={{ scale: 1, y: 0 }}
                   className="glass max-w-md w-full p-10 rounded-[40px] text-center border-white/20 shadow-2xl"
                >
                   <Trophy className="w-20 h-20 text-sky-400 mx-auto mb-6" />
                   <h2 className="text-4xl font-black italic text-white mb-2">WELL DONE!</h2>
                   <p className="text-slate-400 font-medium tracking-widest uppercase text-xs mb-8">Level {LEVELS[currentLevelIdx].id} Mastered</p>
                   
                   <div className="flex justify-center gap-2 mb-10">
                      <Star size={32} className="text-sky-400 fill-sky-400" />
                      <Star size={32} className="text-sky-400 fill-sky-400" />
                      <Star size={32} className="text-sky-400 fill-sky-400" />
                   </div>

                   <div className="flex flex-col gap-4">
                      <button 
                        onClick={() => {
                          const nextIdx = currentLevelIdx + 1;
                          if (nextIdx < LEVELS.length) {
                            loadLevel(nextIdx);
                          } else {
                            setScreen('levels');
                          }
                        }}
                        className="bg-sky-500 hover:bg-sky-400 text-white py-5 rounded-2xl font-bold tracking-[0.2em] text-sm transition-all"
                      >
                         {currentLevelIdx + 1 < LEVELS.length ? 'NEXT LEVEL' : 'BACK TO LEVELS'}
                      </button>
                      <button 
                        onClick={() => setScreen('levels')}
                        className="glass py-5 rounded-2xl font-bold tracking-[0.2em] text-sm text-white/70"
                      >
                         LEVEL SELECT
                      </button>
                   </div>
                </motion.div>
             </motion.div>
          )}
       </AnimatePresence>
    </div>
  );
}

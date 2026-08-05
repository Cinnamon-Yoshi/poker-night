const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { evaluateBest, compareEval, cardLabel, describeEval, describeEvalKicker, describeEvalNoKicker, findDecidingKicker, computeDecidingPos, RANK_NAMES } = require('./public/handEval.js');

// Pre-flop hole card description (pocket pair, suited connectors, etc.)
function describeHoleCards(cards){
  if(!cards||cards.length<2) return 'Hole Cards';
  const [c1,c2]=[...cards].sort((a,b)=>b.r-a.r);
  const suited=c1.s===c2.s, gap=Math.abs(c1.r-c2.r);
  if(c1.r===c2.r) return 'Pocket '+RANK_NAMES[c1.r]+'s';
  if(suited&&gap===1) return RANK_NAMES[c1.r]+'-'+RANK_NAMES[c2.r]+' Suited Connectors';
  if(suited)         return RANK_NAMES[c1.r]+'-'+RANK_NAMES[c2.r]+' Suited';
  if(gap===1)        return RANK_NAMES[c1.r]+'-'+RANK_NAMES[c2.r]+' Connectors';
  return RANK_NAMES[c1.r]+'-'+RANK_NAMES[c2.r]+' Offsuit';
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static('public'));

const HOST_PIN = process.env.HOST_PIN || '8888';
const VERSION = '3.39.3';
const LAST_UPDATED = 'July 2025';

const SUITS = ['S','H','D','C'];
const RANKS = [2,3,4,5,6,7,8,9,10,11,12,13,14];

// { id, name, connected, folded, allIn, sittingOut, action }
let players = [];
let deck=[], board=[], holeCards={};
let stage='idle', dealerIdx=-1;
let actionLog=[], lastHandResult=null;
let actingQueue=[], hasRaiseThisStreet=false, undoState=null;
let bbCanCheck=false; // true pre-flop when no one has raised — gives BB the option to Check
let cardBackStyle='roatan';
let skipDealerAdvance=false;
let pendingRunoutStage=null;
let pendingDealerAnimation=false;
let isRunoutSession=false; // true while an all-in runout is in progress; used for Results screen
let handSBIdx=-1, handBBIdx=-1; // SB/BB player index locked at deal time — for badge display only.
                                 // getSB()/getBB() themselves stay fold-aware for actual game logic
                                 // (acting order), which needs to skip folded players; badges must not.
let foldWinWinnerName=null; // who won this hand by fold, for correct reveal log wording
let foldWinRevealable=null; // array of player names still eligible to reveal their hand — cleared once revealed or a new hand starts
let lastActionLogIdx={};   // player name -> actionLog index of their most recent action line, for this hand
let allInCardsRevealed=false; // true once this hand's all-in cards have been logged
let lastLeaderNames=[];    // leader(s) as of the last logged runout update, for this hand
// Blind reminder tracking
let initialDealerName=null;
let firstHandDealt=false;
// Tournament tracking
let currentGameEliminations=[];  // player names in elimination order (earliest first) — used for Stats display order
let sessionHandsPlayed=0;        // total hands dealt this session — for Stats context/percentages, resets on New Game
let sessionStartTime=null;       // Date.now() when New Game started — drives the session clock
let sessionInfo={buyIn:20,playersToCash:0,payouts:[],blindsSB:1,blindsBB:2,blindsIncreaseMode:'hands',blindsIncreaseValue:3,startingChips:2000}; // host-entered placeholders, resets on New Game
let gameSetupPhase=null; // null | 'buyIn' | 'confirming' — the pre-game flow between seating confirmation and dealer selection
let lastGameSnapshot=null; // frozen stats shown on Stats below the live table — only updates when the NEXT game starts, not the instant a game ends
let pendingGameSnapshot=null; // captured the moment a game ends, promoted to lastGameSnapshot once the next game starts
let gameLive=false; // true once play actually begins (after confirmation), false again once the host formally ends the game — blocks new (non-reconnect) joins while true
let gameTotalPlayers=0; // fixed roster size at the moment the game started — placement math uses this, not the live (shrinking) players.length

function freshDeck(){
  const d=[];
  for(const s of SUITS) for(const r of RANKS) d.push({r,s});
  for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}
  return d;
}

function addLog(msg){actionLog.push(msg);if(actionLog.length>3000)actionLog.shift();}

function nextActive(from){
  const n=players.length; if(!n) return -1;
  let i=from;
  for(let c=0;c<n;c++){
    i=(i+1)%n;
    if(!players[i].folded && !players[i].sittingOut) return i;
  }
  return -1;
}
// Between hands: skip only sitting-out players (folded state is stale from last hand)
function nextForSB(from){
  const n=players.length; if(!n) return -1;
  let i=from;
  for(let c=0;c<n;c++){ i=(i+1)%n; if(!players[i].sittingOut) return i; }
  return -1;
}
function getSB(){
  if(players.length<2) return -1;
  // During a hand use folded-aware traversal; between hands use sittingOut-only
  return stage==='idle' ? nextForSB(dealerIdx) : nextActive(dealerIdx);
}
function getBB(){
  const sb=getSB(); if(sb===-1) return -1;
  return stage==='idle' ? nextForSB(sb) : nextActive(sb);
}
function active(){return players.filter(p=>!p.folded);}

// ── All-in runout detection ───────────────────────────────────────────
function isAllInRunout(){
  if(stage==='river'||stage==='idle') return false;
  const act=active().filter(p=>!p.sittingOut&&!p.eliminated);
  if(act.length<2) return false;
  // Both conditions required:
  // 1. Queue empty — everyone has acted (the 4th player has actually called)
  // 2. At most 1 player still has chips — if 2+ have chips they can still side-pot
  const withChips=act.filter(p=>!p.allIn).length;
  return actingQueue.length===0 && withChips<=1 && act.some(p=>p.allIn);
}

function currentHandLog(){
  for(let i=actionLog.length-1;i>=0;i--){
    if(actionLog[i].startsWith('--- New hand')) return actionLog.slice(i);
  }
  return [...actionLog];
}

// Matches the client's compactDesc() — "Fives & Threes" -> "5s & 3s", etc. —
// so the log reads the same notation as the Hands Revealed / Results screens.
// Tracks each player's current win/loss streak (e.g. W3, L2) — resets to 1
// of the new type whenever the result flips
function normalizeSessionInfo(info){
  if(!info||typeof info!=='object') return sessionInfo;
  const clampInt=(val,min,max,dflt)=>{
    const n=Math.floor(Number(val));
    if(!Number.isFinite(n)||n<min||n>max) return dflt;
    return n;
  };
  const playersToCash=Math.min(4,players.length,Math.max(1,Math.floor(Number(info.playersToCash)||1)));
  const rawPayouts=Array.isArray(info.payouts)?info.payouts:[];
  const payouts=[];
  for(let i=0;i<playersToCash;i++) payouts[i]=Math.max(0,Number(rawPayouts[i])||0);
  const blindsSB=clampInt(info.blindsSB,1,100,1);
  const mode=['minutes','hands'].includes(info.blindsIncreaseMode)?info.blindsIncreaseMode:'hands';
  return {
    buyIn: clampInt(info.buyIn,0,999,20),
    playersToCash, payouts,
    blindsSB, blindsBB: blindsSB*2,
    blindsIncreaseMode: mode,
    blindsIncreaseValue: clampInt(info.blindsIncreaseValue,1,60,3),
    startingChips: clampInt(info.startingChips,100,10000,2000),
  };
}

// Automated blind-increase reminders for the Minutes / # of Hands styles —
// Same Dealer already has its own mechanism further down
let lastBlindReminderAt=null;   // Date.now() of the last reminder (minutes mode) or game start
let handsSinceBlindReminder=0;  // hands dealt since the last reminder (hands mode)
function checkTimedBlindReminder(){
  if(!gameLive) return;
  if(sessionInfo.blindsIncreaseMode!=='minutes'||sessionInfo.blindsIncreaseValue<=0) return;
  if(!lastBlindReminderAt) return;
  if(stage!=='idle') return; // defer until the current hand finishes — don't interrupt active play
  const dueMs=sessionInfo.blindsIncreaseValue*60000;
  if(Date.now()-lastBlindReminderAt>=dueMs){
    lastBlindReminderAt=Date.now();
    const msg=sessionInfo.blindsIncreaseValue+' minute'+(sessionInfo.blindsIncreaseValue===1?'':'s')+' elapsed.';
    addLog('⏰ Blinds reminder — '+msg);
    io.emit('blindsReminder',{message:msg});
    broadcast();
  }
}
setInterval(checkTimedBlindReminder,15000);

// If the given player is the Same Dealer blind-reminder anchor, move the
// anchor to the next active player (after them in seating order, wrapping
// around) — used whenever that player leaves or busts out
function advanceDealerAnchorIfNeeded(name){
  if(name!==initialDealerName) return;
  const idx=players.findIndex(p=>p.name===name);
  if(idx<0) return;
  const rest=players.filter((p,i)=>i!==idx&&!p.sittingOut);
  const after=players.slice(idx+1).find(p=>!p.sittingOut);
  const before=players.slice(0,idx).find(p=>!p.sittingOut);
  const next=after||before||rest[0]||null;
  initialDealerName=next?next.name:null;
}

function formatClockTime(){
  const d=new Date();
  let h=d.getHours(); const m=String(d.getMinutes()).padStart(2,'0');
  const ampm=h>=12?'PM':'AM'; h=h%12; if(h===0) h=12;
  return h+':'+m+' '+ampm;
}
const ORDINAL_WORDS=['1st','2nd','3rd','4th','5th','6th','7th','8th','9th'];
function ordinalWord(n){ return ORDINAL_WORDS[n-1]||(n+'th'); }

function formatDurationHM(ms){
  const totalMin=Math.max(0,Math.floor(ms/60000));
  const h=Math.floor(totalMin/60), m=totalMin%60;
  return h>0 ? h+'h '+m+'m' : m+'m';
}

function recordStreak(p,won){
  const type=won?'W':'L';
  p.streakCount=(p.streakType===type)?(p.streakCount||0)+1:1;
  p.streakType=type;
  // Session-long maximums for display — unlike streakCount above, these
  // never decrease once set, even if the current streak later resets
  if(type==='W') p.maxWinStreak=Math.max(p.maxWinStreak||0,p.streakCount);
  else p.maxLossStreak=Math.max(p.maxLossStreak||0,p.streakCount);
}

function compactDesc(str){
  if(!str) return '';
  const map={
    'Aces':'As','Kings':'Ks','Queens':'Qs','Jacks':'Js','Tens':'10s',
    'Nines':'9s','Eights':'8s','Sevens':'7s','Sixes':'6s','Fives':'5s',
    'Fours':'4s','Threes':'3s','Twos':'2s',
    'Ace':'A','King':'K','Queen':'Q','Jack':'J','Ten':'10',
    'Nine':'9','Eight':'8','Seven':'7','Six':'6','Five':'5',
    'Four':'4','Three':'3','Two':'2'
  };
  let r=str;
  Object.entries(map).forEach(([k,v])=>{ r=r.replace(new RegExp('\\b'+k+'\\b','g'), v); });
  return r.trim();
}

// Builds one log line covering who leads (and whether that changed since the
// last street) plus every other player's current hand, all in the same
// compact notation shown on screen. Returns separate lines so the caller can
// log others first and the leader last — the client shows newest entries on
// top, so logging the leader last puts it at the top of the group.
function describeRunoutUpdate(preview, previousLeaderNames){
  const leaders=preview.leaderNames||[];
  if(leaders.length===0) return null;
  const byName={};
  (preview.players||[]).forEach(pd=>{ byName[pd.name]=pd; });
  const descOf=name=>compactDesc((byName[name]&&byName[name].desc)||'');

  let leaderLine;
  if(leaders.length>1){
    const desc=descOf(leaders[0]);
    leaderLine=leaders.join(' and ')+' are tied for the lead'+(desc?' with '+desc:'');
  } else {
    const name=leaders[0];
    const desc=descOf(name);
    const sameAsBefore=previousLeaderNames.length===1&&previousLeaderNames[0]===name;
    if(previousLeaderNames.length===0) leaderLine=name+' leads'+(desc?' with '+desc:'');
    else if(sameAsBefore) leaderLine=name+' still leads'+(desc?' with '+desc:'');
    else leaderLine=name+' took over the lead'+(desc?' with '+desc:'');
  }

  // preview.players is already sorted leader(s) first, then best-to-worst odds
  const otherLines=(preview.players||[])
    .filter(pd=>!leaders.includes(pd.name))
    .map(pd=>{
      const desc=compactDesc(pd.desc||'');
      let pctStr='';
      if(pd.totalRemaining){
        const equity=pd.isMonteCarlo ? (pd.score||0)/pd.totalRemaining : ((pd.outs||0)+(pd.tieOuts||0)*0.5)/pd.totalRemaining;
        const pct=Math.round(equity*100);
        pctStr=' ('+(pd.isMonteCarlo?'~':'')+pct+'% to win)';
      }
      return pd.name+': '+desc+pctStr;
    });

  return {leaderLine,otherLines};
}

function computeRunoutData(board){
  const act=active().filter(p=>!p.sittingOut);
  const knownKeys=new Set(board.map(c=>c.r+''+c.s));
  const pdList=act.map(p=>{
    const cards=holeCards[p.id]||[];
    cards.forEach(c=>knownKeys.add(c.r+''+c.s));
    return{name:p.name,cards,winningCards:[]};
  });
  const remaining=[];
  for(const s of SUITS) for(const r of RANKS) if(!knownKeys.has(r+''+s)) remaining.push({r,s});
  const cardsLeft=5-board.length;

  // ── PRE-FLOP (or 3+ cards to come): Monte Carlo simulation ──────────
  if(cardsLeft>=3){
    const SAMPLES=1500;
    const winCounts=new Array(pdList.length).fill(0);
    const tieShares=new Array(pdList.length).fill(0);
    for(let s=0;s<SAMPLES;s++){
      // Fisher-Yates shuffle of remaining, deal first cardsLeft as community cards
      const rem=[...remaining];
      for(let i=rem.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[rem[i],rem[j]]=[rem[j],rem[i]];}
      const simBoard=[...board,...rem.slice(0,cardsLeft)];
      const evals=pdList.map(pd=>evaluateBest([...pd.cards,...simBoard]));
      let best=evals[0];
      for(let i=1;i<evals.length;i++) if(compareEval(evals[i],best)>0) best=evals[i];
      const ws=evals.reduce((acc,e,i)=>{if(compareEval(e,best)===0) acc.push(i); return acc;},[]);
      if(ws.length===1) winCounts[ws[0]]++;
      else ws.forEach(i=>tieShares[i]+=1/ws.length);
    }
    const scores=pdList.map((_,i)=>winCounts[i]+tieShares[i]);
    const maxScore=Math.max(...scores);
    pdList.forEach((pd,i)=>{
      pd.outs=winCounts[i]; pd.totalRemaining=SAMPLES;
      pd.score=scores[i]; pd.isMonteCarlo=true;
      pd.desc=describeHoleCards(pd.cards);
      pd.isLeader=Math.abs(scores[i]-maxScore)<0.001;
    });
    pdList.sort((a,b)=>b.score-a.score);
    return{
      players:pdList.map(pd=>({name:pd.name,cards:pd.cards,desc:pd.desc,
        isLeader:pd.isLeader,outs:pd.outs,score:pd.score,totalRemaining:pd.totalRemaining,
        winningCards:[],isMonteCarlo:true})),
      leaderNames:pdList.filter(pd=>pd.isLeader).map(pd=>pd.name),cardsLeft
    };
  }

  // ── POST-FLOP: full hand evaluation ─────────────────────────────────
  pdList.forEach(pd=>{
    const allCards=[...pd.cards,...board];
    pd.eval=allCards.length>=5?evaluateBest(allCards):null;
    pd.desc=pd.eval?describeEval(pd.eval):null;
  });
  let topEval=null;
  pdList.forEach(pd=>{if(!topEval||compareEval(pd.eval,topEval)>0) topEval=pd.eval;});
  const leaderNames=pdList.filter(pd=>compareEval(pd.eval,topEval)===0).map(pd=>pd.name);

  if(cardsLeft===1){
    pdList.forEach(pd=>{
      if(leaderNames.includes(pd.name)){pd.outs=null;pd.tieOuts=null;pd.totalRemaining=remaining.length;return;}
      const wCards=[]; let tieCount=0;
      remaining.forEach(c=>{
        const b2=[...board,c];
        const ev2=evaluateBest([...pd.cards,...b2]);
        let bestOther=null;
        pdList.forEach(o=>{
          if(o.name===pd.name) return;
          const oe=evaluateBest([...o.cards,...b2]);
          if(!bestOther||compareEval(oe,bestOther)>0) bestOther=oe;
        });
        const cmp=compareEval(ev2,bestOther);
        if(cmp>0) wCards.push(c);
        else if(cmp===0) tieCount++;
      });
      pd.winningCards=wCards; pd.outs=wCards.length; pd.tieOuts=tieCount; pd.totalRemaining=remaining.length;
    });
  } else if(cardsLeft===2){
    pdList.forEach(pd=>{
      if(leaderNames.includes(pd.name)){pd.outs=null;pd.tieOuts=null;pd.totalRemaining=null;return;}
      const helpKeys=new Set(); let wins=0,ties=0,total=0;
      for(let i=0;i<remaining.length;i++) for(let j=i+1;j<remaining.length;j++){
        const b2=[...board,remaining[i],remaining[j]];
        const ev2=evaluateBest([...pd.cards,...b2]);
        let bestOther=null;
        pdList.forEach(o=>{
          if(o.name===pd.name) return;
          const oe=evaluateBest([...o.cards,...b2]);
          if(!bestOther||compareEval(oe,bestOther)>0) bestOther=oe;
        });
        const cmp=compareEval(ev2,bestOther);
        if(cmp>0){wins++;helpKeys.add(remaining[i].r+''+remaining[i].s);helpKeys.add(remaining[j].r+''+remaining[j].s);}
        else if(cmp===0) ties++;
        total++;
      }
      pd.outs=wins; pd.tieOuts=ties; pd.totalRemaining=total;
      pd.winningCards=remaining.filter(c=>helpKeys.has(c.r+''+c.s));
    });
  }
  pdList.sort((a,b)=>{
    if(leaderNames.includes(a.name)&&!leaderNames.includes(b.name)) return -1;
    if(!leaderNames.includes(a.name)&&leaderNames.includes(b.name)) return 1;
    const pA=a.totalRemaining?((a.outs||0)+(a.tieOuts||0)*0.5)/a.totalRemaining:0;
    const pB=b.totalRemaining?((b.outs||0)+(b.tieOuts||0)*0.5)/b.totalRemaining:0;
    return pB-pA;
  });
  return{
    players:pdList.map(pd=>({name:pd.name,cards:pd.cards,desc:pd.desc,
      isLeader:leaderNames.includes(pd.name),outs:pd.outs,tieOuts:pd.tieOuts,totalRemaining:pd.totalRemaining,
      winningCards:pd.winningCards||[]})),
    leaderNames,cardsLeft
  };
}

function buildQueue(startAfterIdx){
  const queue=[];
  if(!players.length) return queue;
  let idx=nextActive(startAfterIdx);
  if(idx===-1) return queue;
  const first=idx;
  do {
    if(!players[idx].allIn && !players[idx].sittingOut) queue.push(idx);
    idx=nextActive(idx);
    if(idx===-1) break;
  } while(idx!==first);
  return queue;
}

function buildQueueAfterRaise(raiserIdx){
  const queue=[];
  if(!players.length) return queue;
  let idx=nextActive(raiserIdx);
  if(idx===-1||idx===raiserIdx) return queue;
  const first=idx;
  do {
    if(!players[idx].allIn && !players[idx].folded && !players[idx].sittingOut) queue.push(idx);
    idx=nextActive(idx);
    if(idx===-1) break;
  } while(idx!==first && idx!==raiserIdx);
  return queue;
}

function pruneQueue(){
  while(actingQueue.length>0){
    const p=players[actingQueue[0]];
    if(!p||p.folded||p.allIn||p.sittingOut) actingQueue.shift();
    else break;
  }
}

function canRevealNext(){
  if(stage==='idle'||stage==='river') return false;
  const act=active();
  if(act.length<=1) return false;
  pruneQueue();
  if(isAllInRunout()) return true; // all-in runout: queue cleared, just proceed
  return actingQueue.length===0 && act.every(p=>p.action!==null);
}
function canRevealWinner(){
  if(stage==='idle') return false;
  const act=active();
  if(act.length<=1) return true;
  if(stage==='river'){
    pruneQueue();
    if(actingQueue.length!==0) return false;
    // All-in runout on river: Phone's action is null but everyone else is all-in — still reveal
    const withChips=act.filter(p=>!p.allIn&&!p.sittingOut&&!p.eliminated).length;
    if(withChips<=1&&act.some(p=>p.allIn)) return true;
    return act.every(p=>p.action!==null);
  }
  return false;
}

function publicState(){
  pruneQueue();
  // Badge display: while a hand is in progress, use the SB/BB locked in at deal
  // time so badges don't drift as players fold. Between hands, show a live
  // preview of the upcoming rotation.
  const sb = stage==='idle' ? getSB() : handSBIdx;
  const bb = stage==='idle' ? getBB() : handBBIdx;
  const nextActor=actingQueue.length>0?actingQueue[0]:-1;
  // Reveal hole cards to all clients during all-in runout
  const runoutActive=isAllInRunout()||pendingRunoutStage!==null;
  const revealedHoleCards={};
  if(runoutActive){
    players.forEach(p=>{
      if(holeCards[p.id]&&holeCards[p.id].length>0) revealedHoleCards[p.name]=holeCards[p.id];
    });
  }
  // Detect fold-win: only 1 non-folded, non-eliminated player remains mid-hand
  const foldWinner = stage !== 'idle'
    ? (() => { const rem=active().filter(p=>!p.eliminated); return rem.length===1?rem[0].name:null; })()
    : null;
  return {
    stage, board, version:VERSION, lastUpdated:LAST_UPDATED, cardBackStyle,
    pendingRunout:pendingRunoutStage!==null,
    willRunout:isAllInRunout(),
    canRevealNext:canRevealNext(), canRevealWinner:canRevealWinner(),
    foldWinner,
    playerCount:players.filter(p=>!p.sittingOut).length,
    actionLog:actionLog.slice(-40),
    lastHandResult, actingQueue:[...actingQueue],
    nextActorIdx:nextActor,
    nextActorName:nextActor>=0&&players[nextActor]?players[nextActor].name:null,
    hasRaiseThisStreet, canUndo:undoState!==null,
    bbCanCheck, nextActorIsBB:stage==='preflop'&&actingQueue.length>0&&actingQueue[0]===getBB(),
    revealedHoleCards,
    eliminationOrder:[...currentGameEliminations],
    sessionHandsPlayed,
    sessionStartTime,
    sessionInfo,
    gameSetupPhase,
    lastGameSnapshot,
    pendingGameSnapshot,
    pendingGameSnapshot,
    gameLive,
    gameTotalPlayers,
    players:players.map((p,i)=>({
      name:p.name, connected:p.connected, folded:p.folded,
      allIn:p.allIn, sittingOut:p.sittingOut||p.eliminated, eliminated:p.eliminated, action:p.action,
      isDealer:i===dealerIdx, isSB:i===sb, isBB:i===bb,
      isCurrent:i===nextActor,
      statsPlayed:p.statsPlayed||0, statsWon:p.statsWon||0, statsFolded:p.statsFolded||0, statsDecided:p.statsDecided||0,
      statsRaised:p.statsRaised||0, statsCalled:p.statsCalled||0, statsAllIn:p.statsAllIn||0,
      confirmedTerms:!!p.confirmedTerms,
      departed:!!p.departed,
      spectate:!!p.spectate,
      streakType:p.streakType||null, streakCount:p.streakCount||0,
      maxWinStreak:p.maxWinStreak||0, maxLossStreak:p.maxLossStreak||0
    }))
  };
}

function broadcast(){io.emit('state',publicState());}
function sendCards(id){if(holeCards[id]) io.to(id).emit('yourCards',holeCards[id]);}

function saveUndo(logEntry){
  undoState={
    playerStates:players.map(p=>({action:p.action,folded:p.folded,allIn:p.allIn})),
    actingQueue:[...actingQueue], hasRaiseThisStreet, logEntry
  };
}

io.on('connection',socket=>{
  socket.emit('state',publicState());

  socket.on('checkPin',(pin,cb)=>{if(typeof cb==='function') cb(pin===HOST_PIN);});

  socket.on('join',name=>{
    name=String(name||'Player').trim().slice(0,20)||'Player';
    const ex=players.find(p=>p.name===name);
    if(ex){
      if(holeCards[ex.id]){holeCards[socket.id]=holeCards[ex.id];delete holeCards[ex.id];}
      ex.id=socket.id; ex.connected=true;
      socket.emit('joined',{id:socket.id,reconnected:true});
    } else {
      if(gameLive){
        socket.emit('joinBlocked',{reason:'A game is in progress. New players cannot join until the host ends the current game.'});
        return;
      }
      players.push({id:socket.id,name,folded:false,allIn:false,sittingOut:false,spectate:false,eliminated:false,departed:false,connected:true,action:null,statsPlayed:0,statsWon:0,statsFolded:0,statsDecided:0,statsRaised:0,statsCalled:0,statsAllIn:0,streakType:null,streakCount:0,maxWinStreak:0,maxLossStreak:0,hadMoneyInPot:false,confirmedTerms:false});
      socket.emit('joined',{id:socket.id});
      addLog(name+' joined the game');
    }
    sendCards(socket.id);
    broadcast();
  });

  socket.on('reorder',names=>{
    // Remember which player is currently the dealer so the index follows them
    const dealerName=dealerIdx>=0&&players[dealerIdx]?players[dealerIdx].name:null;
    const by={};
    players.forEach(p=>{(by[p.name]=by[p.name]||[]).push(p);});
    const out=[];
    names.forEach(n=>{if(by[n]&&by[n].length) out.push(by[n].shift());});
    players.forEach(p=>{if(!out.includes(p)) out.push(p);});
    players=out;
    // Restore dealerIdx to the same player at their new position
    if(dealerName!==null){
      const ni=players.findIndex(p=>p.name===dealerName);
      if(ni>=0) dealerIdx=ni;
    }
    broadcast();
  });

  socket.on('renamePlayer',({oldName,newName})=>{
    newName=String(newName||'').trim().slice(0,20);
    if(!newName||newName===oldName) return;
    if(players.find(p=>p.name===newName)) return;
    const p=players.find(pl=>pl.name===oldName);
    if(!p) return;
    p.name=newName;
    // Tell the renamed player to update their stored name
    io.to(p.id).emit('youWereRenamed',newName);
    addLog(oldName+' renamed to '+newName);
    broadcast();
  });

  function captureGameSnapshot(){
    if(sessionHandsPlayed<=0) return;
    pendingGameSnapshot={
      sessionHandsPlayed,
      sessionDuration: sessionStartTime ? Date.now()-sessionStartTime : null,
      sessionInfo: {...sessionInfo},
      eliminationOrder: [...currentGameEliminations],
      gameTotalPlayers,
      players: players.map(p=>({
        name:p.name,
        statsPlayed:p.statsPlayed||0, statsWon:p.statsWon||0, statsFolded:p.statsFolded||0, statsDecided:p.statsDecided||0,
        statsRaised:p.statsRaised||0, statsCalled:p.statsCalled||0, statsAllIn:p.statsAllIn||0,
        streakType:p.streakType||null, streakCount:p.streakCount||0,
        maxWinStreak:p.maxWinStreak||0, maxLossStreak:p.maxLossStreak||0,
        eliminated:p.eliminated, spectate:p.spectate||false,
      })),
    };
  }

  socket.on('endLiveGame',()=>{
    if(!gameLive) return;
    captureGameSnapshot();

    // Log final placements one more time, worst to best — winner logged last
    // so it lands on top since the client shows newest entries first
    const totalPlayers=gameTotalPlayers;
    const ordinals=['1st','2nd','3rd','4th','5th','6th','7th','8th','9th'];
    const placedPlayers=players.filter(p=>!p.spectate).map(p=>{
      let place;
      if(p.eliminated){
        const idx=currentGameEliminations.indexOf(p.name);
        place = idx>=0 ? totalPlayers-idx : totalPlayers;
      } else {
        place = 1; // sole remaining player
      }
      return {name:p.name, place};
    }).sort((a,b)=>b.place-a.place);
    placedPlayers.forEach(pp=>{
      addLog((ordinals[pp.place-1]||(pp.place+'th'))+' '+pp.name);
    });

    const durationText = sessionStartTime ? formatDurationHM(Date.now()-sessionStartTime) : null;
    addLog('=== GAME ENDED'+(durationText?' ('+durationText+')':'')+' ===');

    players=players.filter(p=>!p.departed); // their placement/stats are already logged and snapshotted above

    gameLive=false;
    sessionHandsPlayed=0;
    sessionStartTime=null;
    lastBlindReminderAt=null;
    players.forEach(p=>{p.statsPlayed=0;p.statsWon=0;p.statsFolded=0;p.statsDecided=0;p.statsRaised=0;p.statsCalled=0;p.statsAllIn=0;p.streakType=null;p.streakCount=0;p.maxWinStreak=0;p.maxLossStreak=0;p.hadMoneyInPot=false;p.spectate=false;p.sittingOut=false;});
    players.forEach(p=>io.to(p.id).emit('yourCards',[]));
    holeCards={};
    broadcast();
    io.emit('gameEnded');
  });

  socket.on('startNewGame',()=>{
    // Promote whichever game most recently ended into the visible Previous
    // Game slot — keeps the OLDER previous game visible for review right up
    // until a new one actually begins, instead of vanishing the instant a
    // game ends
    if(pendingGameSnapshot){ lastGameSnapshot=pendingGameSnapshot; pendingGameSnapshot=null; }
    // Reset all player states first — bringing eliminated players back in
    players.forEach(p=>{p.folded=false;p.allIn=false;p.action=null;p.eliminated=false;p.sittingOut=p.spectate;p.statsPlayed=0;p.statsWon=0;p.statsFolded=0;p.statsDecided=0;p.statsRaised=0;p.statsCalled=0;p.statsAllIn=0;p.streakType=null;p.streakCount=0;p.maxWinStreak=0;p.maxLossStreak=0;p.hadMoneyInPot=false;p.confirmedTerms=false;});
    const eligible=players.filter(p=>!p.spectate); // only actual competitors count toward the minimum
    if(eligible.length<2) return;
    // Commit state changes
    board=[];holeCards={};actingQueue=[];
    pendingDealerAnimation=true; // consumed once dealHand() finally runs, after setup/confirmation
    hasRaiseThisStreet=false;undoState=null;lastHandResult=null;
    stage='idle';
    actionLog=['=== New Game Started ==='];
    pendingRunoutStage=null;
    isRunoutSession=false;
    firstHandDealt=false;
    currentGameEliminations=[];
    sessionHandsPlayed=0;
    sessionInfo={buyIn:20,playersToCash:0,payouts:[],blindsSB:1,blindsBB:2,blindsIncreaseMode:'hands',blindsIncreaseValue:3,startingChips:2000};
    handsSinceBlindReminder=0;
    gameSetupPhase='buyIn'; // host fills in buy-in/blinds/payout next, then players confirm

    players.forEach(p=>io.to(p.id).emit('yourCards',[]));
    broadcast();
  });

  // Host submits buy-in/blinds/payout, moving everyone to the confirmation screen
  socket.on('submitGameSetup',info=>{
    if(gameSetupPhase!=='buyIn') return;
    sessionInfo=normalizeSessionInfo(info);
    gameSetupPhase='confirming';
    players.forEach(p=>{ p.confirmedTerms=false; });
    broadcast();
  });

  // A player taps I Agree on the confirmation screen
  function beginLiveGameAfterConfirmation(){
    gameSetupPhase=null;
    gameLive=true;
    gameTotalPlayers=players.filter(p=>!p.spectate).length;
    sessionStartTime=Date.now(); // session clock starts when actual play begins, not during setup
    lastBlindReminderAt=Date.now();
    handsSinceBlindReminder=0;
    addLog('=== GAME BEGINS ('+formatClockTime()+') ===');
    dealHand();
  }

  socket.on('confirmSessionTerms',()=>{
    if(gameSetupPhase!=='confirming') return;
    const p=players.find(pl=>pl.id===socket.id);
    if(!p) return;
    p.confirmedTerms=true;
    if(players.every(pl=>pl.confirmedTerms)){
      beginLiveGameAfterConfirmation(); // instantly starts the game once everyone's in
    } else {
      broadcast();
    }
  });

  // Host taps Continue once everyone has confirmed — go straight into dealer
  // selection + first hand, same as the seating-confirmation flow already does
  socket.on('proceedPastConfirmation',()=>{
    if(gameSetupPhase!=='confirming') return;
    if(!players.every(p=>p.confirmedTerms)) return;
    beginLiveGameAfterConfirmation();
  });

  socket.on('backToGameSetup',()=>{
    if(gameSetupPhase!=='confirming') return;
    gameSetupPhase='buyIn';
    players.forEach(p=>{ p.confirmedTerms=false; }); // details may change, everyone re-confirms
    broadcast();
  });

  // Host cancels out of Game Setup entirely — clears the phase for everyone,
  // not just locally on the host's own device
  socket.on('cancelGameSetup',()=>{
    if(gameSetupPhase!=='buyIn') return;
    gameSetupPhase=null;
    broadcast();
  });

  // Spectate: player/host who is at the table but not playing this game.
  // Reuses the existing sittingOut skip logic everywhere (dealer rotation,
  // acting queue, hand dealing) instead of duplicating it. Locked once the
  // game goes live — not reversible mid-game.
  socket.on('setSpectate',name=>{
    if(gameLive) return;
    const p=players.find(pl=>pl.name===name);
    if(!p) return;
    p.spectate=!p.spectate;
    p.sittingOut=p.spectate;
    broadcast();
  });

  socket.on('removePlayer',name=>{
    advanceDealerAnchorIfNeeded(name);
    players=players.filter(p=>p.name!==name);
    addLog(name+' removed from game'); broadcast();
  });

  // Self-service leave, lobby OR an already-eliminated spectator returning
  // to the lobby mid-game — plain removal, no placement to record (their
  // placement was already recorded when they busted out or used EXIT)
  socket.on('leaveLobby',()=>{
    const p=players.find(pl=>pl.id===socket.id);
    if(!p) return;
    if(gameLive&&!p.eliminated) return; // still actively playing — must leaveGameLive first
    const name=p.name;
    advanceDealerAnchorIfNeeded(name);
    if(gameLive){
      // Mid-game: keep the record (stats/placement already recorded) so it
      // still shows correctly in Stats and the final placement recap —
      // just mark them departed so they drop out of At the Table / Seats
      p.departed=true;
    } else {
      // Pre-game: nothing to preserve, fully remove
      players=players.filter(pl=>pl.id!==socket.id);
    }
    addLog(name+' left the game');
    socket.emit('youLeft');
    broadcast();
  });

  // Self-service leave, live game — routes through the same elimination path
  // as a host bust-out, so a real placement gets recorded
  socket.on('leaveGameLive',()=>{
    if(!gameLive) return;
    const p=players.find(pl=>pl.id===socket.id);
    if(!p||p.eliminated||p.spectate) return;
    p.eliminated=true; p.sittingOut=true;
    currentGameEliminations.push(p.name);
    io.to(p.id).emit('yourCards',[]);
    advanceDealerAnchorIfNeeded(p.name);
    const place=gameTotalPlayers-(currentGameEliminations.length-1);
    addLog('\uD83D\uDEAA '+p.name+' left the game ('+ordinalWord(place)+' place)');
    broadcast();
  });

  socket.on('eliminatePlayer',name=>{
    const p=players.find(pl=>pl.name===name);
    if(!p) return;
    if(!p.eliminated){
      p.eliminated=true; p.sittingOut=true;
      currentGameEliminations.push(name);
      io.to(p.id).emit('yourCards',[]); // clear their cards immediately
      advanceDealerAnchorIfNeeded(name);
      const place=gameTotalPlayers-(currentGameEliminations.length-1);
      addLog('\u2620\uFE0F '+name+' busted out ('+ordinalWord(place)+' place)');
    } else {
      // Undo (host mistake recovery) — removes from elimination list
      p.eliminated=false; p.sittingOut=false;
      currentGameEliminations=currentGameEliminations.filter(n=>n!==name);
      addLog(name+' un-busted (removed from elimination list)');
    }
    broadcast();
  });

  socket.on('setCardBack',style=>{
    cardBackStyle=style;
    addLog('Card back changed');
    broadcast();
  });

  socket.on('setSessionInfo',info=>{
    sessionInfo=normalizeSessionInfo(info);
    broadcast();
  });

  function dealHand(){
    // First deal after new game: pick dealer and show animation
    if(pendingDealerAnimation){
      pendingDealerAnimation=false;
      const eligAll=players.filter(p=>!p.eliminated&&!p.sittingOut);
      if(eligAll.length<2) return;
      const winner=eligAll[Math.floor(Math.random()*eligAll.length)];
      const si=players.findIndex(p=>p.name===winner.name);
      if(si>=0){ dealerIdx=si; skipDealerAdvance=true; }
      initialDealerName=winner.name;
      io.emit('newGameAnimate',{eligible:eligAll.map(p=>p.name),winner:winner.name,followedByDeal:true});
      // Deal will proceed right after — client queues shuffle behind the animation
    }
    const eligible=players.filter(p=>!p.sittingOut);
    if(stage!=='idle'||eligible.length<2) return;
    deck=freshDeck(); board=[]; holeCards={}; lastHandResult=null;
    lastActionLogIdx={}; allInCardsRevealed=false; lastLeaderNames=[]; foldWinWinnerName=null; foldWinRevealable=null;

    // Reset non-sitting-out players; sitting-out treated as pre-folded
    players.forEach(p=>{
      p.folded=p.sittingOut;
      p.allIn=false;
      p.action=null;
      p.hadMoneyInPot=false;
      p.raisedThisHand=false;
      p.calledThisHand=false;
      p.allInThisHand=false;
    });

    // Advance dealer (skip on first hand after New Game — dealer already set)
    if(skipDealerAdvance){
      skipDealerAdvance=false;
    } else {
      let tries=0;
      do { dealerIdx=(dealerIdx+1)%players.length; tries++; }
      while(players[dealerIdx].sittingOut && tries<players.length);
    }

    stage='preflop';
    hasRaiseThisStreet=false;
    undoState=null;

    // Deal only to non-sitting-out players
    for(let round=0;round<2;round++){
      for(let k=0;k<players.length;k++){
        const idx=(dealerIdx+1+k)%players.length;
        const p=players[idx];
        if(p.sittingOut) continue;
        if(!holeCards[p.id]) holeCards[p.id]=[];
        holeCards[p.id].push(deck.pop());
      }
    }
    players.forEach(p=>sendCards(p.id));
    actingQueue=buildQueue(getBB()); // UTG first, BB last
    hasRaiseThisStreet=true;  // pre-flop: blinds already out = there's a bet to call
    bbCanCheck=true;           // BB gets free check option if no one raises
    sessionHandsPlayed++;
    if(sessionInfo.blindsIncreaseMode==='hands'&&sessionInfo.blindsIncreaseValue>0){
      handsSinceBlindReminder++;
      if(handsSinceBlindReminder>=sessionInfo.blindsIncreaseValue){
        handsSinceBlindReminder=0;
        const msg=sessionInfo.blindsIncreaseValue+' hand'+(sessionInfo.blindsIncreaseValue===1?'':'s')+' played.';
        addLog('⏰ Blinds reminder — '+msg);
        io.emit('blindsReminder',{message:msg});
      }
    }
    addLog('--- New hand. Dealer: '+players[dealerIdx].name+' ---');
    const sbIdx=getSB(), bbIdx=getBB();
    handSBIdx=sbIdx; handBBIdx=bbIdx;
    // Blinds are forced money in the pot — count as played immediately
    [sbIdx,bbIdx].forEach(idx=>{
      const p=idx>=0?players[idx]:null;
      if(p&&!p.hadMoneyInPot){ p.hadMoneyInPot=true; p.statsPlayed=(p.statsPlayed||0)+1; }
    });
    const currentDealerName=players[dealerIdx]?players[dealerIdx].name:null;
    // Blind reminder: fires when dealer wraps back to the initial dealer —
    // only when Same Dealer is the selected blinds-increase style
    if(sessionInfo.blindsIncreaseMode==='dealer'&&firstHandDealt&&currentDealerName&&currentDealerName===initialDealerName){
      addLog('[Blinds reminder fired for '+currentDealerName+']');
      io.emit('blindsReminder',{message:currentDealerName+' is the dealer again.'});
    }
    if(!firstHandDealt && initialDealerName){
      console.log('[Blind reminder] Tracking armed. Initial dealer: '+initialDealerName);
    }
    firstHandDealt=true;
    io.emit('shuffling',{
      dealer:currentDealerName,
      sb:sbIdx>=0&&players[sbIdx]?players[sbIdx].name:null,
      bb:bbIdx>=0&&players[bbIdx]?players[bbIdx].name:null,
    });
    broadcast();
  }

  socket.on('startHand',()=>{ dealHand(); });

  socket.on('recordAction',action=>{
    pruneQueue();
    if(actingQueue.length===0) return;
    const playerIdx=actingQueue[0];
    const p=players[playerIdx];
    if(!p) return;
    // Block check if there's been a raise — UNLESS it's the BB's free check option pre-flop
    const nextActor=actingQueue.length>0?actingQueue[0]:-1;
    const isBBCheck=bbCanCheck&&stage==='preflop'&&nextActor===getBB();
    if(action==='X'&&hasRaiseThisStreet&&!isBBCheck) return;
    const labels={F:'Fold',C:'Call',R:'Raise',A:'All In',X:'Check'};
    const logEntry=p.name+': '+(labels[action]||action);
    saveUndo(logEntry);
    p.action=action;
    if(action==='F'){
      p.folded=true;
      if(p.hadMoneyInPot){ p.statsFolded=(p.statsFolded||0)+1; p.statsDecided=(p.statsDecided||0)+1; recordStreak(p,false); }
    } else if(action==='C'||action==='R'||action==='A'){
      if(!p.hadMoneyInPot){ p.hadMoneyInPot=true; p.statsPlayed=(p.statsPlayed||0)+1; }
      if(action==='C'&&!p.calledThisHand){ p.calledThisHand=true; p.statsCalled=(p.statsCalled||0)+1; }
      if(action==='R'&&!p.raisedThisHand){ p.raisedThisHand=true; p.statsRaised=(p.statsRaised||0)+1; }
      if(action==='A'&&!p.allInThisHand){ p.allInThisHand=true; p.statsAllIn=(p.statsAllIn||0)+1; }
    }
    if(action==='A') p.allIn=true;
    if(action==='R'||action==='A'){
      bbCanCheck=false; // someone raised — BB loses free check option
      hasRaiseThisStreet=true;
      // All-in clears C, X and previous R (it's a re-raise); regular raise only clears C and X
      const toClear=action==='A'?['C','X','R']:['C','X'];
      players.forEach((other,i)=>{
        if(i!==playerIdx&&!other.folded&&!other.allIn&&toClear.includes(other.action)){
          other.action=null;
        }
      });
      actingQueue=buildQueueAfterRaise(playerIdx);
    } else {
      actingQueue.shift();
    }
    addLog(logEntry);
    lastActionLogIdx[p.name]=actionLog.length-1;
    broadcast();
  });

  socket.on('undoAction',()=>{
    if(!undoState) return;
    players.forEach((p,i)=>{
      if(undoState.playerStates[i]){
        p.action=undoState.playerStates[i].action;
        p.folded=undoState.playerStates[i].folded;
        p.allIn=undoState.playerStates[i].allIn;
      }
    });
    actingQueue=[...undoState.actingQueue];
    hasRaiseThisStreet=undoState.hasRaiseThisStreet;
    if(actionLog.length>0&&actionLog[actionLog.length-1]===undoState.logEntry) actionLog.pop();
    addLog('\u21A9 Undid: '+undoState.logEntry);
    undoState=null;
    broadcast();
  });

  socket.on('revealNext',()=>{
    if(pendingRunoutStage!==null) return; // already showing a preview, waiting on Proceed
    if(!canRevealNext()) return;
    // Guard: if only 1 player remains (fold-win), don't reveal — host should tap WIN instead
    if(active().filter(p=>!p.eliminated).length<=1) return;
    // If all players are all-in, show preview BEFORE dealing cards
    if(isAllInRunout()){
      const preview=computeRunoutData(board);

      // First time this hand's cards are revealed: fill in each player's
      // most recent action line (Call/Check/All In) with their hole cards,
      // now that everyone can see them on the Hands Revealed screen anyway
      if(!allInCardsRevealed){
        allInCardsRevealed=true;
        preview.players.forEach(pd=>{
          const idx=lastActionLogIdx[pd.name];
          const m=idx!==undefined&&actionLog[idx]!==undefined?actionLog[idx].match(/^(.*): (Fold|Call|Raise|All In|Check)$/):null;
          if(m){
            actionLog[idx]=pd.name+': '+m[2]+' ('+pd.cards.map(c=>cardLabel(c)).join(' ')+')';
          }
        });
      }

      // Log every other player's current hand on its own line, then the
      // leader last — the client shows newest entries first, so logging the
      // leader last puts it at the top of this street's group of lines
      const update=describeRunoutUpdate(preview,lastLeaderNames);
      if(update){
        [...update.otherLines].reverse().forEach(line=>addLog(line));
        addLog(update.leaderLine);
      }
      lastLeaderNames=preview.leaderNames||[];

      pendingRunoutStage=stage;
      io.emit('allInRunoutPreview',{board:[...board],preview,handLog:currentHandLog(),nextStreet:stage==='preflop'?'flop':stage==='flop'?'turn':'river'});
      return; // wait for proceedRunout
    }
    doRevealNext(stage);
    broadcast();
  });

  socket.on('proceedRunout',()=>{
    if(!pendingRunoutStage) return;
    isRunoutSession=true;
    const prevStage=pendingRunoutStage;
    pendingRunoutStage=null;
    doRevealNext(prevStage);
    // After animation plays, host uses N button to trigger next all-in preview or WIN
    broadcast();
  });

  function doRevealNext(fromStage){
    if(fromStage==='preflop'){
      deck.pop(); board.push(deck.pop(),deck.pop(),deck.pop()); stage='flop';
      players.filter(p=>!p.folded&&!p.allIn&&!p.sittingOut).forEach(p=>p.action=null);
      actingQueue=buildQueue(dealerIdx); hasRaiseThisStreet=false; bbCanCheck=false; undoState=null;
      // If ≤1 player still has chips (others all-in), no betting needed — clear queue for runout
      {const wc=active().filter(p=>!p.allIn&&!p.sittingOut&&!p.eliminated).length;
       if(wc<=1&&active().filter(p=>!p.sittingOut&&!p.eliminated).some(p=>p.allIn)) actingQueue=[];}
      addLog('Flop: '+board.slice(0,3).map(c=>cardLabel(c)).join(' '));
      io.emit('streetReveal',{street:'flop',label:'The Flop!',cards:board.slice(0,3)});
    } else if(fromStage==='flop'){
      deck.pop(); board.push(deck.pop()); stage='turn';
      players.filter(p=>!p.folded&&!p.allIn&&!p.sittingOut).forEach(p=>p.action=null);
      actingQueue=buildQueue(dealerIdx); hasRaiseThisStreet=false; bbCanCheck=false; undoState=null;
      // If ≤1 player still has chips (others all-in), no betting needed — clear queue for runout
      {const wc=active().filter(p=>!p.allIn&&!p.sittingOut&&!p.eliminated).length;
       if(wc<=1&&active().filter(p=>!p.sittingOut&&!p.eliminated).some(p=>p.allIn)) actingQueue=[];}
      addLog('Turn: '+cardLabel(board[3]));
      io.emit('streetReveal',{street:'turn',label:'The Turn',cards:[board[3]]});
    } else if(fromStage==='turn'){
      deck.pop(); board.push(deck.pop()); stage='river';
      players.filter(p=>!p.folded&&!p.allIn&&!p.sittingOut).forEach(p=>p.action=null);
      actingQueue=buildQueue(dealerIdx); hasRaiseThisStreet=false; bbCanCheck=false; undoState=null;
      // If ≤1 player still has chips (others all-in), no betting needed — clear queue for runout
      {const wc=active().filter(p=>!p.allIn&&!p.sittingOut&&!p.eliminated).length;
       if(wc<=1&&active().filter(p=>!p.sittingOut&&!p.eliminated).some(p=>p.allIn)) actingQueue=[];}
      addLog('River: '+cardLabel(board[4]));
      io.emit('streetReveal',{street:'river',label:'The River',cards:[board[4]]});
    }
  }

  // Fold-win: called when only 1 player remains (everyone else folded)
  socket.on('declareFoldWinner',()=>{
    const rem=active().filter(p=>!p.eliminated);
    if(rem.length!==1||stage==='idle') return;
    const winner=rem[0];
    winner.statsWon=(winner.statsWon||0)+1;
    winner.statsDecided=(winner.statsDecided||0)+1;
    recordStreak(winner,true);
    addLog('🏆 '+winner.name+' wins (everyone else folded)');
    const resultsPlayers=players.filter(p=>!p.sittingOut&&!p.eliminated).map(p=>({
      name:p.name,
      cards:[], // hidden until Show Hand is pressed
      handDesc:p.folded?'Folded':'',
      winner:p.name===winner.name,
      folded:p.folded,
    }));
    foldWinWinnerName=winner.name;
    foldWinRevealable=resultsPlayers.map(p=>p.name); // winner AND folded players can all choose to show their hand
    lastHandResult=null;
    stage='idle'; actingQueue=[]; bbCanCheck=false;
    hasRaiseThisStreet=false; undoState=null;
    pendingRunoutStage=null;
    io.emit('winnerAnnounce',{
      names:winner.name, nameList:[winner.name], hand:'',
      single:true, isSplit:false,
      runoutResults:{players:resultsPlayers, board:[...board], foldWin:true}
    });
    broadcast();
  });

  // Deal one more community card purely for show, from the Results screen,
  // after a fold-win winner has already been declared. The winner never
  // changes — this just lets everyone see how the hand would have played out
  socket.on('foldWinDealNextStreet',()=>{
    if(!foldWinWinnerName) return; // not in an active fold-win window
    if(board.length>=5) return;
    if(board.length===0){
      deck.pop(); board.push(deck.pop(),deck.pop(),deck.pop());
      addLog('Flop: '+board.slice(0,3).map(c=>cardLabel(c)).join(' '));
    } else if(board.length===3){
      deck.pop(); board.push(deck.pop());
      addLog('Turn: '+cardLabel(board[3]));
    } else if(board.length===4){
      deck.pop(); board.push(deck.pop());
      addLog('River: '+cardLabel(board[4]));
    }
    if(board.length===5){
      // Board just completed — retroactively log would-have-had for anyone
      // who already revealed earlier, before the board was finished
      players.filter(pl=>!pl.sittingOut&&!pl.eliminated&&foldWinRevealable&&!foldWinRevealable.includes(pl.name)).forEach(pl=>{
        logFoldWinWouldHaveHad(pl.name);
      });
      maybeLogFoldWinWouldHaveWon();
    }
    // Re-send the results payload with the updated board — preserve any
    // hands already individually revealed rather than hiding them again
    const resultsPlayers=players.filter(p=>!p.sittingOut&&!p.eliminated).map(p=>({
      name:p.name,
      cards: (foldWinRevealable&&foldWinRevealable.includes(p.name)) ? [] : [...(holeCards[p.id]||[])],
      handDesc:p.folded?'Folded':'',
      winner:p.name===foldWinWinnerName,
      folded:p.folded,
    }));
    broadcast();
    io.emit('foldWinBoardUpdated',{runoutResults:{players:resultsPlayers, board:[...board], foldWin:true}});
  });

  // Any player from this hand (winner or folded) can choose to reveal their
  // own hand after a fold-win, to see how it stacked up
  // Logs what a single player's hand would have been — only meaningful once
  // the full board is known
  function getFoldWinAllEvals(){
    return players.filter(pl=>!pl.sittingOut&&!pl.eliminated).map(pl=>({
      name:pl.name, eval:evaluateBest([...(holeCards[pl.id]||[]),...board]),
    })).filter(e=>e.eval);
  }

  function logFoldWinWouldHaveHad(name){
    if(board.length!==5) return;
    const evals=getFoldWinAllEvals();
    const mine=evals.find(e=>e.name===name);
    if(!mine) return;
    const peers=evals.filter(e=>e.name!==name).map(e=>e.eval);
    const pos=computeDecidingPos(mine.eval,peers);
    addLog(name+' would have had: '+compactDesc(describeEvalKicker(mine.eval,pos)));
  }

  // Once the board is fully out AND everyone from the hand has revealed,
  // logs who actually had the best hand — no trophy emoji, so this renders
  // in plain white rather than the gold highlight color
  function maybeLogFoldWinWouldHaveWon(){
    if(!foldWinWinnerName||board.length!==5) return;
    if(!foldWinRevealable||foldWinRevealable.length!==0) return;
    const evals=getFoldWinAllEvals();
    if(evals.length===0) return;
    let best=[evals[0]];
    for(let i=1;i<evals.length;i++){
      const cmp=compareEval(evals[i].eval,best[0].eval);
      if(cmp>0) best=[evals[i]];
      else if(cmp===0) best.push(evals[i]);
    }
    // Compare against everyone NOT in the winning group, so a deciding
    // kicker (e.g. an Ace beating a Jack with the same two pair) actually
    // shows up instead of making genuinely different hands look identical
    const peers=evals.filter(e=>!best.includes(e)).map(e=>e.eval);
    const pos=computeDecidingPos(best[0].eval,peers);
    const handDesc=compactDesc(describeEvalKicker(best[0].eval,pos));
    if(best.length>1) addLog(best.map(b=>b.name).join(' & ')+' would have tied with '+handDesc+'!');
    else if(best[0].name===foldWinWinnerName) addLog(best[0].name+' STILL would have won with '+handDesc+'!');
    else addLog(best[0].name+' would have won with '+handDesc+'!');
  }

  socket.on('revealHandFoldWin',()=>{
    if(!foldWinRevealable) return;
    if(stage!=='idle') return; // window closed once the next hand starts dealing
    const p=players.find(pl=>pl.id===socket.id);
    if(!p||!foldWinRevealable.includes(p.name)) return;
    const cards=holeCards[p.id]||[];
    if(!cards.length) return;
    foldWinRevealable=foldWinRevealable.filter(n=>n!==p.name);
    const cardsStr=cards.map(c=>cardLabel(c)).join(' ');
    addLog(p.name+' shows ('+cardsStr+')');
    logFoldWinWouldHaveHad(p.name); // no-op if board isn't complete yet
    maybeLogFoldWinWouldHaveWon();
    // Full updated payload — the targeted flip animation alone doesn't
    // refresh the would-have-had labels on other rows, so send the whole
    // picture and let the client re-render once the animation settles
    const resultsPlayers=players.filter(pl=>!pl.sittingOut&&!pl.eliminated).map(pl=>({
      name:pl.name,
      cards: (foldWinRevealable&&foldWinRevealable.includes(pl.name)) ? [] : [...(holeCards[pl.id]||[])],
      handDesc:pl.folded?'Folded':'',
      winner:pl.name===foldWinWinnerName,
      folded:pl.folded,
    }));
    io.emit('handRevealedFoldWin',{name:p.name,cards,handLog:currentHandLog(),runoutResults:{players:resultsPlayers,board:[...board],foldWin:true}});
    broadcast();
  });

    socket.on('revealWinner',()=>{
    if(stage==='idle') return;
    // Evaluate all hands
    const results=players.map(p=>{
      const cards=holeCards[p.id]||[];
      const all=[...cards,...board];
      const best=all.length>=5?evaluateBest(all):null;
      return{name:p.name,cards,handName:best?best.name:null,handDesc:null,_eval:best,folded:p.folded,sittingOut:p.sittingOut,winner:false};
    });

    // Determine winner among non-folded, non-sittingout
    const act=results.filter(r=>!r.folded&&!r.sittingOut&&r._eval);
    if(act.length===1){act[0].winner=true;}
    else if(act.length>1){
      let bev=null;
      act.forEach(r=>{if(!bev||compareEval(r._eval,bev)>0) bev=r._eval;});
      act.filter(r=>compareEval(r._eval,bev)===0).forEach(r=>r.winner=true);
    }

    // Generate descriptions — each player only gets kicker text when a
    // same-hand-rank peer actually requires one to distinguish them
    const showdownPlayers=results.filter(r=>!r.folded&&!r.sittingOut&&r._eval);
    results.forEach(r=>{
      if(!r._eval) return;
      const peerEvals=showdownPlayers.filter(o=>o!==r).map(o=>o._eval);
      const pos=computeDecidingPos(r._eval,peerEvals);
      r.handDesc=describeEvalKicker(r._eval,pos);
    });

    // Compute winner info (logged last, so it lands at the top since the client
    // displays the newest entries first)
    const winners=results.filter(r=>r.winner);
    winners.forEach(w=>{
      const pl=players.find(pp=>pp.name===w.name);
      if(pl){ pl.statsWon=(pl.statsWon||0)+1; pl.statsDecided=(pl.statsDecided||0)+1; recordStreak(pl,true); }
    });
    // Non-winning players who reached showdown (didn't fold) and had money in
    // the pot count as a decided loss, plus a loss streak update — a fold
    // already recorded its own loss streak update immediately when it happened
    results.filter(r=>!r.winner&&!r.folded&&!r.sittingOut).forEach(r=>{
      const pl=players.find(pp=>pp.name===r.name);
      if(pl&&pl.hadMoneyInPot){ pl.statsDecided=(pl.statsDecided||0)+1; recordStreak(pl,false); }
    });
    const isSplit=winners.length>1;
    const wNames=winners.map(r=>r.name);
    const wNamesStr=wNames.join(' & ');
    const wDesc=winners[0]?winners[0].handDesc||winners[0].handName:'';
    const wDescLog=compactDesc(wDesc);
    // If this was an all-in runout and the winner was not leading heading into
    // the river, call it out — they caught up on the last card
    const wasNotLeading=isRunoutSession&&!isSplit&&lastLeaderNames.length>0&&!lastLeaderNames.includes(wNames[0]);
    const winnerLogMsg=isSplit
      ?'\uD83E\uDD1D Split pot \u2014 '+wNamesStr+(wDescLog?' — tied with '+wDescLog+'!':'!')
      :'\uD83C\uDFC6 '+wNamesStr+(wasNotLeading?' rivers the win':' wins')+(wDescLog?' with '+wDescLog+'!':'!');

    // Hand summary: only players who were actually in the hand (not sitting out)
    const nonFolded=results.filter(r=>!r.folded&&!r.sittingOut)
      .sort((a,b)=>{
        if(a.winner&&!b.winner) return -1;
        if(!a.winner&&b.winner) return 1;
        return compareEval(b._eval,a._eval);
      });
    const foldedInHand=results.filter(r=>r.folded&&!r.sittingOut);
    const ordinals=['1st','2nd','3rd','4th','5th','6th','7th','8th','9th'];
    // For split: both winners are "1st"; then place continues from 2
    const placed=nonFolded.filter(r=>!r.winner);
    let place=isSplit?winners.length+1:2;
    const placedLogMsgs=placed.map(r=>{
      const msg=(ordinals[place-1]||`${place}th`)+' '+r.name+': '+compactDesc(r.handDesc||'');
      place++;
      return msg;
    });

    // Log order: folded first, then placed players worst-to-best, then the winner
    // last — since the client shows newest entries at the top, this puts the
    // winner above 2nd place, 2nd above 3rd, and folded players at the bottom.
    foldedInHand.forEach(r=>addLog(r.name+': Folded'));
    [...placedLogMsgs].reverse().forEach(msg=>addLog(msg));
    addLog(winnerLogMsg);

    // Emit to all clients — includes split flag and full winner name array
    // runoutResults: included when this hand was an all-in runout, for the Results overlay
    const runoutResultsData = isRunoutSession ? {
      players: results.filter(r=>!r.sittingOut&&!r.eliminated&&!r.folded)
        .map(r=>({name:r.name,cards:r.cards,handDesc:r.handDesc,winner:r.winner})),
      board:[...board]
    } : null;
    isRunoutSession=false;
    io.emit('winnerAnnounce',{
      names:wNamesStr, nameList:wNames, hand:wDesc,
      single:winners.length===1, isSplit,
      runoutResults:runoutResultsData
    });

    // Clean up
    results.forEach(r=>delete r._eval);
    lastHandResult={results:results.filter(r=>!r.sittingOut),board:[...board]};
    actingQueue=[]; undoState=null; stage='idle';
    broadcast();
  });

  socket.on('disconnect',()=>{
    const p=players.find(pl=>pl.id===socket.id);
    if(p){p.connected=false;broadcast();}
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,'0.0.0.0',()=>console.log(`Roatan Poker Club v${VERSION} on port ${PORT}. PIN: ${HOST_PIN}`));

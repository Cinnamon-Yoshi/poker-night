const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { evaluateBest, compareEval, cardLabel, describeEval, describeEvalKicker, findDecidingKicker, RANK_NAMES } = require('./public/handEval.js');

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
const VERSION = '3.6';
const LAST_UPDATED = 'July 2025';

const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, 'data');
const TOURNAMENT_FILE = path.join(DATA_DIR, 'tournament.json');

function loadTournament(){
  try{
    if(!fs.existsSync(TOURNAMENT_FILE)) return {games:[]};
    return JSON.parse(fs.readFileSync(TOURNAMENT_FILE,'utf8'));
  }catch(e){ return {games:[]}; }
}
function saveTournamentData(data){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true});
  fs.writeFileSync(TOURNAMENT_FILE,JSON.stringify(data,null,2),'utf8');
}
function formatSessionLabel(){
  const d=new Date();
  const mo=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
  const day=String(d.getDate()).padStart(2,'0');
  const h=String(d.getHours()).padStart(2,'0');
  const m=String(d.getMinutes()).padStart(2,'0');
  return `${mo}${day}-${h}:${m}`;
}
function computeTournamentResults(eliminations,remainingPlayers){
  const total=eliminations.length+remainingPlayers.length;
  if(total<2) return {results:[],totalPlayers:total};
  const results=[];
  remainingPlayers.forEach(name=>results.push({name,place:1,points:1}));
  eliminations.forEach((name,i)=>{
    const place=total-i;
    results.push({name,place,points:place});
  });
  return {results,totalPlayers:total};
}
const SUITS = ['S','H','D','C'];
const RANKS = [2,3,4,5,6,7,8,9,10,11,12,13,14];

// { id, name, connected, folded, allIn, sittingOut, action }
let players = [];
let deck=[], board=[], holeCards={};
let stage='idle', dealerIdx=-1;
let actionLog=[], lastHandResult=null;
let actingQueue=[], hasRaiseThisStreet=false, undoState=null;
let cardBackStyle='roatan';
let skipDealerAdvance=false;
let pendingRunoutStage=null;
let pendingDealerAnimation=false;
let isRunoutSession=false; // true while an all-in runout is in progress; used for Results screen
// Blind reminder tracking
let initialDealerName=null;
let firstHandDealt=false;
// Tournament tracking
let currentGameEliminations=[];  // player names in elimination order (earliest first)
let currentSessionLabel=null;    // e.g. "JUL01-22:31", set when New Game is pressed

function freshDeck(){
  const d=[];
  for(const s of SUITS) for(const r of RANKS) d.push({r,s});
  for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}
  return d;
}

function addLog(msg){actionLog.push(msg);if(actionLog.length>120)actionLog.shift();}

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
        isLeader:pd.isLeader,outs:pd.outs,totalRemaining:pd.totalRemaining,
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
      if(leaderNames.includes(pd.name)){pd.outs=null;pd.totalRemaining=remaining.length;return;}
      const wCards=[];
      remaining.forEach(c=>{
        const b2=[...board,c];
        const ev2=evaluateBest([...pd.cards,...b2]);
        const wins=pdList.every(o=>o.name===pd.name||compareEval(ev2,evaluateBest([...o.cards,...b2]))>0);
        if(wins) wCards.push(c);
      });
      pd.winningCards=wCards; pd.outs=wCards.length; pd.totalRemaining=remaining.length;
    });
  } else if(cardsLeft===2){
    pdList.forEach(pd=>{
      if(leaderNames.includes(pd.name)){pd.outs=null;pd.totalRemaining=null;return;}
      const helpKeys=new Set(); let wins=0,total=0;
      for(let i=0;i<remaining.length;i++) for(let j=i+1;j<remaining.length;j++){
        const b2=[...board,remaining[i],remaining[j]];
        const ev2=evaluateBest([...pd.cards,...b2]);
        const w=pdList.every(o=>o.name===pd.name||compareEval(ev2,evaluateBest([...o.cards,...b2]))>0);
        if(w){wins++;helpKeys.add(remaining[i].r+''+remaining[i].s);helpKeys.add(remaining[j].r+''+remaining[j].s);}
        total++;
      }
      pd.outs=wins; pd.totalRemaining=total;
      pd.winningCards=remaining.filter(c=>helpKeys.has(c.r+''+c.s));
    });
  }
  pdList.sort((a,b)=>{
    if(leaderNames.includes(a.name)&&!leaderNames.includes(b.name)) return -1;
    if(!leaderNames.includes(a.name)&&leaderNames.includes(b.name)) return 1;
    const pA=a.totalRemaining?(a.outs||0)/a.totalRemaining:0;
    const pB=b.totalRemaining?(b.outs||0)/b.totalRemaining:0;
    return pB-pA;
  });
  return{
    players:pdList.map(pd=>({name:pd.name,cards:pd.cards,desc:pd.desc,
      isLeader:leaderNames.includes(pd.name),outs:pd.outs,totalRemaining:pd.totalRemaining,
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
  return actingQueue.length===0 && act.every(p=>p.action!==null);
}
function canRevealWinner(){
  if(stage==='idle') return false;
  const act=active();
  if(act.length<=1) return true;
  if(stage==='river'){pruneQueue();return actingQueue.length===0&&act.every(p=>p.action!==null);}
  return false;
}

function publicState(){
  pruneQueue();
  const sb=getSB(), bb=getBB();
  const nextActor=actingQueue.length>0?actingQueue[0]:-1;
  // Reveal hole cards to all clients during all-in runout
  const runoutActive=isAllInRunout()||pendingRunoutStage!==null;
  const revealedHoleCards={};
  if(runoutActive){
    players.forEach(p=>{
      if(holeCards[p.id]&&holeCards[p.id].length>0) revealedHoleCards[p.name]=holeCards[p.id];
    });
  }
  return {
    stage, board, version:VERSION, lastUpdated:LAST_UPDATED, cardBackStyle,
    pendingRunout:pendingRunoutStage!==null,
    currentSessionLabel, currentEliminationCount:currentGameEliminations.length,
    canRevealNext:canRevealNext(), canRevealWinner:canRevealWinner(),
    playerCount:players.filter(p=>!p.sittingOut).length,
    actionLog:actionLog.slice(-40),
    lastHandResult, actingQueue:[...actingQueue],
    nextActorIdx:nextActor,
    nextActorName:nextActor>=0&&players[nextActor]?players[nextActor].name:null,
    hasRaiseThisStreet, canUndo:undoState!==null,
    revealedHoleCards,
    players:players.map((p,i)=>({
      name:p.name, connected:p.connected, folded:p.folded,
      allIn:p.allIn, sittingOut:p.sittingOut||p.eliminated, eliminated:p.eliminated, action:p.action,
      isDealer:i===dealerIdx, isSB:i===sb, isBB:i===bb,
      isCurrent:i===nextActor
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

  socket.on('checkPin',(pin,cb)=>{if(typeof cb==='function') cb(pin===HOST_PIN);});

  socket.on('join',name=>{
    name=String(name||'Player').trim().slice(0,20)||'Player';
    const ex=players.find(p=>p.name===name);
    if(ex){
      if(holeCards[ex.id]){holeCards[socket.id]=holeCards[ex.id];delete holeCards[ex.id];}
      ex.id=socket.id; ex.connected=true;
      socket.emit('joined',{id:socket.id,reconnected:true});
    } else {
      players.push({id:socket.id,name,folded:false,allIn:false,sittingOut:false,eliminated:false,connected:true,action:null});
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

  socket.on('startNewGame',()=>{
    // Reset all player states first — bringing eliminated players back in
    players.forEach(p=>{p.folded=false;p.allIn=false;p.action=null;p.eliminated=false;p.sittingOut=false;});
    const eligible=players; // everyone is back in after reset
    if(eligible.length<2) return;
    // Notify ALL clients a new game is beginning
    io.emit('newGameStarting');
    // Commit state changes (dealer selection happens at first Deal press)
    board=[];holeCards={};actingQueue=[];
    pendingDealerAnimation=true; // dealer animation plays when host presses Deal
    hasRaiseThisStreet=false;undoState=null;lastHandResult=null;
    stage='idle';
    actionLog=['=== New Game Started ==='];
    pendingRunoutStage=null;
    isRunoutSession=false;
    firstHandDealt=false;
    currentGameEliminations=[];
    currentSessionLabel=formatSessionLabel();

    players.forEach(p=>io.to(p.id).emit('yourCards',[]));
    broadcast();
  });

  socket.on('removePlayer',name=>{
    // If the removed player is the blind-reminder anchor, advance to next active player
    if(name===initialDealerName){
      const idx=players.findIndex(p=>p.name===name);
      const rest=players.filter((p,i)=>i!==idx&&!p.sittingOut);
      const after=players.slice(idx+1).find(p=>!p.sittingOut);
      const before=players.slice(0,idx).find(p=>!p.sittingOut);
      const next=after||before||rest[0]||null;
      initialDealerName=next?next.name:null;
    }
    players=players.filter(p=>p.name!==name);
    addLog(name+' removed from game'); broadcast();
  });

  // ── Tournament events ────────────────────────────────────────────────
  socket.on('saveTournamentGame',(cb)=>{
    if(!currentSessionLabel||currentGameEliminations.length===0){
      if(cb) cb({success:false,reason:'nothing to save'});
      return;
    }
    const tournament=loadTournament();
    const remainingNames=players.filter(p=>!p.eliminated).map(p=>p.name);
    const {results,totalPlayers}=computeTournamentResults(currentGameEliminations,remainingNames);
    if(results.length===0){ if(cb) cb({success:false,reason:'too few players'}); return; }
    tournament.games.push({sessionLabel:currentSessionLabel,totalPlayers,results});
    saveTournamentData(tournament);
    io.emit('tournamentUpdated',tournament);
    if(cb) cb({success:true});
  });

  socket.on('getTournament',(cb)=>{
    if(cb) cb(loadTournament());
  });

  socket.on('clearTournament',(cb)=>{
    saveTournamentData({games:[]});
    io.emit('tournamentUpdated',{games:[]});
    if(cb) cb({success:true});
  });

  socket.on('eliminatePlayer',name=>{
    const p=players.find(pl=>pl.name===name);
    if(!p) return;
    if(!p.eliminated){
      p.eliminated=true; p.sittingOut=true;
      currentGameEliminations.push(name);
      io.to(p.id).emit('yourCards',[]); // clear their cards immediately
      addLog('\u2620\uFE0F '+name+' busted out (place '+(currentGameEliminations.length)+')');
    } else {
      // Undo (host mistake recovery) — removes from elimination list
      p.eliminated=false; p.sittingOut=false;
      currentGameEliminations=currentGameEliminations.filter(n=>n!==name);
      addLog(name+' un-busted (removed from elimination list)');
    }
    broadcast();
  });

  socket.on('clearLog',()=>{actionLog=[];broadcast();});

  socket.on('setCardBack',style=>{
    cardBackStyle=style;
    addLog('Card back changed');
    broadcast();
  });

  socket.on('startHand',()=>{
    // First deal after new game: pick dealer and show animation
    if(pendingDealerAnimation){
      pendingDealerAnimation=false;
      const eligAll=players.filter(p=>!p.eliminated);
      if(eligAll.length<2) return;
      const winner=eligAll[Math.floor(Math.random()*eligAll.length)];
      const si=players.findIndex(p=>p.name===winner.name);
      if(si>=0){ dealerIdx=si; skipDealerAdvance=true; }
      initialDealerName=winner.name;
      addLog('[Blind reminder tracking: '+winner.name+']');
      io.emit('newGameAnimate',{eligible:eligAll.map(p=>p.name),winner:winner.name,followedByDeal:true});
      // Deal will proceed right after — client queues shuffle behind the animation
    }
    const eligible=players.filter(p=>!p.sittingOut);
    if(stage!=='idle'||eligible.length<2) return;
    deck=freshDeck(); board=[]; holeCards={}; lastHandResult=null;

    // Reset non-sitting-out players; sitting-out treated as pre-folded
    players.forEach(p=>{
      p.folded=p.sittingOut;
      p.allIn=false;
      p.action=null;
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
    addLog('--- New hand. Dealer: '+players[dealerIdx].name+' ---');
    const sbIdx=getSB(), bbIdx=getBB();
    const currentDealerName=players[dealerIdx]?players[dealerIdx].name:null;
    // Blind reminder: fires when dealer wraps back to the initial dealer
    if(firstHandDealt && currentDealerName && currentDealerName===initialDealerName){
      addLog('[Blinds reminder fired for '+currentDealerName+']');
      io.emit('blindsReminder',{dealerName:currentDealerName});
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
  });

  socket.on('recordAction',action=>{
    pruneQueue();
    if(actingQueue.length===0) return;
    const playerIdx=actingQueue[0];
    const p=players[playerIdx];
    if(!p) return;
    if(action==='X'&&hasRaiseThisStreet) return;
    const labels={F:'Fold',C:'Call',R:'Raise',A:'All In',X:'Check'};
    const logEntry=p.name+': '+(labels[action]||action);
    saveUndo(logEntry);
    p.action=action;
    if(action==='F') p.folded=true;
    if(action==='A') p.allIn=true;
    if(action==='R'||action==='A'){
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
    if(!canRevealNext()) return;
    // If all players are all-in, show preview BEFORE dealing cards
    if(isAllInRunout()){
      const preview=computeRunoutData(board);
      pendingRunoutStage=stage;
      io.emit('allInRunoutPreview',{board:[...board],preview,nextStreet:stage==='preflop'?'flop':stage==='flop'?'turn':'river'});
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
      actingQueue=buildQueue(dealerIdx); hasRaiseThisStreet=false; undoState=null;
      addLog('Flop: '+board.slice(0,3).map(c=>cardLabel(c)).join(' '));
      io.emit('streetReveal',{street:'flop',label:'The Flop!',cards:board.slice(0,3)});
    } else if(fromStage==='flop'){
      deck.pop(); board.push(deck.pop()); stage='turn';
      players.filter(p=>!p.folded&&!p.allIn&&!p.sittingOut).forEach(p=>p.action=null);
      actingQueue=buildQueue(dealerIdx); hasRaiseThisStreet=false; undoState=null;
      addLog('Turn: '+cardLabel(board[3]));
      io.emit('streetReveal',{street:'turn',label:'The Turn',cards:[board[3]]});
    } else if(fromStage==='turn'){
      deck.pop(); board.push(deck.pop()); stage='river';
      players.filter(p=>!p.folded&&!p.allIn&&!p.sittingOut).forEach(p=>p.action=null);
      actingQueue=buildQueue(dealerIdx); hasRaiseThisStreet=false; undoState=null;
      addLog('River: '+cardLabel(board[4]));
      io.emit('streetReveal',{street:'river',label:'The River',cards:[board[4]]});
    }
  }

  socket.on('endGame',()=>{
    // Compute final standings for game results display
    const remaining=players.filter(p=>!p.eliminated);
    const elimReversed=[...currentGameEliminations].reverse(); // last eliminated first
    const resultsList=[
      ...remaining.map(p=>({name:p.name,isWinner:true})),
      ...elimReversed.map(name=>({name,isWinner:false}))
    ];
    io.emit('gameResults',{
      results:resultsList,
      sessionLabel:currentSessionLabel,
      canSave:!!(currentSessionLabel&&currentGameEliminations.length>0)
    });
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

    // Find deciding kicker (comparing winner vs non-winner active players)
    const winnerR=results.filter(r=>r.winner&&r._eval);
    const loserR=results.filter(r=>!r.winner&&!r.folded&&!r.sittingOut&&r._eval);
    let decidingPos=null;
    if(winnerR.length===1&&loserR.length>0){
      decidingPos=findDecidingKicker(winnerR[0]._eval,loserR.map(r=>r._eval));
    }

    // Generate descriptions
    results.forEach(r=>{
      if(!r._eval) return;
      r.handDesc=r.winner&&decidingPos!==null ? describeEvalKicker(r._eval,decidingPos) : describeEval(r._eval);
    });

    // Log winner(s)
    const winners=results.filter(r=>r.winner);
    const isSplit=winners.length>1;
    const wNames=winners.map(r=>r.name);
    const wNamesStr=wNames.join(' & ');
    const wDesc=winners[0]?winners[0].handDesc||winners[0].handName:'';
    addLog((isSplit?'\uD83E\uDD1D Split pot \u2014 ':'\uD83C\uDFC6 ')+wNamesStr+(wDesc?(isSplit?' — tied with ':' wins with ')+wDesc+'!':' wins!'));

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
    let place=isSplit?winners.length+1:2;
    nonFolded.forEach(r=>{
      if(!r.winner){
        addLog((ordinals[place-1]||`${place}th`)+' '+r.name+': '+(r.handDesc||''));
        place++;
      }
    });
    foldedInHand.forEach(r=>addLog(r.name+': Folded'));

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

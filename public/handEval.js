(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { const exp = factory(); Object.keys(exp).forEach(k => { root[k] = exp[k]; }); }
})(typeof window !== 'undefined' ? window : global, function() {

const RANK_NAMES = {2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A'};
const RANK_SINGULAR = {2:'Two',3:'Three',4:'Four',5:'Five',6:'Six',7:'Seven',8:'Eight',9:'Nine',10:'Ten',11:'Jack',12:'Queen',13:'King',14:'Ace'};
const RANK_PLURAL   = {2:'Twos',3:'Threes',4:'Fours',5:'Fives',6:'Sixes',7:'Sevens',8:'Eights',9:'Nines',10:'Tens',11:'Jacks',12:'Queens',13:'Kings',14:'Aces'};
const SUIT_SYMBOLS  = { S:'\u2660', H:'\u2665', D:'\u2666', C:'\u2663' };
const SUIT_NAMES    = { S:'Spades', H:'Hearts', D:'Diamonds', C:'Clubs' };

function cardLabel(c) { return (RANK_NAMES[c.r]||'?')+(SUIT_SYMBOLS[c.s]||'?'); }

function coloredCardHtml(c) {
  const isRed = c.s==='H'||c.s==='D';
  return '<span class="rc'+(isRed?' rcr':'')+'">'+cardLabel(c)+'</span>';
}

function cardKey(c) { return c.r+''+c.s; }

function describeEval(ev) {
  if (!ev) return null;
  const tb = ev.tiebreak;
  const S = RANK_SINGULAR, P = RANK_PLURAL;
  switch (ev.rank) {
    case 0: return 'High Card \u2014 '+S[tb[0]];
    case 1: return 'Pair of '+P[tb[0]]+(tb[1]?' \u2014 '+S[tb[1]]+' kicker':'');
    case 2: return 'Two Pair \u2014 '+P[tb[0]]+' & '+P[tb[1]]+(tb[2]?', '+S[tb[2]]+' kicker':'');
    case 3: return 'Three of a Kind \u2014 '+P[tb[0]]+(tb[1]?', '+S[tb[1]]+' kicker':'');
    case 4: return 'Straight \u2014 '+S[tb[0]]+' High';
    case 5: return 'Flush \u2014 '+S[tb[0]]+' High';
    case 6: return 'Full House \u2014 '+P[tb[0]]+' Full of '+P[tb[1]];
    case 7: return 'Four of a Kind \u2014 '+P[tb[0]]+(tb[1]?', '+S[tb[1]]+' kicker':'');
    case 8: return tb[0]===14 ? 'Royal Flush!' : 'Straight Flush \u2014 '+S[tb[0]]+' High';
    default: return ev.name;
  }
}

function kCombinations(arr, k) {
  const result = [];
  function helper(start, combo) {
    if (combo.length===k) { result.push(combo.slice()); return; }
    for (let i=start; i<arr.length; i++) { combo.push(arr[i]); helper(i+1,combo); combo.pop(); }
  }
  helper(0,[]);
  return result;
}

function evaluate5(cards) {
  const ranks = cards.map(c=>c.r).sort((a,b)=>b-a);
  const suits = cards.map(c=>c.s);
  const isFlush = suits.every(s=>s===suits[0]);
  const uniq = [...new Set(ranks)];
  let sh = null;
  if (uniq.length===5) {
    if (uniq[0]-uniq[4]===4) sh=uniq[0];
    else if (uniq[0]===14&&uniq[1]===5&&uniq[2]===4&&uniq[3]===3&&uniq[4]===2) sh=5;
  }
  const cm = {};
  ranks.forEach(r=>cm[r]=(cm[r]||0)+1);
  const g = Object.entries(cm).map(([r,c])=>({r:+r,c})).sort((a,b)=>b.c-a.c||b.r-a.r);
  if (sh&&isFlush) return {rank:8,name:'Straight Flush',tiebreak:[sh]};
  if (g[0].c===4) return {rank:7,name:'Four of a Kind',tiebreak:[g[0].r,g[1].r]};
  if (g[0].c===3&&g[1]&&g[1].c===2) return {rank:6,name:'Full House',tiebreak:[g[0].r,g[1].r]};
  if (isFlush) return {rank:5,name:'Flush',tiebreak:ranks};
  if (sh) return {rank:4,name:'Straight',tiebreak:[sh]};
  if (g[0].c===3) return {rank:3,name:'Three of a Kind',tiebreak:[g[0].r,...g.slice(1).map(x=>x.r)]};
  if (g[0].c===2&&g[1]&&g[1].c===2) return {rank:2,name:'Two Pair',tiebreak:[Math.max(g[0].r,g[1].r),Math.min(g[0].r,g[1].r),g[2]?g[2].r:0]};
  if (g[0].c===2) return {rank:1,name:'Pair',tiebreak:[g[0].r,...g.slice(1).map(x=>x.r)]};
  return {rank:0,name:'High Card',tiebreak:ranks};
}

function compareEval(a,b) {
  if (!a&&!b) return 0; if (!a) return -1; if (!b) return 1;
  if (a.rank!==b.rank) return a.rank-b.rank;
  for (let i=0;i<Math.min(a.tiebreak.length,b.tiebreak.length);i++) {
    if (a.tiebreak[i]!==b.tiebreak[i]) return a.tiebreak[i]-b.tiebreak[i];
  }
  return 0;
}

function evaluateBest(cards) {
  if (!cards||cards.length<5) return null;
  const combos = kCombinations(cards,5);
  let best=null, bestCards=null;
  combos.forEach(c => {
    const e = evaluate5(c);
    if (!best||compareEval(e,best)>0) { best=e; bestCards=c; }
  });
  return best ? {...best, bestCards} : null;
}

function findDraws(cards, boardLength) {
  if (boardLength>=5) return [];
  const draws = [];
  const sc = {};
  cards.forEach(c=>sc[c.s]=(sc[c.s]||0)+1);
  Object.entries(sc).forEach(([s,n])=>{ if(n===4) draws.push('Flush draw \u2014 one more '+SUIT_NAMES[s]+' ('+SUIT_SYMBOLS[s]+') completes it'); });
  const rs = new Set(cards.map(c=>c.r));
  if (rs.has(14)) rs.add(1);
  const need = new Set();
  for (let low=1;low<=10;low++) {
    const win=[low,low+1,low+2,low+3,low+4];
    const present=win.filter(x=>rs.has(x)), missing=win.filter(x=>!rs.has(x));
    if (present.length===4&&missing.length===1) need.add(missing[0]===1?14:missing[0]);
  }
  if (need.size>0) draws.push('Straight draw \u2014 a '+[...need].map(r=>RANK_NAMES[r]).join(' or ')+' completes it');
  return draws;
}

function findDecidingKicker(winEval, losingEvals) {
  // Returns the tiebreak index that first separated the winner from all losers, or null for split
  if (!winEval || !losingEvals || losingEvals.length === 0) return null;
  const comparable = losingEvals.filter(le => le && le.rank === winEval.rank);
  if (comparable.length === 0) return null; // different hand ranks decide it
  for (let i = 0; i < winEval.tiebreak.length; i++) {
    const allLess = comparable.every(le => (le.tiebreak[i] || 0) < winEval.tiebreak[i]);
    if (allLess) return i;
  }
  return null; // split pot
}

function describeEvalKicker(ev, decidingPos) {
  // Like describeEval but uses the DECIDING kicker position for winner display
  if (decidingPos === null || decidingPos === undefined) return describeEval(ev);
  const tb = ev.tiebreak;
  const S = RANK_SINGULAR, P = RANK_PLURAL;
  const dk = S[tb[decidingPos]] || '?';
  switch (ev.rank) {
    case 0: return 'High Card \u2014 ' + dk;
    case 1: return 'Pair of ' + P[tb[0]] + ' \u2014 ' + dk + ' kicker';
    case 2:
      if (decidingPos <= 1) return 'Two Pair \u2014 ' + P[tb[0]] + ' & ' + P[tb[1]];
      return 'Two Pair \u2014 ' + P[tb[0]] + ' & ' + P[tb[1]] + ', ' + dk + ' kicker';
    case 3: return 'Three of a Kind \u2014 ' + P[tb[0]] + (decidingPos >= 1 ? ', ' + dk + ' kicker' : '');
    case 5: return 'Flush \u2014 ' + dk + ' High';
    case 7: return 'Four of a Kind \u2014 ' + P[tb[0]] + (decidingPos >= 1 ? ', ' + dk + ' kicker' : '');
    default: return describeEval(ev);
  }
}


function describeHand(holeCards, board) {
  const all=[...holeCards,...board];
  const draws=findDraws(all, board.length);
  if (all.length<5) return {madeHand:null, draws, label:'Waiting for more cards\u2026'};
  const best=evaluateBest(all);
  return {madeHand:best, draws, label: best ? describeEval(best) : 'Unknown'};
}

return { cardLabel, coloredCardHtml, cardKey, describeEval, describeEvalKicker, findDecidingKicker, evaluateBest, compareEval, describeHand, findDraws, RANK_NAMES, SUIT_SYMBOLS, SUIT_NAMES };
});

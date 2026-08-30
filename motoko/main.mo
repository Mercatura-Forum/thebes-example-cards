import Map "mo:core/Map";
import List "mo:core/List";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Array "mo:core/Array";
import VarArray "mo:core/VarArray";
import Blob "mo:core/Blob";
import Runtime "mo:core/Runtime";
import Iter "mo:core/Iter";
import Admin "mo:thebes-lib/Admin";

// Estimation + Tarneeb — 4-player trick-taking games on one shared core.
//
// Trust model (operator decision, Jun-16): this is a CASUAL, NON-GAMBLING game.
// Players create an ephemeral table (session), play, and the table is deleted
// afterward. On a replicated chain ALL state is public, so this is an "open
// table": the SPA shows you your hand and opponents face-down, but the bytes are
// public — fine for a friendly game. True hand-secrecy (vetKeys / mental poker)
// is a documented phase-2; it is NOT needed here.
//
// Fairness that IS real: the deal is shuffled from `raw_rand` (the protocol's
// consensus randomness), so no player — and no single node — can bias the
// shuffle. The shuffle is a deterministic Fisher–Yates over that seed, so every
// replica deals the identical deck.
//
// The property this example proves: CARD CONSERVATION under enforced rules.
// Every move is validated on-chain (turn order, card ownership, follow-suit,
// bid legality, the Σestimates ≠ 13 law), and the public invariant oracle
// `invariantReportView` recomputes, at any moment of any game:
//     Σ cards in hands + cards on the table + 4·(tricks taken)  == 52
//     no card exists in two places at once
//     Σ tricks taken + tricks still to play                     == 13
// An empty report is the proof that no client — friendly or hostile — can
// duplicate, bury or forge a card.
//
// THE HOUSE PLAYS: any open seat can be filled with a house bot. Bots run
// inside the same message as the human's move, through the same validated
// move core — a bot cannot cheat any more than a player can.
persistent actor Cards {

  var admin = Admin.init();
  public shared(msg) func claimOwner() : async Bool { Admin.claimOwner(admin, msg.caller) };
  public query func getOwner() : async ?Principal { Admin.getOwner(admin) };

  // ── Cards ──  id 0..51 : suit = id/13 (0♣ 1♦ 2♥ 3♠), rank = id%13 (0=2 .. 12=A)
  func suitOf(c : Nat) : Nat { c / 13 };
  func rankOf(c : Nat) : Nat { c % 13 };
  // Trump suit code: 0..3 a suit, 4 = No-Trump.
  let NO_TRUMP : Nat = 4;

  // A match is this many hands; the highest score (team score for tarneeb)
  // after the last hand wins the diwan.
  let MATCH_HANDS : Nat = 5;
  // A seat idle longer than this may be nudged (auto-played) by anyone seated.
  let IDLE_NS : Int = 60 * 1_000_000_000;

  public type Game = { #estimation; #tarneeb };
  public type Phase = { #seating; #bidding; #estimating; #playing; #done; #matchover };

  // `card` is the played card id (0..51) for "card.play" events, else -1. It lets
  // the frontend replay a trick faithfully (which seat played which card, in order)
  // — the bots + trick resolution all run inside one message, so without this the
  // SPA could only ever see the settled table, never the round being played out.
  type Event = { at : Int; seat : Int; kind : Text; detail : Text; card : Int };

  // A table is a mutable object held in the Map (var fields persist in place).
  type Table = {
    id : Nat;
    game : Game;
    createdAt : Int;
    events : List.List<Event>;
    var seats : [var ?Principal]; // 4 seats
    var names : [var Text]; // Memphis display names per seat
    var bots : [var Bool]; // house bots
    var phase : Phase;
    var dealer : Nat;
    var hands : [var [Nat]]; // each seat's remaining cards (open-table)
    var trump : Nat; // 0..4 (4 = NT), set after bidding
    var declarer : Nat; // bid winner seat
    var bidNumber : Nat; // contract (tarneeb) / declarer estimate cap (estimation)
    var bidSuitRank : Nat; // highest bid's suit code (for overcall compare)
    var passes : Nat; // consecutive passes in bidding
    var estimates : [var Int]; // estimation: -1 = not yet, else 0..13
    var estimatesMade : Nat; // how many seats have estimated
    var current : Nat; // seat to act
    var leadSuit : Int; // -1 none, else 0..3
    var played : [var Int]; // card each seat played this trick, -1 = none
    var playsThisTrick : Nat;
    var tricksWon : [var Nat]; // per seat this hand
    var scores : [var Int]; // cumulative per seat
    var handNumber : Nat;
    var winnerSeat : Int; // -1 = ongoing, else the winning seat (estimation) / team lead seat (tarneeb)
    var lastMoveAt : Int;
    var rngState : Nat; // per-table PRNG for bot variety (never used for the deal)
  };

  var nextTableId : Nat = 0;
  // `games` was renamed from `tables` to `sessions` in the trick-replay upgrade: adding the
  // structured `card` field to Event made the old `tables` stable type
  // memory-incompatible under EOP. Tables are EPHEMERAL (deleted after each
  // session), so the upgrade drops them by renaming the stable variable — EOP
  // discards the removed `tables` and initialises `sessions` fresh, while `stats`
  // (the leaderboard) and `nextTableId` persist by name. No `with migration`
  // needed for a clean, state-preserving-where-it-matters upgrade.
  let sessions = Map.empty<Nat, Table>();

  // Lifetime results per human player (bots don't keep score in the book).
  type PlayerStats = { name : Text; games : Nat; wins : Nat; points : Int };
  let stats = Map.empty<Principal, PlayerStats>();

  let BOT_NAMES : [Text] = ["Sitt Nadia", "Am Hassan", "Zeinab", "Big Omar"];

  func newTable(id : Nat, game : Game) : Table {
    {
      id; game; createdAt = Time.now();
      events = List.empty<Event>();
      var seats = VarArray.repeat<?Principal>(null, 4);
      var names = VarArray.repeat<Text>("", 4);
      var bots = VarArray.repeat<Bool>(false, 4);
      var phase = #seating;
      var dealer = 0;
      var hands = VarArray.repeat<[Nat]>([], 4);
      var trump = NO_TRUMP;
      var declarer = 0;
      var bidNumber = 0;
      var bidSuitRank = 0;
      var passes = 0;
      var estimates = VarArray.repeat<Int>(-1, 4);
      var estimatesMade = 0;
      var current = 0;
      var leadSuit = -1;
      var played = VarArray.repeat<Int>(-1, 4);
      var playsThisTrick = 0;
      var tricksWon = VarArray.repeat<Nat>(0, 4);
      var scores = VarArray.repeat<Int>(0, 4);
      var handNumber = 0;
      var winnerSeat = -1;
      var lastMoveAt = Time.now();
      var rngState = id * 2654435761 + 97;
    }
  };

  func getTable(id : Nat) : Table {
    switch (Map.get(sessions, Nat.compare, id)) { case (?t) t; case null { Runtime.trap("table not found") } };
  };
  func seatOf(t : Table, caller : Principal) : Int {
    var i = 0;
    while (i < 4) {
      switch (t.seats[i]) {
        case (?p) { if (Principal.equal(p, caller) and not t.bots[i]) return i };
        case null {};
      };
      i += 1;
    };
    -1
  };
  // Resolve the caller's seat (Nat) and require it's their turn, else trap.
  func turnSeat(t : Table, caller : Principal) : Nat {
    let me = seatOf(t, caller);
    if (me < 0) Runtime.trap("You are not seated at this table.");
    let s = Int.abs(me);
    if (s != t.current) Runtime.trap("Not your turn.");
    s
  };
  func clearPlayed(t : Table) { var i = 0; while (i < 4) { t.played[i] := -1; i += 1 } };

  func logEvent(t : Table, seat : Int, kind : Text, detail : Text) {
    List.add(t.events, { at = Time.now(); seat; kind; detail; card = -1 });
  };
  // A card-play event, carrying the structured card id so the SPA can replay the trick.
  func logPlay(t : Table, seat : Int, card : Nat, detail : Text) {
    List.add(t.events, { at = Time.now(); seat; kind = "card.play"; detail; card = Nat.toInt(card) });
  };
  func touch(t : Table) { t.lastMoveAt := Time.now() };

  // Small per-table PRNG (bot flavour only — the DEAL always comes from raw_rand).
  func roll(t : Table, bound : Nat) : Nat {
    t.rngState := (t.rngState * 1103515245 + 12345) % 2147483648;
    if (bound == 0) 0 else t.rngState % bound;
  };

  let SUIT_NAMES : [Text] = ["clubs", "diamonds", "hearts", "spades", "no-trump"];
  func cardName(c : Nat) : Text {
    let ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    ranks[rankOf(c)] # " of " # SUIT_NAMES[suitOf(c)];
  };

  // ── Lobby ──
  // game passed as text ("estimation"|"tarneeb") — the SPA can't encode variants.
  public shared(msg) func createTable(gameText : Text, displayName : Text) : async Nat {
    if (Principal.isAnonymous(msg.caller)) Runtime.trap("Sign in to play.");
    let game : Game = if (gameText == "tarneeb") #tarneeb else #estimation;
    let id = nextTableId;
    nextTableId += 1;
    let t = newTable(id, game);
    t.seats[0] := ?msg.caller;
    t.names[0] := displayName;
    Map.add(sessions, Nat.compare, id, t);
    logEvent(t, 0, "table.open", displayName # " opened the table");
    id
  };

  // Take an open seat. Traps if the table is full or you're already seated.
  public shared(msg) func joinTable(tableId : Nat, displayName : Text) : async Nat {
    if (Principal.isAnonymous(msg.caller)) Runtime.trap("Sign in to play.");
    let t = getTable(tableId);
    if (t.phase != #seating) Runtime.trap("This table has already started.");
    if (seatOf(t, msg.caller) >= 0) Runtime.trap("You are already seated here.");
    var i = 0;
    while (i < 4) {
      switch (t.seats[i]) {
        case null {
          t.seats[i] := ?msg.caller; t.names[i] := displayName;
          logEvent(t, i, "seat.join", displayName # " sat down");
          touch(t);
          return i;
        };
        case (?_) {};
      };
      i += 1;
    };
    Runtime.trap("The table is full.")
  };

  // Fill the next open seat with a house bot. Any seated player may invite
  // the house; "play now" = create a table and add three bots.
  public shared(msg) func addBot(tableId : Nat) : async Nat {
    let t = getTable(tableId);
    if (t.phase != #seating) Runtime.trap("This table has already started.");
    if (seatOf(t, msg.caller) < 0) Runtime.trap("Only a seated player can invite the house.");
    let self = Principal.fromActor(Cards);
    var i = 0;
    while (i < 4) {
      switch (t.seats[i]) {
        case null {
          t.seats[i] := ?self;
          t.bots[i] := true;
          t.names[i] := BOT_NAMES[i];
          logEvent(t, i, "seat.bot", BOT_NAMES[i] # " (the house) sat down");
          touch(t);
          return i;
        };
        case (?_) {};
      };
      i += 1;
    };
    Runtime.trap("The table is full.")
  };

  // Abandon/delete a table (ephemeral session cleanup). Any seated player or the
  // owner may close it.
  public shared(msg) func closeTable(tableId : Nat) : async () {
    let t = getTable(tableId);
    if (seatOf(t, msg.caller) < 0 and not Admin.isOwner(admin, msg.caller)) Runtime.trap("You are not at this table.");
    ignore Map.take(sessions, Nat.compare, tableId);
  };

  // ── Deal: shuffle from raw_rand (consensus beacon) → Fisher–Yates ──
  let ic = actor "aaaaa-aa" : actor { raw_rand : () -> async Blob };

  func deal(t : Table, seed : Blob) {
    // Fisher–Yates over 0..51 using the 32-byte seed as a keystream (re-hashed by
    // index mixing). Deterministic given the seed → identical on every replica.
    let deck = VarArray.repeat<Nat>(0, 52);
    var i = 0; while (i < 52) { deck[i] := i; i += 1 };
    let sb = Blob.toArray(seed);
    let n = sb.size();
    var j : Nat = 51;
    var k : Nat = 0;
    while (j > 0) {
      // mix two seed bytes + the counter into a pseudo-random index in 0..j
      let b0 = Nat8.toNat(sb[k % n]);
      let b1 = Nat8.toNat(sb[(k + 7) % n]);
      let r = (b0 * 256 + b1 + k * 131) % (j + 1);
      let tmp = deck[j]; deck[j] := deck[r]; deck[r] := tmp;
      j -= 1; k += 1;
    };
    // 13 each, seats 0..3
    var s = 0;
    while (s < 4) {
      t.hands[s] := Array.tabulate<Nat>(13, func(x) { deck[s * 13 + x] });
      t.tricksWon[s] := 0;
      t.estimates[s] := -1;
      s += 1;
    };
    t.estimatesMade := 0;
  };

  // Start a hand once all 4 are seated. Awaits raw_rand for the shuffle seed.
  public shared(msg) func startHand(tableId : Nat) : async () {
    let t = getTable(tableId);
    if (seatOf(t, msg.caller) < 0) Runtime.trap("You are not at this table.");
    if (t.phase == #matchover) Runtime.trap("The match is over — call rematch to play again.");
    if (t.phase != #seating and t.phase != #done) Runtime.trap("A hand is in progress.");
    var i = 0; while (i < 4) { if (t.seats[i] == null) Runtime.trap("The table needs 4 players (invite the house?)."); i += 1 };
    let seed = await ic.raw_rand();
    deal(t, seed);
    t.handNumber += 1;
    t.trump := NO_TRUMP;
    t.declarer := t.dealer;
    t.bidNumber := 0;
    t.bidSuitRank := 0;
    t.passes := 0;
    t.leadSuit := -1;
    t.playsThisTrick := 0;
    clearPlayed(t);
    t.winnerSeat := -1;
    t.current := (t.dealer + 1) % 4; // left of dealer bids first
    t.phase := #bidding;
    logEvent(t, -1, "hand.deal", "hand " # Nat.toText(t.handNumber) # " of " # Nat.toText(MATCH_HANDS) # " — shuffled by consensus randomness");
    touch(t);
    runBots(t);
  };

  // Reset the diwan for a rematch (same seats, fresh scores).
  public shared(msg) func rematch(tableId : Nat) : async () {
    let t = getTable(tableId);
    if (seatOf(t, msg.caller) < 0) Runtime.trap("You are not at this table.");
    if (t.phase != #matchover) Runtime.trap("The match is not over.");
    var i = 0; while (i < 4) { t.scores[i] := 0; i += 1 };
    t.handNumber := 0;
    t.winnerSeat := -1;
    t.phase := #done;
    logEvent(t, -1, "match.rematch", "the diwan resets — same seats, fresh scores");
    touch(t);
  };

  // ── The move core: one validated path for humans AND bots ─────────────────
  // Public methods resolve the caller's seat then delegate here; the bot loop
  // calls these directly with the bot's seat. Nobody gets a second rulebook.

  func bidCore(t : Table, me : Nat, number : Nat, suitRank : Nat) {
    if (t.phase != #bidding) Runtime.trap("Bidding is over.");
    if (me != t.current) Runtime.trap("Not your turn.");
    let minBid = switch (t.game) { case (#estimation) 4; case (#tarneeb) 7 };
    if (number < minBid or number > 13 or suitRank > 4) Runtime.trap("Illegal bid.");
    // must beat current high bid: higher number, or equal number & higher suit
    let beats = number > t.bidNumber or (number == t.bidNumber and suitRank > t.bidSuitRank);
    if (t.bidNumber > 0 and not beats) Runtime.trap("Your bid must beat the standing bid.");
    t.bidNumber := number;
    t.bidSuitRank := suitRank;
    t.declarer := me;
    t.passes := 0;
    t.current := (t.current + 1) % 4;
    logEvent(t, me, "bid.raise", t.names[me] # " bids " # Nat.toText(number) # " " # SUIT_NAMES[suitRank]);
    touch(t);
  };

  func passCore(t : Table, me : Nat) {
    if (t.phase != #bidding) Runtime.trap("Bidding is over.");
    if (me != t.current) Runtime.trap("Not your turn.");
    t.passes += 1;
    t.current := (t.current + 1) % 4;
    logEvent(t, me, "bid.pass", t.names[me] # " passes");
    touch(t);
    // Auction ends when there is a high bid and the other 3 have since passed.
    if (t.bidNumber > 0 and t.passes >= 3) {
      settleAuction(t);
    } else if (t.bidNumber == 0 and t.passes >= 4) {
      // All four passed: dealer's burden (house rule) — the dealer is forced
      // to declare the minimum in their longest suit, so no hand ever stalls.
      let minBid = switch (t.game) { case (#estimation) 4; case (#tarneeb) 7 };
      let suit = longestSuit(t.hands[t.dealer]);
      t.bidNumber := minBid;
      t.bidSuitRank := suit;
      t.declarer := t.dealer;
      logEvent(t, t.dealer, "bid.forced", t.names[t.dealer] # " carries the dealer's burden: " # Nat.toText(minBid) # " " # SUIT_NAMES[suit]);
      settleAuction(t);
    };
  };

  func settleAuction(t : Table) {
    t.trump := t.bidSuitRank;
    switch (t.game) {
      case (#estimation) {
        // declarer's estimate is fixed at the bid; others estimate next.
        t.estimates[t.declarer] := t.bidNumber;
        t.estimatesMade := 1;
        t.phase := #estimating;
        t.current := (t.declarer + 1) % 4;
      };
      case (#tarneeb) {
        t.phase := #playing;
        t.current := t.declarer; // contractor leads
      };
    };
    logEvent(t, t.declarer, "bid.won", t.names[t.declarer] # " declares " # Nat.toText(t.bidNumber) # " " # SUIT_NAMES[t.trump]);
  };

  func estimateCore(t : Table, me : Nat, value : Nat) {
    if (t.phase != #estimating) Runtime.trap("Estimating is over.");
    if (me != t.current) Runtime.trap("Not your turn.");
    if (t.estimates[me] >= 0) Runtime.trap("You already estimated.");
    if (value > t.bidNumber) Runtime.trap("Your estimate may not exceed the declarer's bid.");
    // last estimator may not make the total exactly 13
    if (t.estimatesMade == 3) {
      var sum : Int = 0; var i = 0;
      while (i < 4) { if (t.estimates[i] >= 0) sum += t.estimates[i]; i += 1 };
      if (sum + value == 13) Runtime.trap("The four estimates may not total exactly 13.");
    };
    t.estimates[me] := value;
    t.estimatesMade += 1;
    t.current := (t.current + 1) % 4;
    logEvent(t, me, "estimate.set", t.names[me] # " calls " # Nat.toText(value));
    touch(t);
    if (t.estimatesMade == 4) {
      t.phase := #playing;
      t.current := t.declarer; // declarer leads first trick
      t.leadSuit := -1;
    };
  };

  func handContainsCard(hand : [Nat], card : Nat) : Bool {
    switch (Array.find<Nat>(hand, func(c) { c == card })) { case (?_) true; case null false };
  };
  func hasSuit(hand : [Nat], suit : Int) : Bool {
    switch (Array.find<Nat>(hand, func(c) { suitOf(c) == Int.abs(suit) })) { case (?_) true; case null false };
  };

  func playCore(t : Table, seat : Nat, card : Nat) {
    if (t.phase != #playing) Runtime.trap("The hand is not in play.");
    if (seat != t.current) Runtime.trap("Not your turn.");
    if (not handContainsCard(t.hands[seat], card)) Runtime.trap("You don't hold that card.");
    // follow-suit
    if (t.leadSuit >= 0 and suitOf(card) != Int.abs(t.leadSuit) and hasSuit(t.hands[seat], t.leadSuit)) {
      Runtime.trap("You must follow suit.");
    };
    if (t.leadSuit < 0) t.leadSuit := suitOf(card);
    t.played[seat] := card;
    t.hands[seat] := Array.filter<Nat>(t.hands[seat], func(c) { c != card });
    t.playsThisTrick += 1;
    t.current := (t.current + 1) % 4;
    logPlay(t, seat, card, t.names[seat] # " plays the " # cardName(card));
    touch(t);
    if (t.playsThisTrick == 4) resolveTrick(t);
  };

  func resolveTrick(t : Table) {
    let lead = Int.abs(t.leadSuit);
    var best = 0; var bestScore : Int = -1;
    var i = 0;
    while (i < 4) {
      let c = Int.abs(t.played[i]);
      let s = suitOf(c); let r = rankOf(c);
      // trump beats lead; within a suit, higher rank wins
      let score : Int = (if (t.trump != NO_TRUMP and s == t.trump) 200 else if (s == lead) 100 else 0) + r;
      if (score > bestScore) { bestScore := score; best := i };
      i += 1;
    };
    t.tricksWon[best] += 1;
    clearPlayed(t);
    t.playsThisTrick := 0;
    t.leadSuit := -1;
    t.current := best; // winner leads next
    logEvent(t, best, "trick.won", t.names[best] # " takes the trick");
    // hand over when all cards played
    if (t.hands[0].size() == 0 and t.hands[1].size() == 0 and t.hands[2].size() == 0 and t.hands[3].size() == 0) {
      scoreHand(t);
      t.dealer := (t.dealer + 1) % 4;
      if (t.handNumber >= MATCH_HANDS) { endMatch(t) } else { t.phase := #done };
    };
  };

  func scoreHand(t : Table) {
    switch (t.game) {
      case (#estimation) {
        var i = 0;
        while (i < 4) {
          let est = t.estimates[i];
          let won : Int = t.tricksWon[i];
          // Scheme A: exact = 10 + estimate ; miss = -|won-est|
          if (est == won) t.scores[i] += 10 + est
          else { let d = won - est; t.scores[i] += -(Int.abs(d)) };
          i += 1;
        };
      };
      case (#tarneeb) {
        // partnerships: seats 0&2 vs 1&3. Declarer's team is contracted.
        let teamA = t.tricksWon[0] + t.tricksWon[2];
        let teamB = t.tricksWon[1] + t.tricksWon[3];
        let declTeamA = (t.declarer % 2) == 0;
        let won : Nat = if (declTeamA) teamA else teamB;
        let opp : Nat = if (declTeamA) teamB else teamA;
        var declDelta : Int = 0; var oppDelta : Int = 0;
        if (won == 13) { declDelta := (if (t.bidNumber < 13) 16 else 26) }
        else if (won >= t.bidNumber) { declDelta := won }
        else { declDelta := -(Nat.toInt(t.bidNumber)); oppDelta := opp };
        if (declTeamA) { t.scores[0] += declDelta; t.scores[2] += declDelta; t.scores[1] += oppDelta; t.scores[3] += oppDelta }
        else { t.scores[1] += declDelta; t.scores[3] += declDelta; t.scores[0] += oppDelta; t.scores[2] += oppDelta };
      };
    };
    logEvent(t, -1, "hand.scored", "hand " # Nat.toText(t.handNumber) # " scored");
  };

  func endMatch(t : Table) {
    // Estimation: highest individual score. Tarneeb: highest team (lead seat).
    var winner = 0;
    switch (t.game) {
      case (#estimation) {
        var i = 1;
        while (i < 4) { if (t.scores[i] > t.scores[winner]) winner := i; i += 1 };
      };
      case (#tarneeb) {
        let teamA = t.scores[0] + t.scores[2];
        let teamB = t.scores[1] + t.scores[3];
        winner := if (teamA >= teamB) 0 else 1;
      };
    };
    t.winnerSeat := winner;
    t.phase := #matchover;
    logEvent(t, winner, "match.won", t.names[winner] # " takes the diwan");
    // Book the results for the humans.
    var i = 0;
    while (i < 4) {
      if (not t.bots[i]) {
        switch (t.seats[i]) {
          case (?p) {
            let prev = switch (Map.get(stats, Principal.compare, p)) {
              case (?s) s; case null { { name = t.names[i]; games = 0; wins = 0; points = 0 } };
            };
            let isWinner = switch (t.game) {
              case (#estimation) { i == winner };
              case (#tarneeb) { i % 2 == winner % 2 };
            };
            Map.add(stats, Principal.compare, p, {
              name = t.names[i];
              games = prev.games + 1;
              wins = prev.wins + (if (isWinner) 1 else 0);
              points = prev.points + t.scores[i];
            });
          };
          case null {};
        };
      };
      i += 1;
    };
  };

  // ── The house's brain: modest, legal, and running on the same rails ──────
  func longestSuit(hand : [Nat]) : Nat {
    let counts = VarArray.repeat<Nat>(0, 4);
    for (c in hand.values()) { counts[suitOf(c)] += 1 };
    var best = 0; var i = 1;
    while (i < 4) { if (counts[i] > counts[best]) best := i; i += 1 };
    best
  };
  func handStrength(hand : [Nat]) : Nat {
    // A=3, K=2, Q=1 across the hand — a crude honour count.
    var s = 0;
    for (c in hand.values()) {
      let r = rankOf(c);
      if (r == 12) s += 3 else if (r == 11) s += 2 else if (r == 10) s += 1;
    };
    s
  };
  func sureTricks(hand : [Nat], trump : Nat) : Nat {
    var n = 0;
    for (c in hand.values()) {
      if (rankOf(c) >= 11) n += 1; // A or K
      if (trump != NO_TRUMP and suitOf(c) == trump and rankOf(c) >= 9) n += 1;
    };
    if (n > 13) 13 else n
  };

  func botBid(t : Table, me : Nat) {
    let minBid = switch (t.game) { case (#estimation) 4; case (#tarneeb) 7 };
    let strength = handStrength(t.hands[me]);
    let threshold = switch (t.game) { case (#estimation) 8; case (#tarneeb) 10 };
    let suit = longestSuit(t.hands[me]);
    // Bid only over the opening threshold and only if it's legal to.
    let beats = minBid > t.bidNumber or (minBid == t.bidNumber and suit > t.bidSuitRank);
    if (strength >= threshold and beats and roll(t, 4) > 0) {
      bidCore(t, me, minBid, suit);
    } else {
      passCore(t, me);
    };
  };

  func botEstimate(t : Table, me : Nat) {
    var v = sureTricks(t.hands[me], t.trump);
    if (v > t.bidNumber) v := t.bidNumber;
    // last estimator: dodge the Σ = 13 law, staying legal.
    if (t.estimatesMade == 3) {
      var sum : Int = 0; var i = 0;
      while (i < 4) { if (t.estimates[i] >= 0) sum += t.estimates[i]; i += 1 };
      if (sum + v == 13) { if (v > 0) v -= 1 else v += 1 };
      if (v > t.bidNumber) v := t.bidNumber;
    };
    estimateCore(t, me, v);
  };

  func botPlay(t : Table, me : Nat) {
    let hand = t.hands[me];
    // Legal candidates: follow suit if we can, else anything.
    let mustFollow = t.leadSuit >= 0 and hasSuit(hand, t.leadSuit);
    let legal = if (mustFollow) {
      Array.filter<Nat>(hand, func(c) { suitOf(c) == Int.abs(t.leadSuit) });
    } else { hand };
    // Current best on the table (same scoring as resolveTrick).
    var bestScore : Int = -1;
    var i = 0;
    while (i < 4) {
      if (t.played[i] >= 0) {
        let c = Int.abs(t.played[i]);
        let s = suitOf(c); let r = rankOf(c);
        let sc : Int = (if (t.trump != NO_TRUMP and s == t.trump) 200 else if (t.leadSuit >= 0 and s == Int.abs(t.leadSuit)) 100 else 0) + r;
        if (sc > bestScore) bestScore := sc;
      };
      i += 1;
    };
    // Cheapest card that would currently win, else our lowest legal card.
    var pick : Int = -1; var pickScore : Int = 999;
    var low : Nat = legal[0]; var lowRank = rankOf(legal[0]);
    for (c in legal.values()) {
      let s = suitOf(c); let r = rankOf(c);
      let sc : Int = (if (t.trump != NO_TRUMP and s == t.trump) 200 else if (t.leadSuit < 0 or s == Int.abs(t.leadSuit)) 100 else 0) + r;
      if (sc > bestScore and sc < pickScore) { pick := c; pickScore := sc };
      if (r < lowRank) { low := c; lowRank := r };
    };
    let card = if (pick >= 0 and roll(t, 5) > 0) Int.abs(pick) else low;
    playCore(t, me, card);
  };

  // Drain bot turns after any state change. Bounded — a full hand is at most
  // 4 bids + 4 estimates + 52 plays, so 80 covers any legal drain.
  func runBots(t : Table) {
    var guard = 0;
    label l while (guard < 80) {
      guard += 1;
      if (t.phase != #bidding and t.phase != #estimating and t.phase != #playing) break l;
      if (not t.bots[t.current]) break l;
      let me = t.current;
      switch (t.phase) {
        case (#bidding) botBid(t, me);
        case (#estimating) botEstimate(t, me);
        case (#playing) botPlay(t, me);
        case _ {};
      };
    };
  };

  // ── Public moves (humans) — resolve seat, delegate to the core, run bots ──
  public shared(msg) func bid(tableId : Nat, number : Nat, suitRank : Nat) : async () {
    let t = getTable(tableId);
    bidCore(t, turnSeat(t, msg.caller), number, suitRank);
    runBots(t);
  };
  public shared(msg) func passBid(tableId : Nat) : async () {
    let t = getTable(tableId);
    passCore(t, turnSeat(t, msg.caller));
    runBots(t);
  };
  public shared(msg) func estimate(tableId : Nat, value : Nat) : async () {
    let t = getTable(tableId);
    estimateCore(t, turnSeat(t, msg.caller), value);
    runBots(t);
  };
  public shared(msg) func playCard(tableId : Nat, card : Nat) : async () {
    let t = getTable(tableId);
    playCore(t, turnSeat(t, msg.caller), card);
    runBots(t);
  };

  // A stalled HUMAN seat can be nudged by anyone seated once it has idled past
  // the window: the house plays one legal move on their behalf. Bots never
  // idle (they move inside the same message), so play can always continue.
  public shared(msg) func nudge(tableId : Nat) : async () {
    let t = getTable(tableId);
    if (seatOf(t, msg.caller) < 0) Runtime.trap("You are not at this table.");
    if (t.phase != #bidding and t.phase != #estimating and t.phase != #playing) Runtime.trap("Nothing to nudge.");
    if (Time.now() - t.lastMoveAt < IDLE_NS) Runtime.trap("Give them a moment — the idle window hasn't passed.");
    let me = t.current;
    if (t.bots[me]) Runtime.trap("The house is thinking (this should not happen).");
    logEvent(t, Nat.toInt(me), "seat.nudged", t.names[me] # " idled — the house plays their turn");
    switch (t.phase) {
      case (#bidding) passCore(t, me); // the gentlest legal move
      case (#estimating) botEstimate(t, me);
      case (#playing) botPlay(t, me);
      case _ {};
    };
    runBots(t);
  };

  // ── The proof: card conservation, recomputable by anyone, any time ───────
  public query func invariantReportView(tableId : Nat) : async [{
    rule : Text; expected : Nat; actual : Nat;
  }] {
    let t = getTable(tableId);
    let bad = List.empty<{ rule : Text; expected : Nat; actual : Nat }>();
    if (t.phase == #playing or t.phase == #estimating or t.phase == #bidding) {
      // conservation: hands + on the table + consumed by tricks == 52
      var inHands = 0; var s = 0;
      while (s < 4) { inHands += t.hands[s].size(); s += 1 };
      var tricks = 0; s := 0;
      while (s < 4) { tricks += t.tricksWon[s]; s += 1 };
      let accounted = inHands + t.playsThisTrick + tricks * 4;
      if (accounted != 52) {
        List.add(bad, { rule = "conservation"; expected = 52; actual = accounted });
      };
      // no card in two places at once (live cards: hands + current trick)
      let seen = VarArray.repeat<Bool>(false, 52);
      var dupes = 0;
      s := 0;
      while (s < 4) {
        for (c in t.hands[s].values()) { if (seen[c]) dupes += 1 else seen[c] := true };
        if (t.played[s] >= 0) { let c = Int.abs(t.played[s]); if (seen[c]) dupes += 1 else seen[c] := true };
        s += 1;
      };
      if (dupes != 0) {
        List.add(bad, { rule = "uniqueness"; expected = 0; actual = dupes });
      };
      // tricks law: taken + still to play == 13
      let remaining = (inHands + t.playsThisTrick) / 4;
      if (tricks + remaining != 13) {
        List.add(bad, { rule = "tricks-law"; expected = 13; actual = tricks + remaining });
      };
      // the Σestimates ≠ 13 law, once all four are in
      switch (t.game) {
        case (#estimation) {
          if (t.estimatesMade == 4) {
            var sum : Int = 0; var i = 0;
            while (i < 4) { sum += t.estimates[i]; i += 1 };
            if (sum == 13) { List.add(bad, { rule = "estimates-law"; expected = 0; actual = 13 }) };
          };
        };
        case (#tarneeb) {};
      };
      // the acting seat must be seated
      if (t.seats[t.current] == null) {
        List.add(bad, { rule = "turn-seated"; expected = 1; actual = 0 });
      };
    };
    List.toArray(bad)
  };

  // One line for the lobby: every active table audited in a single query.
  public query func conservationView() : async [{
    tablesChecked : Nat; violations : Nat; liveGames : Nat; checkedAt : Int;
  }] {
    var checked = 0; var violations = 0; var live = 0;
    for ((_, t) in Map.entries(sessions)) {
      checked += 1;
      if (t.phase == #playing or t.phase == #bidding or t.phase == #estimating) {
        live += 1;
        var inHands = 0; var tricks = 0; var s = 0;
        while (s < 4) { inHands += t.hands[s].size(); tricks += t.tricksWon[s]; s += 1 };
        if (inHands + t.playsThisTrick + tricks * 4 != 52) violations += 1;
      };
    };
    [{ tablesChecked = checked; violations; liveGames = live; checkedAt = Time.now() }]
  };

  // ── Frontend views (flat vec-of-records — the SPA's decoder reads these) ──
  func phaseText(p : Phase) : Text {
    switch (p) {
      case (#seating) "seating"; case (#bidding) "bidding"; case (#estimating) "estimating";
      case (#playing) "playing"; case (#done) "done"; case (#matchover) "matchover";
    };
  };
  func gameText(g : Game) : Text { switch (g) { case (#estimation) "estimation"; case (#tarneeb) "tarneeb" } };

  public shared query(msg) func gameStateView(tableId : Nat) : async [{
    game : Text; phase : Text; dealer : Nat; current : Nat; trump : Nat;
    bidNumber : Nat; bidSuitRank : Nat; declarer : Nat; handNumber : Nat; matchHands : Nat;
    mySeat : Int; leadSuit : Int; winnerSeat : Int; version : Nat; eventSeq : Nat;
    lastMoveAt : Int; nowNs : Int; idleNs : Int;
  }] {
    let t = getTable(tableId);
    let seq = List.size(t.events);
    let v = seq * 1000 + t.playsThisTrick * 10 + t.current;
    [{
      game = gameText(t.game); phase = phaseText(t.phase); dealer = t.dealer; current = t.current;
      trump = t.trump; bidNumber = t.bidNumber; bidSuitRank = t.bidSuitRank; declarer = t.declarer;
      handNumber = t.handNumber; matchHands = MATCH_HANDS;
      mySeat = seatOf(t, msg.caller); leadSuit = t.leadSuit; winnerSeat = t.winnerSeat; version = v; eventSeq = seq;
      lastMoveAt = t.lastMoveAt; nowNs = Time.now(); idleNs = IDLE_NS;
    }]
  };

  public query func seatsView(tableId : Nat) : async [{
    seat : Nat; name : Text; seated : Bool; isBot : Bool; estimate : Int;
    tricksWon : Nat; score : Int; played : Int; cardsLeft : Nat;
  }] {
    let t = getTable(tableId);
    Array.tabulate<{ seat : Nat; name : Text; seated : Bool; isBot : Bool; estimate : Int; tricksWon : Nat; score : Int; played : Int; cardsLeft : Nat }>(4, func(i) {
      {
        seat = i; name = t.names[i]; seated = t.seats[i] != null; isBot = t.bots[i];
        estimate = t.estimates[i]; tricksWon = t.tricksWon[i]; score = t.scores[i];
        played = t.played[i]; cardsLeft = t.hands[i].size();
      }
    })
  };

  public shared query(msg) func myHandView(tableId : Nat) : async [{ card : Nat }] {
    let t = getTable(tableId);
    let me = seatOf(t, msg.caller);
    if (me < 0) return [];
    Array.map<Nat, { card : Nat }>(t.hands[Int.abs(me)], func(c) { { card = c } })
  };

  // The table's story, newest first (bids, plays, tricks, scores).
  public query func tableEventsView(tableId : Nat, offset : Nat, limit : Nat) : async [{
    at : Int; seat : Int; kind : Text; detail : Text; card : Int;
  }] {
    let t = getTable(tableId);
    let n = List.size(t.events);
    if (offset >= n) return [];
    // Cap generous enough that one message's worth of events (a full trick +
    // the lead-up to the next human turn) fits in a single replay fetch.
    let take = Nat.min(Nat.min(limit, 128), n - offset);
    let out = List.empty<{ at : Int; seat : Int; kind : Text; detail : Text; card : Int }>();
    var i = 0;
    for (e in List.reverseValues(t.events)) {
      if (i >= offset and i < offset + take) { List.add(out, e) };
      i += 1;
    };
    List.toArray(out)
  };

  // Open tables awaiting players (lobby list) + tables in play (to watch).
  public query func openTables() : async [{
    id : Nat; game : Text; seatsTaken : Nat; bots : Nat; phase : Text; handNumber : Nat;
  }] {
    let arr = Map.toArray<Nat, Table>(sessions);
    Array.map<(Nat, Table), { id : Nat; game : Text; seatsTaken : Nat; bots : Nat; phase : Text; handNumber : Nat }>(
      arr,
      func((_, t)) {
        var n = 0; var b = 0; var i = 0;
        while (i < 4) { if (t.seats[i] != null) n += 1; if (t.bots[i]) b += 1; i += 1 };
        { id = t.id; game = gameText(t.game); seatsTaken = n; bots = b; phase = phaseText(t.phase); handNumber = t.handNumber }
      },
    )
  };

  // The diwan's book: lifetime results for signed-in players, best first.
  public query func leaderboardView(limit : Nat) : async [{
    name : Text; games : Nat; wins : Nat; points : Int;
  }] {
    let all = Iter.toArray(Map.values(stats));
    let sorted = Array.sort<PlayerStats>(all, func(a, b) {
      if (a.wins > b.wins) #less else if (a.wins < b.wins) #greater
      else if (a.points > b.points) #less else if (a.points < b.points) #greater
      else #equal
    });
    let take = Nat.min(Nat.min(limit, 50), sorted.size());
    Array.tabulate<{ name : Text; games : Nat; wins : Nat; points : Int }>(take, func(i) {
      let s = sorted[i];
      { name = s.name; games = s.games; wins = s.wins; points = s.points }
    })
  };

  public shared query(msg) func myStatsView() : async [{ name : Text; games : Nat; wins : Nat; points : Int }] {
    switch (Map.get(stats, Principal.compare, msg.caller)) {
      case (?s) { [{ name = s.name; games = s.games; wins = s.wins; points = s.points }] };
      case null { [] };
    };
  };
}

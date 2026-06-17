import Map "mo:core/Map";
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
// Identity: players sign in with Memphis (passkey) in the SPA; a seat is bound to
// the session sender (`msg.caller`) at join, and every move is turn-gated to that
// sender. The Memphis display name is carried for the UI.
persistent actor Cards {

  var admin = Admin.init();
  public shared(msg) func claimOwner() : async Bool { Admin.claimOwner(admin, msg.caller) };
  public query func getOwner() : async ?Principal { Admin.getOwner(admin) };

  // ── Cards ──  id 0..51 : suit = id/13 (0♣ 1♦ 2♥ 3♠), rank = id%13 (0=2 .. 12=A)
  func suitOf(c : Nat) : Nat { c / 13 };
  func rankOf(c : Nat) : Nat { c % 13 };
  // Trump suit code: 0..3 a suit, 4 = No-Trump.
  let NO_TRUMP : Nat = 4;

  public type Game = { #estimation; #tarneeb };
  public type Phase = { #seating; #bidding; #estimating; #playing; #done };

  // A table is a mutable object held in the Map (var fields persist in place).
  type Table = {
    id : Nat;
    game : Game;
    createdAt : Int;
    var seats : [var ?Principal]; // 4 seats
    var names : [var Text]; // Memphis display names per seat
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
    var winnerSeat : Int; // -1 = ongoing, else the winning seat/team
  };

  var nextTableId : Nat = 0;
  let tables = Map.empty<Nat, Table>();

  func newTable(id : Nat, game : Game) : Table {
    {
      id; game; createdAt = Time.now();
      var seats = VarArray.repeat<?Principal>(null, 4);
      var names = VarArray.repeat<Text>("", 4);
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
    }
  };

  func getTable(id : Nat) : Table {
    switch (Map.get(tables, Nat.compare, id)) { case (?t) t; case null { Runtime.trap("table not found") } };
  };
  func seatOf(t : Table, caller : Principal) : Int {
    var i = 0;
    while (i < 4) { switch (t.seats[i]) { case (?p) { if (Principal.equal(p, caller)) return i }; case null {} }; i += 1 };
    -1
  };
  // Resolve the caller's seat (Nat) and require it's their turn, else trap.
  func turnSeat(t : Table, caller : Principal) : Nat {
    let me = seatOf(t, caller);
    if (me < 0) Runtime.trap("not seated at this table");
    let s = Int.abs(me);
    if (s != t.current) Runtime.trap("not your turn");
    s
  };
  func clearPlayed(t : Table) { var i = 0; while (i < 4) { t.played[i] := -1; i += 1 } };

  // ── Lobby ──
  // game passed as text ("estimation"|"tarneeb") — the SPA can't encode variants.
  public shared(msg) func createTable(gameText : Text, displayName : Text) : async Nat {
    let game : Game = if (gameText == "tarneeb") #tarneeb else #estimation;
    let id = nextTableId;
    nextTableId += 1;
    let t = newTable(id, game);
    t.seats[0] := ?msg.caller;
    t.names[0] := displayName;
    Map.add(tables, Nat.compare, id, t);
    id
  };

  // Take an open seat. Traps if the table is full or you're already seated.
  public shared(msg) func joinTable(tableId : Nat, displayName : Text) : async Nat {
    let t = getTable(tableId);
    if (t.phase != #seating) Runtime.trap("table already started");
    if (seatOf(t, msg.caller) >= 0) Runtime.trap("already seated");
    var i = 0;
    while (i < 4) {
      switch (t.seats[i]) {
        case null { t.seats[i] := ?msg.caller; t.names[i] := displayName; return i };
        case (?_) {};
      };
      i += 1;
    };
    Runtime.trap("table is full")
  };

  // Abandon/delete a table (ephemeral session cleanup). Any seated player or the
  // owner may close it.
  public shared(msg) func closeTable(tableId : Nat) : async () {
    let t = getTable(tableId);
    if (seatOf(t, msg.caller) < 0 and not Admin.isOwner(admin, msg.caller)) Runtime.trap("not at this table");
    ignore Map.take(tables, Nat.compare, tableId);
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
    if (seatOf(t, msg.caller) < 0) Runtime.trap("not at this table");
    if (t.phase != #seating and t.phase != #done) Runtime.trap("hand in progress");
    var i = 0; while (i < 4) { if (t.seats[i] == null) Runtime.trap("need 4 players"); i += 1 };
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
  };

  // ── Bidding ──
  // Estimation: bid = (number>=4, suitRank 0..4). Highest bidder is declarer +
  //   sets trump; then everyone estimates. Tarneeb: bid = (number>=7, suitRank);
  //   highest sets contract + trump; play begins immediately.
  public shared(msg) func bid(tableId : Nat, number : Nat, suitRank : Nat) : async () {
    let t = getTable(tableId);
    if (t.phase != #bidding) Runtime.trap("not bidding");
    let me = turnSeat(t, msg.caller);
    let minBid = switch (t.game) { case (#estimation) 4; case (#tarneeb) 7 };
    if (number < minBid or number > 13 or suitRank > 4) Runtime.trap("illegal bid");
    // must beat current high bid: higher number, or equal number & higher suit
    let beats = number > t.bidNumber or (number == t.bidNumber and suitRank > t.bidSuitRank);
    if (t.bidNumber > 0 and not beats) Runtime.trap("bid too low");
    t.bidNumber := number;
    t.bidSuitRank := suitRank;
    t.declarer := me;
    t.passes := 0;
    t.current := (t.current + 1) % 4;
  };

  public shared(msg) func passBid(tableId : Nat) : async () {
    let t = getTable(tableId);
    if (t.phase != #bidding) Runtime.trap("not bidding");
    ignore turnSeat(t, msg.caller);
    t.passes += 1;
    t.current := (t.current + 1) % 4;
    // Auction ends when there is a high bid and the other 3 have since passed.
    if (t.bidNumber > 0 and t.passes >= 3) {
      t.trump := t.bidSuitRank;
      switch (t.game) {
        case (#estimation) {
          // declarer's estimate is fixed at the bid; others estimate next.
          t.estimates[t.declarer] := bidNumberToInt(t.bidNumber);
          t.estimatesMade := 1;
          t.phase := #estimating;
          t.current := (t.declarer + 1) % 4;
        };
        case (#tarneeb) {
          t.phase := #playing;
          t.current := t.declarer; // contractor leads
        };
      };
    };
  };
  func bidNumberToInt(n : Nat) : Int { n };

  // ── Estimation: every non-declarer estimates; Σ(estimates) ≠ 13 ──
  public shared(msg) func estimate(tableId : Nat, value : Nat) : async () {
    let t = getTable(tableId);
    if (t.phase != #estimating) Runtime.trap("not estimating");
    let me = turnSeat(t, msg.caller);
    if (t.estimates[me] >= 0) Runtime.trap("already estimated");
    if (value > t.bidNumber) Runtime.trap("estimate exceeds the declarer's bid");
    // last estimator may not make the total exactly 13
    if (t.estimatesMade == 3) {
      var sum : Int = 0; var i = 0;
      while (i < 4) { if (t.estimates[i] >= 0) sum += t.estimates[i]; i += 1 };
      if (sum + value == 13) Runtime.trap("total estimates may not equal 13");
    };
    t.estimates[me] := value;
    t.estimatesMade += 1;
    t.current := (t.current + 1) % 4;
    if (t.estimatesMade == 4) {
      t.phase := #playing;
      t.current := t.declarer; // declarer leads first trick
      t.leadSuit := -1;
    };
  };

  // ── Trick play ──
  func handContains(t : Table, seat : Int, card : Nat) : Bool {
    switch (Array.find<Nat>(t.hands[Int.abs(seat)], func(c) { c == card })) { case (?_) true; case null false };
  };
  func hasSuit(t : Table, seat : Nat, suit : Int) : Bool {
    switch (Array.find<Nat>(t.hands[seat], func(c) { suitOf(c) == Int.abs(suit) })) { case (?_) true; case null false };
  };

  public shared(msg) func playCard(tableId : Nat, card : Nat) : async () {
    let t = getTable(tableId);
    if (t.phase != #playing) Runtime.trap("not in play");
    let seat = turnSeat(t, msg.caller);
    if (not handContains(t, seat, card)) Runtime.trap("you don't hold that card");
    // follow-suit
    if (t.leadSuit >= 0 and suitOf(card) != Int.abs(t.leadSuit) and hasSuit(t, seat, t.leadSuit)) {
      Runtime.trap("must follow suit");
    };
    if (t.leadSuit < 0) t.leadSuit := suitOf(card);
    t.played[seat] := card;
    t.hands[seat] := Array.filter<Nat>(t.hands[seat], func(c) { c != card });
    t.playsThisTrick += 1;
    t.current := (t.current + 1) % 4;
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
    // hand over when all cards played
    if (t.hands[0].size() == 0 and t.hands[1].size() == 0 and t.hands[2].size() == 0 and t.hands[3].size() == 0) {
      scoreHand(t);
      t.dealer := (t.dealer + 1) % 4;
      t.phase := #done;
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
        else { declDelta := -(bidNumberToInt(t.bidNumber)); oppDelta := opp };
        if (declTeamA) { t.scores[0] += declDelta; t.scores[2] += declDelta; t.scores[1] += oppDelta; t.scores[3] += oppDelta }
        else { t.scores[1] += declDelta; t.scores[3] += declDelta; t.scores[0] += oppDelta; t.scores[2] += oppDelta };
      };
    };
  };

  // ── Frontend views (flat vec-of-records — the SPA's decoder reads these) ──
  // Split into three flat queries so the lightweight Candid decoder suffices:
  // gameStateView (1-element scalar record), seatsView (4 seat rows), and
  // myHandView (the caller's cards as one-field rows). Open table: all hands are
  // public state anyway; myHandView returns only yours for convenience.
  func phaseText(p : Phase) : Text {
    switch (p) { case (#seating) "seating"; case (#bidding) "bidding"; case (#estimating) "estimating"; case (#playing) "playing"; case (#done) "done" };
  };
  func gameText(g : Game) : Text { switch (g) { case (#estimation) "estimation"; case (#tarneeb) "tarneeb" } };

  public shared query(msg) func gameStateView(tableId : Nat) : async [{ game : Text; phase : Text; dealer : Nat; current : Nat; trump : Nat; bidNumber : Nat; declarer : Nat; handNumber : Nat; mySeat : Int; leadSuit : Int; version : Nat }] {
    let t = getTable(tableId);
    let v = t.handNumber * 100000 + (switch (t.phase) { case (#seating) 0; case (#bidding) 1; case (#estimating) 2; case (#playing) 3; case (#done) 4 }) * 10000 + t.playsThisTrick * 1000 + t.current * 100 + t.bidNumber;
    [{ game = gameText(t.game); phase = phaseText(t.phase); dealer = t.dealer; current = t.current; trump = t.trump; bidNumber = t.bidNumber; declarer = t.declarer; handNumber = t.handNumber; mySeat = seatOf(t, msg.caller); leadSuit = t.leadSuit; version = v }]
  };

  public query func seatsView(tableId : Nat) : async [{ seat : Nat; name : Text; seated : Bool; estimate : Int; tricksWon : Nat; score : Int; played : Int }] {
    let t = getTable(tableId);
    Array.tabulate<{ seat : Nat; name : Text; seated : Bool; estimate : Int; tricksWon : Nat; score : Int; played : Int }>(4, func(i) {
      { seat = i; name = t.names[i]; seated = t.seats[i] != null; estimate = t.estimates[i]; tricksWon = t.tricksWon[i]; score = t.scores[i]; played = t.played[i] }
    })
  };

  public shared query(msg) func myHandView(tableId : Nat) : async [{ card : Nat }] {
    let t = getTable(tableId);
    let me = seatOf(t, msg.caller);
    if (me < 0) return [];
    Array.map<Nat, { card : Nat }>(t.hands[Int.abs(me)], func(c) { { card = c } })
  };

  // Open tables awaiting players (lobby list).
  public query func openTables() : async [{ id : Nat; game : Text; seatsTaken : Nat }] {
    let arr = Map.toArray<Nat, Table>(tables);
    Array.map<(Nat, Table), { id : Nat; game : Text; seatsTaken : Nat }>(
      Array.filter<(Nat, Table)>(arr, func((_, t)) { t.phase == #seating }),
      func((_, t)) {
        var n = 0; var i = 0; while (i < 4) { if (t.seats[i] != null) n += 1; i += 1 };
        { id = t.id; game = (switch (t.game) { case (#estimation) "estimation"; case (#tarneeb) "tarneeb" }); seatsTaken = n }
      },
    )
  };
}

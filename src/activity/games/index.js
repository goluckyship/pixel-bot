// Every Pixel Arcade game that lives in this folder, in lobby order.
const boards = require('./boards');
const duels = require('./duels');
const partyGames = require('./party');

const list = [
  boards.checkers, boards.reversi, boards.gomoku, boards.ultimate,
  duels.dots, duels.mancala, duels.battleship, duels.chopsticks, duels.nim, duels.rps, duels.memory,
  partyGames.wordScramble, partyGames.quickMath, partyGames.emojiRiddles, partyGames.trueFalse, partyGames.capitals,
  partyGames.higherLower, partyGames.typingRace, partyGames.guessNumber, partyGames.codeBreaker, partyGames.simon,
  partyGames.hangman, partyGames.wordChain, partyGames.blackjack, partyGames.pig, partyGames.snakes,
];

const GAMES = Object.fromEntries(list.map((g) => [g.id, g]));
module.exports = { GAMES, list };

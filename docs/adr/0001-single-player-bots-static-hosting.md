# Single-player bots on static hosting

Tumble Rush is a single-player Show against 15 AI Tumblers, shipped as a static site with no backend. Real-time multiplayer would require authoritative servers, netcode, matchmaking, and anti-cheat, none of which strengthen the core fantasy of a readable game show. The cost is that all the personality and fairness work lands on the bot AI, but it also keeps the game instant to play, free to host, and deployable on GitHub Pages.

**Consequences:** progression is local-only; there is no cross-device sync or global leaderboard; the bot controller and the player controller share one physics path by design.

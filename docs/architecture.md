# System Architecture - World Cup 2026 Simulation Platform

This document describes the design principles, architectural patterns, and layer configurations of the simulator.

---

## 1. Domain-Driven Design & Monorepo Modules

We use a monorepo setup to share physics, tactical formulas, schemas, and bracket trees between client (React) and server (Node).

```
/shared
  ├── src/types.ts         <- Data definitions (Player, Team, MatchSimulationState)
  ├── src/vector.ts        <- 2D vector mathematics library
  ├── src/physics.ts       <- 3D height ball dynamics & touchline boundary collisions
  ├── src/tactics.ts       <- Coordinate mapping for 4 tactical formations & styles
  ├── src/engine.ts        <- Core match simulator game loop (10Hz decide-move-act cycle)
  ├── src/generator.ts     <- Roster generator for 48 nations based on rankings
  └── src/tournament.ts    <- Group table standing calculator & bracket trees
```

### Clean Architecture Layers

1. **Domain Layer (Shared Core)**: Holds pure mathematical models and structures (physics, vector calculus, tactical shifts). It is entirely side-effect-free, highly testable, and executes identical code in browser and Node environments.
2. **Infrastructure Layer (Backend)**: Connects domain engines to database (PostgreSQL), memory stores (Redis), and network channels (Express endpoints & WebSockets).
3. **Presentation Layer (Frontend Client)**: Visualizes the domain state at 60 FPS using React layout cards and the PixiJS WebGL canvas.

---

## 2. Simulation Tick & 60 FPS Visual Interpolation

To ensure fluid visual tracking, we split simulation calculation from screen rendering:
* The **Simulation Engine** runs at a logical tick rate of **10Hz** ($1\text{ tick} = 100\text{ms}$ of game time). Running it at a lower frequency saves CPU cycles and network bandwidth.
* The **Visual Renderer (PixiJS)** runs at **60Hz** (browser frame rate).
* In the PixiJS render ticker loop, we apply **exponential smoothing** to interpolate coordinate changes smoothly across network updates:
  $$\mathbf{p}_{\text{visual}}(t+1) = \mathbf{p}_{\text{visual}}(t) + (\mathbf{p}_{\text{simulation}} - \mathbf{p}_{\text{visual}}(t)) \times \alpha$$
  where $\alpha = 0.25$ for players and $\alpha = 0.35$ for the ball. This ensures the client sees fluid movement even during network speed changes.

---

## 3. Goalkeeper and Field Mirroring

To maintain coordinates consistency:
* Home team always attacks left-to-right (from $x=0$ towards $x=105$).
* Away team attacks right-to-left (from $x=105$ towards $x=0$).
* Coordinates for the away team's players are automatically mirrored mathematically in the tactical mapping:
  $$x_{\text{away}} = 105 - x_{\text{home\_base}}$$
  $$y_{\text{away}} = 68 - y_{\text{home\_base}}$$
This keeps all game physics calculations unified, making it extremely easy to debug.

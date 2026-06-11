import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { MatchSimulationState, PlayerOnPitchState, Player, getSetPieceTargetPosition } from 'shared';

// Helper to get a realistic manager name based on team ID
const getManagerName = (teamId: string, teamName: string): string => {
  const managers: Record<string, string> = {
    ALG: 'Vladimir Petković',
    ARG: 'Lionel Scaloni',
    AUS: 'Tony Popovic',
    AUT: 'Ralf Rangnick',
    BEL: 'Rudi Garcia',
    BIH: 'Sergej Barbarez',
    BRA: 'Carlo Ancelotti',
    CAN: 'Jesse Marsch',
    CIV: 'Emerse Faé',
    COD: 'Sébastien Desabre',
    COL: 'Néstor Lorenzo',
    CPV: 'Pedro "Bubista" Brito',
    CRO: 'Zlatko Dalić',
    CUW: 'Dick Advocaat',
    CZE: 'Miroslav Koubek',
    ECU: 'Sebastián Beccacece',
    EGY: 'Hossam Hassan',
    ENG: 'Thomas Tuchel',
    ESP: 'Luis de la Fuente',
    FRA: 'Didier Deschamps',
    GER: 'Julian Nagelsmann',
    GHA: 'Carlos Queiroz',
    HTI: 'Sébastien Migné',
    IRN: 'Amir Ghalenoei',
    IRQ: 'Graham Arnold',
    JOR: 'Jamal Sellami',
    JPN: 'Hajime Moriyasu',
    KOR: 'Hong Myung-bo',
    KSA: 'Georgios Donis',
    MAR: 'Mohamed Ouahbi',
    MEX: 'Javier Aguirre',
    NED: 'Ronald Koeman',
    NOR: 'Ståle Solbakken',
    NZL: 'Darren Bazeley',
    PAN: 'Thomas Christiansen',
    PAR: 'Gustavo Alfaro',
    POR: 'Roberto Martínez',
    QAT: 'Julen Lopetegui',
    RSA: 'Hugo Broos',
    SCO: 'Steve Clarke',
    SEN: 'Pape Thiaw',
    SUI: 'Murat Yakin',
    SWE: 'Graham Potter',
    TUN: 'Sabri Lamouchi',
    TUR: 'Vincenzo Montella',
    URU: 'Marcelo Bielsa',
    USA: 'Mauricio Pochettino',
    UZB: 'Fabio Cannavaro'
  };
  if (managers[teamId]) return managers[teamId];
  
  const firstNames = ['Carlo', 'Pep', 'José', 'Jürgen', 'Zinedine', 'Antonio', 'Roberto', 'Louis', 'Fatih', 'Marcelo', 'Jorge', 'Hervé', 'Didier', 'Gareth', 'Luis'];
  const lastNames = ['Silva', 'Santos', 'Müller', 'García', 'Smith', 'Jones', 'Bianchi', 'Rossi', 'Martínez', 'Kovac', 'Kim', 'Tanaka', 'Alves', 'Hernández', 'O\'Connor'];
  
  let hash = 0;
  for (let i = 0; i < teamId.length; i++) {
    hash = teamId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const fIdx = Math.abs(hash) % firstNames.length;
  const lIdx = Math.abs(hash >> 2) % lastNames.length;
  return `${firstNames[fIdx]} ${lastNames[lIdx]}`;
};

interface PitchRendererProps {
  state: MatchSimulationState | null;
}

export default function PitchRenderer({ state }: PitchRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);

  // Keep references to visual entities for rendering loop updates
  const playersGroupRef = useRef<Map<number, PIXI.Container>>(new Map());
  const ballGraphicRef = useRef<PIXI.Graphics | null>(null);
  const ballShadowGraphicRef = useRef<PIXI.Graphics | null>(null);

  // Coordinate references for referees to interpolate positions smoothly
  const refereePosRef = useRef({ x: 52.5, y: 34 });
  const ar1PosRef = useRef({ x: 25, y: -1.0 });
  const ar2PosRef = useRef({ x: 80, y: 69.0 });

  // Refs for tracking subs, bench players, and managers
  const lastMatchIdRef = useRef<number | null>(null);
  const lastActivePlayerIdsRef = useRef<Set<number>>(new Set());
  const entryTicksRef = useRef<Map<number, number>>(new Map());
  const exitingPlayersRef = useRef<Map<number, {
    container: PIXI.Container;
    teamId: string;
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
    progress: number;
    type: 'SUB_OFF' | 'RED_CARD';
  }>>(new Map());
  const benchPlayersGroupRef = useRef<Map<number, PIXI.Container>>(new Map());
  
  // Keep state ref so the Pixi ticker loop always accesses the latest values without re-binding
  const stateRef = useRef<MatchSimulationState | null>(state);
  
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Pitch layout metrics (with 4 meters margin, and extra 12 meters at bottom for benches)
    const paddingLeft = 4;
    const paddingRight = 4;
    const paddingTop = 4;
    const paddingBottom = 12;
    const pitchWidthMeters = 105;
    const pitchHeightMeters = 68;
    
    const canvasWidth = 1000;
    const scale = canvasWidth / (pitchWidthMeters + paddingLeft + paddingRight); // ~8.85 pixels per meter
    const canvasHeight = (pitchHeightMeters + paddingTop + paddingBottom) * scale; // ~743 pixels

    // Coordinate helpers
    const toScreenX = (mX: number) => (mX + paddingLeft) * scale;
    const toScreenY = (mY: number) => (mY + paddingTop) * scale;

    // Initialize Pixi Application
    const app = new PIXI.Application({
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: 0x14532d, // Deep grass green
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    containerRef.current.appendChild(app.view as unknown as HTMLCanvasElement);
    appRef.current = app;

    // --- Draw Pitch Markings ---
    const markings = new PIXI.Graphics();
    markings.lineStyle(2, 0xffffff, 0.4);

    // Outer boundary box (the touchlines and endlines)
    markings.drawRect(toScreenX(0), toScreenY(0), pitchWidthMeters * scale, pitchHeightMeters * scale);

    // Center Line
    markings.moveTo(toScreenX(52.5), toScreenY(0));
    markings.lineTo(toScreenX(52.5), toScreenY(68));

    // Center Circle
    markings.drawCircle(toScreenX(52.5), toScreenY(34), 9.15 * scale);

    // Center Spot
    markings.beginFill(0xffffff, 0.4);
    markings.drawCircle(toScreenX(52.5), toScreenY(34), 0.3 * scale);
    markings.endFill();

    // Left Penalty Box (16.5m box)
    markings.drawRect(toScreenX(0), toScreenY(34 - 20.16), 16.5 * scale, 40.32 * scale);
    // Left Goal Area (5.5m box)
    markings.drawRect(toScreenX(0), toScreenY(34 - 9.16), 5.5 * scale, 18.32 * scale);
    // Left Penalty Spot
    markings.beginFill(0xffffff, 0.4);
    markings.drawCircle(toScreenX(11), toScreenY(34), 0.2 * scale);
    markings.endFill();

    // Left Penalty Arc (D-box arc, radius 9.15m)
    markings.moveTo(toScreenX(16.5), toScreenY(26.69));
    markings.arc(toScreenX(11), toScreenY(34), 9.15 * scale, -0.925, 0.925);

    // Right Penalty Box
    markings.drawRect(toScreenX(105 - 16.5), toScreenY(34 - 20.16), 16.5 * scale, 40.32 * scale);
    // Right Goal Area
    markings.drawRect(toScreenX(105 - 5.5), toScreenY(34 - 9.16), 5.5 * scale, 18.32 * scale);
    // Right Penalty Spot
    markings.beginFill(0xffffff, 0.4);
    markings.drawCircle(toScreenX(105 - 11), toScreenY(34), 0.2 * scale);
    markings.endFill();

    // Right Penalty Arc (D-box arc, radius 9.15m)
    markings.moveTo(toScreenX(88.5), toScreenY(26.69));
    markings.arc(toScreenX(105 - 11), toScreenY(34), 9.15 * scale, Math.PI - 0.925, Math.PI + 0.925);

    // Corner Arcs (1m radius)
    // Top-Left Corner
    markings.moveTo(toScreenX(1.0), toScreenY(0));
    markings.arc(toScreenX(0), toScreenY(0), 1.0 * scale, 0, Math.PI / 2);
    // Bottom-Left Corner
    markings.moveTo(toScreenX(0), toScreenY(67));
    markings.arc(toScreenX(0), toScreenY(68), 1.0 * scale, 1.5 * Math.PI, 2 * Math.PI);
    // Top-Right Corner
    markings.moveTo(toScreenX(105), toScreenY(1.0));
    markings.arc(toScreenX(105), toScreenY(0), 1.0 * scale, Math.PI / 2, Math.PI);
    // Bottom-Right Corner
    markings.moveTo(toScreenX(104), toScreenY(68));
    markings.arc(toScreenX(105), toScreenY(68), 1.0 * scale, Math.PI, 1.5 * Math.PI);

    // Left Goal mouth posts
    markings.lineStyle(3, 0xffffff, 0.95);
    markings.moveTo(toScreenX(0), toScreenY(30.34));
    markings.lineTo(toScreenX(0), toScreenY(37.66));

    // Right Goal mouth posts
    markings.moveTo(toScreenX(105), toScreenY(30.34));
    markings.lineTo(toScreenX(105), toScreenY(37.66));

    app.stage.addChild(markings);

    // --- Create Head Referee Visual ---
    const refereeContainer = new PIXI.Container();
    const refCircle = new PIXI.Graphics();
    refCircle.beginFill(0xccff00); // Neon Yellow/Green
    refCircle.lineStyle(1.5, 0x000000);
    refCircle.drawCircle(0, 0, 9.5); // Slightly smaller than players
    refCircle.endFill();
    
    // Draw shirt details (black V-Neck collar)
    refCircle.lineStyle(1.2, 0x000000);
    refCircle.moveTo(-3, -4);
    refCircle.lineTo(0, 2);
    refCircle.lineTo(3, -4);
    refereeContainer.addChild(refCircle);

    // Name label for Ref
    const refNameStyle = new PIXI.TextStyle({
      fontFamily: 'Outfit',
      fontSize: 12.5,
      fill: '#a3e635',
      stroke: '#000000',
      strokeThickness: 2.5,
      fontWeight: 'bold',
    });
    const refNameText = new PIXI.Text('REF', refNameStyle);
    refNameText.anchor.set(0.5, 1);
    refNameText.y = -16.5;
    refereeContainer.addChild(refNameText);
    app.stage.addChild(refereeContainer);

    // --- Create AR1 (Top Sideline Referee) Visual ---
    const ar1Container = new PIXI.Container();
    const ar1Circle = new PIXI.Graphics();
    ar1Circle.beginFill(0xccff00);
    ar1Circle.lineStyle(1.2, 0x000000);
    ar1Circle.drawCircle(0, 0, 9.0);
    ar1Circle.endFill();
    ar1Circle.lineStyle(1.2, 0x000000);
    ar1Circle.moveTo(-2.5, -3);
    ar1Circle.lineTo(0, 1.5);
    ar1Circle.lineTo(2.5, -3);
    ar1Container.addChild(ar1Circle);

    // Checkered flag for AR1
    const ar1Flag = new PIXI.Graphics();
    ar1Flag.lineStyle(1.0, 0x4b5563);
    ar1Flag.moveTo(5.5, 2.5);
    ar1Flag.lineTo(5.5, -7.5);
    ar1Flag.lineStyle(0);
    ar1Flag.beginFill(0xef4444); // red
    ar1Flag.drawRect(5.5, -7.5, 4, 3.5);
    ar1Flag.endFill();
    ar1Flag.beginFill(0xeab308); // yellow
    ar1Flag.drawRect(9.5, -7.5, 4, 3.5);
    ar1Flag.endFill();
    ar1Container.addChild(ar1Flag);
    app.stage.addChild(ar1Container);

    // --- Create AR2 (Bottom Sideline Referee) Visual ---
    const ar2Container = new PIXI.Container();
    const ar2Circle = new PIXI.Graphics();
    ar2Circle.beginFill(0xccff00);
    ar2Circle.lineStyle(1.2, 0x000000);
    ar2Circle.drawCircle(0, 0, 9.0);
    ar2Circle.endFill();
    ar2Circle.lineStyle(1.2, 0x000000);
    ar2Circle.moveTo(-2.5, -3);
    ar2Circle.lineTo(0, 1.5);
    ar2Circle.lineTo(2.5, -3);
    ar2Container.addChild(ar2Circle);

    // Checkered flag for AR2
    const ar2Flag = new PIXI.Graphics();
    ar2Flag.lineStyle(1.0, 0x4b5563);
    ar2Flag.moveTo(5.5, 2.5);
    ar2Flag.lineTo(5.5, -7.5);
    ar2Flag.lineStyle(0);
    ar2Flag.beginFill(0xef4444);
    ar2Flag.drawRect(5.5, -7.5, 4, 3.5);
    ar2Flag.endFill();
    ar2Flag.beginFill(0xeab308);
    ar2Flag.drawRect(9.5, -7.5, 4, 3.5);
    ar2Flag.endFill();
    ar2Container.addChild(ar2Flag);
    app.stage.addChild(ar2Container);

    // Create Ball Shadow
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.35);
    shadow.drawCircle(0, 0, 6.5);
    shadow.endFill();
    app.stage.addChild(shadow);
    ballShadowGraphicRef.current = shadow;

    // Create Ball Graphic
    const ballG = new PIXI.Graphics();
    ballG.beginFill(0xffffff);
    ballG.lineStyle(1.5, 0x000000);
    ballG.drawCircle(0, 0, 7.0);
    ballG.endFill();
    app.stage.addChild(ballG);
    ballGraphicRef.current = ballG;

    // Create Set Piece Graphics Overlay
    const setPieceGraphics = new PIXI.Graphics();
    app.stage.addChild(setPieceGraphics);

    // Create Set Piece Text Overlay
    const spTextStyle = new PIXI.TextStyle({
      fontFamily: 'Outfit',
      fontSize: 14,
      fill: '#ffffff',
      fontWeight: 'bold',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 4,
    });
    const spText = new PIXI.Text('', spTextStyle);
    spText.anchor.set(0.5);
    spText.visible = false;
    app.stage.addChild(spText);

    // --- Draw Technical Areas and Dugouts ---
    const benchGraphics = new PIXI.Graphics();
    
    const drawDashedRect = (graphics: PIXI.Graphics, x1: number, y1: number, x2: number, y2: number, dashLength = 4) => {
      const drawDashedLine = (xStart: number, yStart: number, xEnd: number, yEnd: number) => {
        const dx = xEnd - xStart;
        const dy = yEnd - yStart;
        const len = Math.sqrt(dx * dx + dy * dy);
        const steps = len / dashLength;
        for (let i = 0; i < steps; i += 2) {
          const t1 = Math.min(i / steps, 1);
          const t2 = Math.min((i + 1) / steps, 1);
          graphics.moveTo(xStart + dx * t1, yStart + dy * t1);
          graphics.lineTo(xStart + dx * t2, yStart + dy * t2);
        }
      };
      
      drawDashedLine(x1, y1, x2, y1);
      drawDashedLine(x2, y1, x2, y2);
      drawDashedLine(x2, y2, x1, y2);
      drawDashedLine(x1, y2, x1, y1);
    };

    // Draw Home Technical Area (dashed line)
    benchGraphics.lineStyle(1.5, 0xffffff, 0.25);
    drawDashedRect(
      benchGraphics, 
      toScreenX(32), 
      toScreenY(68), 
      toScreenX(46), 
      toScreenY(71)
    );
    
    // Draw Away Technical Area
    drawDashedRect(
      benchGraphics, 
      toScreenX(59), 
      toScreenY(68), 
      toScreenX(73), 
      toScreenY(71)
    );

    // Draw Home Dugout Box (glassmorphism look: semi-transparent white box with light border)
    benchGraphics.lineStyle(1.5, 0xffffff, 0.2);
    benchGraphics.beginFill(0xffffff, 0.04);
    benchGraphics.drawRoundedRect(
      toScreenX(26), 
      toScreenY(72.5), 
      20 * scale, 
      4.5 * scale, 
      4
    );
    benchGraphics.endFill();

    // Draw Away Dugout Box
    benchGraphics.lineStyle(1.5, 0xffffff, 0.2);
    benchGraphics.beginFill(0xffffff, 0.04);
    benchGraphics.drawRoundedRect(
      toScreenX(59), 
      toScreenY(72.5), 
      20 * scale, 
      4.5 * scale, 
      4
    );
    benchGraphics.endFill();

    app.stage.addChild(benchGraphics);

    // Draw text labels above dugouts
    const dugoutLabelStyle = new PIXI.TextStyle({
      fontFamily: 'Outfit',
      fontSize: 11,
      fill: '#9ca3af',
      fontWeight: 'bold',
      letterSpacing: 1,
    });
    
    const homeDugoutText = new PIXI.Text('HOME BENCH', dugoutLabelStyle);
    homeDugoutText.anchor.set(0.5, 1);
    homeDugoutText.x = toScreenX(36);
    homeDugoutText.y = toScreenY(72.5) - 3;
    app.stage.addChild(homeDugoutText);

    const awayDugoutText = new PIXI.Text('AWAY BENCH', dugoutLabelStyle);
    awayDugoutText.anchor.set(0.5, 1);
    awayDugoutText.x = toScreenX(69);
    awayDugoutText.y = toScreenY(72.5) - 3;
    app.stage.addChild(awayDugoutText);

    // --- Create Home Manager Visual ---
    const homeManagerContainer = new PIXI.Container();
    const homeManagerGraphic = new PIXI.Graphics();
    
    // Draw suit/jacket (dark slate blue)
    homeManagerGraphic.beginFill(0x1e3a8a); // Dark Navy Suit
    homeManagerGraphic.lineStyle(1.5, 0xffffff); // White outline
    homeManagerGraphic.drawCircle(0, 0, 10); // Slightly smaller than players
    homeManagerGraphic.endFill();
    
    // Draw shirt collar details
    homeManagerGraphic.lineStyle(1.2, 0xffffff);
    homeManagerGraphic.moveTo(-2.5, -4.5);
    homeManagerGraphic.lineTo(0, 1.5);
    homeManagerGraphic.lineTo(2.5, -4.5);
    homeManagerContainer.addChild(homeManagerGraphic);
    
    app.stage.addChild(homeManagerContainer);

    // --- Create Away Manager Visual ---
    const awayManagerContainer = new PIXI.Container();
    const awayManagerGraphic = new PIXI.Graphics();
    
    // Draw suit/jacket (dark grey/charcoal)
    awayManagerGraphic.beginFill(0x374151); // Charcoal Suit
    awayManagerGraphic.lineStyle(1.5, 0xffffff); // White outline
    awayManagerGraphic.drawCircle(0, 0, 10);
    awayManagerGraphic.endFill();
    
    // Draw shirt collar details
    awayManagerGraphic.lineStyle(1.2, 0xffffff);
    awayManagerGraphic.moveTo(-2.5, -4.5);
    awayManagerGraphic.lineTo(0, 1.5);
    awayManagerGraphic.lineTo(2.5, -4.5);
    awayManagerContainer.addChild(awayManagerGraphic);
    
    app.stage.addChild(awayManagerContainer);

    const managerNameStyle = new PIXI.TextStyle({
      fontFamily: 'Outfit',
      fontSize: 14,
      fill: '#e2e8f0',
      stroke: '#000000',
      strokeThickness: 3.0,
      fontWeight: 'bold',
    });
    
    const homeManagerNameText = new PIXI.Text('Home Coach', managerNameStyle);
    homeManagerNameText.anchor.set(0.5, 1);
    homeManagerNameText.y = -18;
    homeManagerContainer.addChild(homeManagerNameText);

    const awayManagerNameText = new PIXI.Text('Away Coach', managerNameStyle);
    awayManagerNameText.anchor.set(0.5, 1);
    awayManagerNameText.y = -18;
    awayManagerContainer.addChild(awayManagerNameText);

    // Manager positions and state variables
    const homeManagerPos = { x: 36, y: 69.5 };
    const awayManagerPos = { x: 69, y: 69.5 };
    
    let homeManagerPaceDirection = 1;
    let awayManagerPaceDirection = -1;
    
    let homeManagerCelebrateTicks = 0;
    let awayManagerCelebrateTicks = 0;
    
    let homeManagerAngryTicks = 0;
    let awayManagerAngryTicks = 0;
    
    let homeManagerTacticalTicks = 0;
    let awayManagerTacticalTicks = 0;

    let lastCommentaryIndex = 0;
    
    let lastHomeScore = 0;
    let lastAwayScore = 0;
    
    // Speech bubbles for shouting instructions
    const shoutStyle = new PIXI.TextStyle({
      fontFamily: 'Outfit',
      fontSize: 13.5,
      fill: '#fde047', // bright yellow
      fontWeight: 'bold',
      stroke: '#000000',
      strokeThickness: 3.5,
      wordWrap: true,
      wordWrapWidth: 180,
      align: 'center',
    });
    
    const homeShoutText = new PIXI.Text('', shoutStyle);
    homeShoutText.anchor.set(0.5, 1);
    homeShoutText.y = -36;
    homeShoutText.visible = false;
    homeManagerContainer.addChild(homeShoutText);

    const awayShoutText = new PIXI.Text('', shoutStyle);
    awayShoutText.anchor.set(0.5, 1);
    awayShoutText.y = -36;
    awayShoutText.visible = false;
    awayManagerContainer.addChild(awayShoutText);
    
    let homeShoutTicks = 0;
    let awayShoutTicks = 0;

    // --- Rendering Ticker Loop ---
    app.ticker.add(() => {
      const match = stateRef.current;
      if (!match) return;

      // --- Draw Set Piece Indicators ---
      setPieceGraphics.clear();
      if (match.activeSetPiece) {
        const ap = match.activeSetPiece;
        const bPos = match.ball.pos;
        const sX = toScreenX(bPos.x);
        const sY = toScreenY(bPos.y);

        if (ap.type === 'FREE_KICK') {
          // Draw 9.15m dashed circle around the free kick spot (vanishing spray representation)
          setPieceGraphics.lineStyle(1.5, 0xeab308, 0.4); // gold/yellow dashed circle
          const segments = 32;
          const radius = 9.15 * scale;
          for (let i = 0; i < segments; i += 2) {
            const a1 = (i / segments) * Math.PI * 2;
            const a2 = ((i + 1) / segments) * Math.PI * 2;
            setPieceGraphics.moveTo(sX + Math.cos(a1) * radius, sY + Math.sin(a1) * radius);
            setPieceGraphics.lineTo(sX + Math.cos(a2) * radius, sY + Math.sin(a2) * radius);
          }

          // If it is an attacking free kick, draw a wall line indicator
          const attackingRight = ap.takingTeamId === match.homeTeam.id;
          const oppGoalX = attackingRight ? 105 : 0;
          const isAttacking = attackingRight ? (bPos.x > 70) : (bPos.x < 35);
          if (isAttacking) {
            setPieceGraphics.lineStyle(2, 0xef4444, 0.6); // red wall marker
            const goalCenter = { x: oppGoalX, y: 34 };
            const toGoal = { x: goalCenter.x - bPos.x, y: goalCenter.y - bPos.y };
            const dist = Math.sqrt(toGoal.x * toGoal.x + toGoal.y * toGoal.y);
            if (dist > 0) {
              const dirX = toGoal.x / dist;
              const dirY = toGoal.y / dist;
              const wallX = bPos.x + dirX * 9.15;
              const wallY = bPos.y + dirY * 9.15;
              
              // Perpendicular perp vector
              const perpX = -dirY;
              const perpY = dirX;
              // Draw line representing the wall location (approx 4.0 meters wide)
              setPieceGraphics.moveTo(toScreenX(wallX - perpX * 2.0), toScreenY(wallY - perpY * 2.0));
              setPieceGraphics.lineTo(toScreenX(wallX + perpX * 2.0), toScreenY(wallY + perpY * 2.0));
            }
          }
        } else if (ap.type === 'CORNER') {
          // Highlight the corner region with a cyan pulse
          const pulse = 1.0 + Math.sin(app.ticker.lastTime / 150) * 0.15;
          setPieceGraphics.beginFill(0x22d3ee, 0.12 * pulse); // cyan glow
          setPieceGraphics.lineStyle(1.5, 0x22d3ee, 0.5 * pulse);
          setPieceGraphics.drawCircle(sX, sY, 3.5 * scale);
          setPieceGraphics.endFill();
        } else if (ap.type === 'THROW_IN') {
          // Draw dashed sideline indicator line
          setPieceGraphics.lineStyle(2.5, 0x38bdf8, 0.6); // light blue line
          const lineLength = 5 * scale;
          const isTop = bPos.y < 5;
          if (isTop) {
            setPieceGraphics.moveTo(sX - lineLength/2, toScreenY(0));
            setPieceGraphics.lineTo(sX + lineLength/2, toScreenY(0));
          } else {
            setPieceGraphics.moveTo(sX - lineLength/2, toScreenY(68));
            setPieceGraphics.lineTo(sX + lineLength/2, toScreenY(68));
          }
        } else if (ap.type === 'PENALTY') {
          // Draw penalty spot highlight
          const pulse = 1.0 + Math.sin(app.ticker.lastTime / 100) * 0.15;
          setPieceGraphics.beginFill(0xef4444, 0.15 * pulse); // red glow
          setPieceGraphics.lineStyle(1.5, 0xef4444, 0.5 * pulse);
          setPieceGraphics.drawCircle(sX, sY, 1.5 * scale);
          setPieceGraphics.endFill();
        } else if (ap.type === 'KICK_OFF') {
          // Draw central circle highlight
          setPieceGraphics.lineStyle(1.5, 0x22d3ee, 0.4);
          setPieceGraphics.drawCircle(toScreenX(52.5), toScreenY(34), 9.15 * scale);
        }

        // Draw modern countdown ring and player tactical guidelines during reset setup
        if (ap.ticksRemaining > 0) {
          const maxTicks = (ap.type === 'THROW_IN' || ap.type === 'KICK_OFF') ? 15 : 25;
          const ratio = ap.ticksRemaining / maxTicks;
          
          // Draw background track ring around the ball
          setPieceGraphics.lineStyle(2.5, 0xffffff, 0.25);
          setPieceGraphics.drawCircle(sX, sY, 18);
          
          // Draw countdown active arc
          setPieceGraphics.lineStyle(3.5, 0xf59e0b, 0.9); // Amber warning countdown
          const startAngle = -Math.PI / 2;
          const endAngle = startAngle + Math.PI * 2 * ratio;
          setPieceGraphics.arc(sX, sY, 18, startAngle, endAngle);

          // Draw ghost slot positions and dotted alignment guidelines for players
          match.players.forEach((p) => {
            if (p.playerId === ap.takerId) return; // taker stays at the ball
            
            const pTarget = getSetPieceTargetPosition(match, p, ap);
            const curX = toScreenX(p.pos.x);
            const curY = toScreenY(p.pos.y);
            const tgtX = toScreenX(pTarget.x);
            const tgtY = toScreenY(pTarget.y);
            
            const dx = tgtX - curX;
            const dy = tgtY - curY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            const pColor = parseInt(p.color.replace('#', '0x'), 16);
            
            // Draw ghost slot circle at target coordinates (radius 9 matches active players)
            setPieceGraphics.lineStyle(1.5, pColor, 0.45);
            setPieceGraphics.beginFill(pColor, 0.10);
            setPieceGraphics.drawCircle(tgtX, tgtY, 9);
            setPieceGraphics.endFill();
            
            // Draw dotted path lines to target slot if player is still moving to it
            if (dist > 5) {
              setPieceGraphics.lineStyle(1.0, pColor, 0.35);
              const dashLen = 4;
              const steps = dist / dashLen;
              for (let i = 0; i < steps; i += 2) {
                const ratio1 = i / steps;
                const ratio2 = Math.min(1, (i + 1) / steps);
                setPieceGraphics.moveTo(curX + dx * ratio1, curY + dy * ratio1);
                setPieceGraphics.lineTo(curX + dx * ratio2, curY + dy * ratio2);
              }
            }
          });
        }

        // Update spText text and position
        spText.x = sX;
        spText.y = toScreenY(bPos.y) - 28;
        
        // Keep text inside canvas boundaries
        spText.x = Math.max(80, Math.min(720, spText.x));
        spText.y = Math.max(20, Math.min(510, spText.y));

        const teamName = ap.takingTeamId === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name;
        const secondsLeft = (ap.ticksRemaining * 0.1).toFixed(1);
        
        if (ap.ticksRemaining > 0) {
          spText.text = `SETTING UP: ${ap.type.replace('_', ' ')} (${teamName}) - ${secondsLeft}s`;
        } else {
          spText.text = `${ap.type.replace('_', ' ')} (${teamName})`;
        }
        spText.visible = true;
      } else {
        spText.visible = false;
      }

      // --- Handle Match Change / Reset ---
      if (lastMatchIdRef.current !== match.matchId) {
        lastMatchIdRef.current = match.matchId;
        
        // Clear active players
        playersGroupRef.current.forEach(c => app.stage.removeChild(c));
        playersGroupRef.current.clear();
        
        // Clear bench players
        benchPlayersGroupRef.current.forEach(c => app.stage.removeChild(c));
        benchPlayersGroupRef.current.clear();
        
        // Clear exiting players
        exitingPlayersRef.current.forEach(e => app.stage.removeChild(e.container));
        exitingPlayersRef.current.clear();
        
        // Reset states
        lastActivePlayerIdsRef.current.clear();
        entryTicksRef.current.clear();
        lastHomeScore = match.homeScore;
        lastAwayScore = match.awayScore;
      }

      // Update dugout text labels with team names
      if (homeDugoutText.text === 'HOME BENCH' && match.homeTeam) {
        homeDugoutText.text = `${match.homeTeam.name.toUpperCase()} BENCH`;
      }
      if (awayDugoutText.text === 'AWAY BENCH' && match.awayTeam) {
        awayDugoutText.text = `${match.awayTeam.name.toUpperCase()} BENCH`;
      }

      // Manage bench players
      const activeIds = new Set(match.players.map((p) => p.playerId));
      const homeColor = parseInt(match.homeTeam.colorPrimary.replace('#', '0x'), 16);
      const awayColor = parseInt(match.awayTeam.colorPrimary.replace('#', '0x'), 16);

      const renderBench = (benchList: Player[], isHome: boolean) => {
        const startX = isHome ? 27.5 : 60.5;
        const startY = 73.5;
        const colSpacing = 2.2;
        const rowSpacing = 1.8;
        const colsPerRow = 8;

        benchList.forEach((player, index) => {
          const row = Math.floor(index / colsPerRow);
          const col = index % colsPerRow;
          const pX = toScreenX(startX + col * colSpacing);
          const pY = toScreenY(startY + row * rowSpacing);

          let container = benchPlayersGroupRef.current.get(player.id);
          if (!container) {
            container = new PIXI.Container();

            // Draw small circle
            const circle = new PIXI.Graphics();
            circle.name = 'body';
            const primaryColor = isHome ? homeColor : awayColor;
            circle.beginFill(primaryColor);
            circle.lineStyle(1.0, 0xffffff, 0.6);
            circle.drawCircle(0, 0, 8.0);
            circle.endFill();
            container.addChild(circle);

            // Add yellow card container if needed
            const yc = new PIXI.Graphics();
            yc.name = 'yellowCard';
            yc.beginFill(0xeab308);
            yc.drawRect(5, -10, 4, 6);
            yc.endFill();
            yc.visible = false;
            container.addChild(yc);

            // Add small number
            const numStyle = new PIXI.TextStyle({
              fontFamily: 'Inter',
              fontSize: 9,
              fontWeight: 'bold',
              fill: '#ffffff',
              align: 'center',
            });
            const numberText = new PIXI.Text(String(player.number), numStyle);
            numberText.anchor.set(0.5);
            numberText.name = 'number';
            container.addChild(numberText);

            app.stage.addChild(container);
            benchPlayersGroupRef.current.set(player.id, container);
          }

          // Update position
          container.x = pX;
          container.y = pY;
          container.visible = true;

          // Update yellow cards
          const yc = container.getChildByName('yellowCard') as PIXI.Graphics;
          if (yc) {
            yc.visible = player.yellowCards === 1;
          }
          
          // Show injured cross if injured
          let cross = container.getChildByName('injured') as PIXI.Graphics;
          if (player.injured) {
            if (!cross) {
              cross = new PIXI.Graphics();
              cross.name = 'injured';
              cross.lineStyle(1.5, 0xef4444);
              cross.moveTo(-3, -3);
              cross.lineTo(3, 3);
              cross.moveTo(3, -3);
              cross.lineTo(-3, 3);
              container.addChild(cross);
            }
            cross.visible = true;
          } else if (cross) {
            cross.visible = false;
          }
        });
      };

      // Get home/away bench
      const homeBench = match.homeTeam.players.filter(p => !activeIds.has(p.id) && !p.redCarded);
      renderBench(homeBench, true);

      const awayBench = match.awayTeam.players.filter(p => !activeIds.has(p.id) && !p.redCarded);
      renderBench(awayBench, false);

      // Cleanup bench players who are no longer on the bench (subbed on or red-carded)
      const currentBenchIds = new Set([
        ...homeBench.map(p => p.id),
        ...awayBench.map(p => p.id)
      ]);
      benchPlayersGroupRef.current.forEach((container, id) => {
        if (!currentBenchIds.has(id)) {
          app.stage.removeChild(container);
          benchPlayersGroupRef.current.delete(id);
        }
      });

      // 1. Update/Draw Players
      match.players.forEach((pState) => {
        let playerContainer = playersGroupRef.current.get(pState.playerId);

        if (!playerContainer) {
          // Create new player visual node
          playerContainer = new PIXI.Container();
          
          // Visual jersey circle
          const circle = new PIXI.Graphics();
          circle.name = 'body';
          circle.beginFill(parseInt(pState.color.replace('#', '0x'), 16));
          circle.lineStyle(2.0, 0xffffff, 0.8);
          circle.drawCircle(0, 0, 11.5);
          circle.endFill();
          playerContainer.addChild(circle);

          // Jersey number label
          const numStyle = new PIXI.TextStyle({
            fontFamily: 'Inter',
            fontSize: 12.5,
            fontWeight: 'bold',
            fill: '#ffffff',
            align: 'center',
          });
          const numberText = new PIXI.Text(String(pState.number), numStyle);
          numberText.name = 'number';
          numberText.anchor.set(0.5);
          numberText.y = 0.5;
          playerContainer.addChild(numberText);

          // Player name tag
          const nameStyle = new PIXI.TextStyle({
            fontFamily: 'Outfit',
            fontSize: 14,
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3.0,
          });
          const nameText = new PIXI.Text(pState.name.split(' ').pop() || '', nameStyle);
          nameText.name = 'name';
          nameText.anchor.set(0.5, 1);
          nameText.y = -19.5;
          playerContainer.addChild(nameText);

          // Possession glow ring
          const ring = new PIXI.Graphics();
          ring.name = 'glow';
          ring.lineStyle(2.5, 0x22d3ee, 0.85);
          ring.drawCircle(0, 0, 15.0);
          ring.visible = false;
          playerContainer.addChild(ring);

          // Yellow card visual indicator
          const yc = new PIXI.Graphics();
          yc.name = 'yellowCard';
          yc.beginFill(0xeab308);
          yc.drawRect(9, -17, 6, 10);
          yc.endFill();
          yc.visible = false;
          playerContainer.addChild(yc);

          // Freeze Indicator / Progress Arc
          const freezeIndicator = new PIXI.Graphics();
          freezeIndicator.name = 'freezeIndicator';
          freezeIndicator.visible = false;
          playerContainer.addChild(freezeIndicator);

          // Overhead Action Pill Container
          const freezePill = new PIXI.Container();
          freezePill.name = 'freezePill';
          freezePill.visible = false;
          freezePill.y = -34;
          freezePill.x = 0;

          const pillBg = new PIXI.Graphics();
          pillBg.name = 'pillBg';
          freezePill.addChild(pillBg);

          const pillText = new PIXI.Text('', {
            fontFamily: 'Outfit',
            fontSize: 9.5,
            fontWeight: 'bold',
            fill: '#ffffff',
            align: 'center',
          });
          pillText.name = 'pillText';
          pillText.anchor.set(0.5);
          freezePill.addChild(pillText);

          playerContainer.addChild(freezePill);

          app.stage.addChild(playerContainer);
          playersGroupRef.current.set(pState.playerId, playerContainer);

          // Initial position (check if they were just subbed on)
          const isHome = pState.teamId === match.homeTeam.id;
          const wasJustSubbedOn = lastActivePlayerIdsRef.current.size > 0 && !lastActivePlayerIdsRef.current.has(pState.playerId);
          
          if (wasJustSubbedOn) {
            const startXMeters = isHome ? 36 : 69;
            const startYMeters = 73; // In the dugout area
            playerContainer.x = toScreenX(startXMeters);
            playerContainer.y = toScreenY(startYMeters);
            playerContainer.alpha = 0;
            entryTicksRef.current.set(pState.playerId, 150);
          } else {
            playerContainer.x = toScreenX(pState.pos.x);
            playerContainer.y = toScreenY(pState.pos.y);
            playerContainer.alpha = 1.0;
          }
        }

        // Apply smooth visual interpolation (steer visual node closer to state coords)
        const targetX = toScreenX(pState.pos.x);
        const targetY = toScreenY(pState.pos.y);
        playerContainer.x += (targetX - playerContainer.x) * 0.25;
        playerContainer.y += (targetY - playerContainer.y) * 0.25;
        
        if (playerContainer.alpha < 1.0) {
          playerContainer.alpha = Math.min(1.0, playerContainer.alpha + 0.05);
        }

        // Toggle possessor highlight ring & name style
        const bodyG = playerContainer.getChildByName('body') as PIXI.Graphics;
        const glowG = playerContainer.getChildByName('glow') as PIXI.Graphics;
        const yellowCardG = playerContainer.getChildByName('yellowCard') as PIXI.Graphics;
        const nameText = playerContainer.getChildByName('name') as PIXI.Text;
        
        if (nameText) {
          const lastName = pState.name.split(' ').pop() || '';
          if (pState.isSoloDribble) {
            nameText.text = `⚡ ${lastName} ⚡`;
            nameText.style.fill = '#f59e0b'; // Amber/Gold color for active solo dribbler
            nameText.style.fontWeight = 'bold';
          } else {
            nameText.text = lastName;
            nameText.style.fill = '#ffffff'; // White default
            nameText.style.fontWeight = 'normal';
          }
        }

        if (glowG && bodyG) {
          const isPossessor = match.ball.ownerId === pState.playerId;
          glowG.visible = isPossessor;
          if (isPossessor) {
            glowG.scale.set(1.0 + Math.sin(app.ticker.lastTime / 100) * 0.12);
            
            // Redraw glow ring to reflect solo run status
            glowG.clear();
            if (pState.isSoloDribble) {
              // Flashing amber/orange fire ring
              const pulseColor = (app.ticker.lastTime % 200 < 100) ? 0xffa500 : 0xeab308;
              glowG.lineStyle(3.0, pulseColor, 0.95);
              glowG.drawCircle(0, 0, 13);
              
              // Outer energy shockwave ring
              glowG.lineStyle(1.0, 0xff5500, 0.5);
              glowG.drawCircle(0, 0, 17 + Math.sin(app.ticker.lastTime / 40) * 2.5);
            } else {
              // Standard possession glow ring
              glowG.lineStyle(2.0, 0x22d3ee, 0.8);
              glowG.drawCircle(0, 0, 12);
            }
          }
        }

        if (yellowCardG) {
          yellowCardG.visible = pState.yellowCards === 1;
        }

        // Check for green up arrow (subbed on)
        const ticksLeft = entryTicksRef.current.get(pState.playerId) || 0;
        let subArrow = playerContainer.getChildByName('subArrow') as PIXI.Graphics;
        
        if (ticksLeft > 0) {
          entryTicksRef.current.set(pState.playerId, ticksLeft - 1);
          if (!subArrow) {
            subArrow = new PIXI.Graphics();
            subArrow.name = 'subArrow';
            subArrow.beginFill(0x22c55e); // Green
            subArrow.moveTo(0, -23);
            subArrow.lineTo(-4, -17);
            subArrow.lineTo(4, -17);
            subArrow.endFill();
            playerContainer.addChild(subArrow);
          }
          subArrow.visible = true;
          // Bounce animation
          subArrow.y = Math.sin(app.ticker.lastTime / 100) * 3;
        } else {
          if (subArrow) {
            subArrow.visible = false;
          }
        }

        // ------------------ FREEZE / SET PIECE INDICATOR ------------------
        const ap = match.activeSetPiece;
        const isTakerSetup = ap && ap.takerId === pState.playerId && ap.ticksRemaining > 0;
        const isFollowThrough = pState.noMoveTicks !== undefined && pState.noMoveTicks > 0;
        const isFrozen = isTakerSetup || isFollowThrough;

        const freezeG = playerContainer.getChildByName('freezeIndicator') as PIXI.Graphics;
        const pillC = playerContainer.getChildByName('freezePill') as PIXI.Container;

        if (freezeG && pillC) {
          if (isFrozen) {
            freezeG.visible = true;
            pillC.visible = true;
            freezeG.clear();

            const pBg = pillC.getChildByName('pillBg') as PIXI.Graphics;
            const pText = pillC.getChildByName('pillText') as PIXI.Text;

            let pillLabel = '';
            let ringColor = 0xf59e0b; // default amber
            let outlineColor = 0xf59e0b;
            let maxTicks = 25;
            let currentTicks = 0;

            if (isTakerSetup && ap) {
              // SETUP / AIMING PHASE
              maxTicks = (ap.type === 'THROW_IN' || ap.type === 'KICK_OFF') ? 15 : 25;
              currentTicks = ap.ticksRemaining;
              
              // Set friendly label
              const typeLabel = ap.type.replace('_', ' ');
              pillLabel = `🎯 ${typeLabel}`;
              ringColor = 0xf59e0b; // Amber
              outlineColor = 0xf59e0b;
            } else if (isFollowThrough) {
              // FOLLOW-THROUGH / IMPACT / RECOVERY PHASE
              maxTicks = 5;
              currentTicks = pState.noMoveTicks || 0;
              pillLabel = `👟 EXECUTE`;
              ringColor = 0xef4444; // Rose/Red
              outlineColor = 0xef4444;
            }

            const ratio = Math.max(0, Math.min(1.0, currentTicks / maxTicks));

            // Draw spinning dashed ring
            const segments = 8;
            const radius = 19;
            const spinAngle = (isTakerSetup ? 1 : -1) * (app.ticker.lastTime / 150);
            freezeG.lineStyle(1.5, ringColor, 0.7);
            for (let i = 0; i < segments; i++) {
              const startAng = spinAngle + (i / segments) * Math.PI * 2;
              const endAng = spinAngle + ((i + 0.5) / segments) * Math.PI * 2;
              freezeG.arc(0, 0, radius, startAng, endAng);
            }

            // Draw countdown/charge progress ring
            freezeG.lineStyle(2.5, ringColor, 0.95);
            freezeG.arc(0, 0, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);

            // Draw custom effect (wave or collapse)
            if (isTakerSetup) {
              // Pulsing radiating wave
              const waveProgress = ((app.ticker.lastTime / 80) % 1.0);
              const waveRadius = 11.5 + waveProgress * 14;
              freezeG.lineStyle(1.0, ringColor, 0.6 * (1.0 - waveProgress));
              freezeG.drawCircle(0, 0, waveRadius);
            } else {
              // Collapsing impact circle
              const collapseProgress = 1.0 - ratio;
              const collapseRadius = 28 - collapseProgress * 16.5;
              freezeG.lineStyle(1.0, ringColor, 0.7 * ratio);
              freezeG.drawCircle(0, 0, collapseRadius);
            }

            // Update floating status pill text and background
            if (pText && pBg) {
              pText.text = pillLabel;
              const textWidth = pText.width;
              const textHeight = pText.height;
              pBg.clear();
              pBg.beginFill(0x0f172a, 0.85); // Slate 900
              pBg.lineStyle(1.2, outlineColor, 0.7);
              pBg.drawRoundedRect(-textWidth / 2 - 6, -textHeight / 2 - 2, textWidth + 12, textHeight + 4, 5);
              pBg.endFill();
            }

            // Apply body scale bump during follow through
            if (isFollowThrough && bodyG) {
              const scalePulse = 1.0 + (currentTicks / maxTicks) * 0.18;
              bodyG.scale.set(scalePulse);
            } else if (bodyG) {
              bodyG.scale.set(1.0);
            }
          } else {
            freezeG.visible = false;
            pillC.visible = false;
            if (bodyG) {
              bodyG.scale.set(1.0);
            }
          }
        }
      });

      // Cleanup missing players (substitutions / red cards)
      playersGroupRef.current.forEach((val, id) => {
        if (!match.players.some((p) => p.playerId === id)) {
          // If this is an ongoing match, move them to exitingPlayersRef
          if (lastActivePlayerIdsRef.current.has(id)) {
            const isHome = match.homeTeam.players.some(p => p.id === id);
            const targetX = isHome ? 36 : 69;
            const targetY = 71;

            const team = isHome ? match.homeTeam : match.awayTeam;
            const rosterPlayer = team.players.find(p => p.id === id);
            const type = rosterPlayer?.redCarded ? 'RED_CARD' : 'SUB_OFF';

            exitingPlayersRef.current.set(id, {
              container: val,
              teamId: isHome ? match.homeTeam.id : match.awayTeam.id,
              startX: val.x,
              startY: val.y,
              targetX: toScreenX(targetX),
              targetY: toScreenY(targetY),
              progress: 0,
              type
            });
          } else {
            app.stage.removeChild(val);
          }
          playersGroupRef.current.delete(id);
        }
      });

      // Update Exiting Players
      exitingPlayersRef.current.forEach((exiting, id) => {
        exiting.progress += 0.015; // Walk-off speed
        if (exiting.progress >= 1.0) {
          app.stage.removeChild(exiting.container);
          exitingPlayersRef.current.delete(id);
        } else {
          // Smooth walk-off interpolation
          exiting.container.x = exiting.startX + (exiting.targetX - exiting.startX) * exiting.progress;
          exiting.container.y = exiting.startY + (exiting.targetY - exiting.startY) * exiting.progress;
          exiting.container.alpha = 1.0 - exiting.progress;

          const glowG = exiting.container.getChildByName('glow') as PIXI.Graphics;
          if (glowG) glowG.visible = false;

          let arrow = exiting.container.getChildByName('subArrow') as PIXI.Graphics;
          if (!arrow) {
            arrow = new PIXI.Graphics();
            arrow.name = 'subArrow';
            if (exiting.type === 'RED_CARD') {
              // Red Card indicator
              arrow.beginFill(0xef4444);
              arrow.drawRect(-3, -25, 6, 9);
              arrow.endFill();
            } else {
              // Red down arrow
              arrow.beginFill(0xef4444);
              arrow.moveTo(0, -17);
              arrow.lineTo(-4, -23);
              arrow.lineTo(4, -23);
              arrow.endFill();
            }
            exiting.container.addChild(arrow);
          }
          arrow.visible = true;
        }
      });

      // Update active player IDs for the next tick
      lastActivePlayerIdsRef.current = new Set(match.players.map(p => p.playerId));

      // --- Update Managers ---
      // 1. Goal Detection
      if (match.homeScore > lastHomeScore) {
        homeManagerCelebrateTicks = 160;
        awayManagerCelebrateTicks = 0;
        lastHomeScore = match.homeScore;
      }
      if (match.awayScore > lastAwayScore) {
        awayManagerCelebrateTicks = 160;
        homeManagerCelebrateTicks = 0;
        lastAwayScore = match.awayScore;
      }
      if (match.homeScore < lastHomeScore || match.awayScore < lastAwayScore) {
        lastHomeScore = match.homeScore;
        lastAwayScore = match.awayScore;
      }

      // Reset pointer if game restarted
      if (match.commentary.length < lastCommentaryIndex) {
        lastCommentaryIndex = 0;
      }

      // Parse coach commentary screams and trigger custom animations
      if (match.commentary.length > lastCommentaryIndex) {
        for (let i = lastCommentaryIndex; i < match.commentary.length; i++) {
          const comm = match.commentary[i];
          if (comm.text.includes('[COACH]')) {
            const homeCoachName = getManagerName(match.homeTeam?.id || '', match.homeTeam?.name || '');
            const isHomeCoach = comm.text.includes(homeCoachName);
            
            const textLower = comm.text.toLowerCase();
            const isScored = textLower.includes('yes') || textLower.includes('genius') || textLower.includes('get in') || textLower.includes('celebr');
            const isConceded = textLower.includes('sleeping') || textLower.includes('who paid you') || textLower.includes('grandmother') || textLower.includes('clowns') || textLower.includes('gray hair');
            const isMistake = textLower.includes('terrible') || textLower.includes('trampoline') || textLower.includes('round') || textLower.includes('ghost') || textLower.includes('blunder') || textLower.includes('forget') || textLower.includes('simple');
            const isTactical = comm.type === 'COACH_REACTION' && !isScored && !isConceded && !isMistake;
            
            // Extract the quote
            const firstQuote = comm.text.indexOf('"');
            const lastQuote = comm.text.lastIndexOf('"');
            const quoteText = (firstQuote !== -1 && lastQuote !== -1)
              ? comm.text.substring(firstQuote + 1, lastQuote)
              : comm.text;

            if (isHomeCoach) {
              if (isScored) {
                homeManagerCelebrateTicks = 160;
                homeManagerAngryTicks = 0;
                homeManagerTacticalTicks = 0;
                homeShoutText.text = `🗣️ "${quoteText}"`;
                homeShoutText.visible = true;
                homeShoutTicks = 160;
              } else if (isConceded || isMistake) {
                homeManagerAngryTicks = 140;
                homeManagerCelebrateTicks = 0;
                homeManagerTacticalTicks = 0;
                homeShoutText.text = `🗣️ "${quoteText}"`;
                homeShoutText.visible = true;
                homeShoutTicks = 140;
              } else {
                homeManagerTacticalTicks = 120;
                homeManagerCelebrateTicks = 0;
                homeManagerAngryTicks = 0;
                homeShoutText.text = `🗣️ "${quoteText}"`;
                homeShoutText.visible = true;
                homeShoutTicks = 120;
              }
            } else {
              if (isScored) {
                awayManagerCelebrateTicks = 160;
                awayManagerAngryTicks = 0;
                awayManagerTacticalTicks = 0;
                awayShoutText.text = `🗣️ "${quoteText}"`;
                awayShoutText.visible = true;
                awayShoutTicks = 160;
              } else if (isConceded || isMistake) {
                awayManagerAngryTicks = 140;
                awayManagerCelebrateTicks = 0;
                awayManagerTacticalTicks = 0;
                awayShoutText.text = `🗣️ "${quoteText}"`;
                awayShoutText.visible = true;
                awayShoutTicks = 140;
              } else {
                awayManagerTacticalTicks = 120;
                awayManagerCelebrateTicks = 0;
                awayManagerAngryTicks = 0;
                awayShoutText.text = `🗣️ "${quoteText}"`;
                awayShoutText.visible = true;
                awayShoutTicks = 120;
              }
            }
          }
        }
        lastCommentaryIndex = match.commentary.length;
      }

      // Load Manager Names
      if (homeManagerNameText.text === 'Home Coach' && match.homeTeam) {
        homeManagerNameText.text = `${getManagerName(match.homeTeam.id, match.homeTeam.name)} (MGR)`;
      }
      if (awayManagerNameText.text === 'Away Coach' && match.awayTeam) {
        awayManagerNameText.text = `${getManagerName(match.awayTeam.id, match.awayTeam.name)} (MGR)`;
      }

      // Update Home Manager
      if (homeManagerCelebrateTicks > 0) {
        homeManagerCelebrateTicks--;
        homeManagerPos.x += (41 - homeManagerPos.x) * 0.08;
        homeManagerContainer.scale.set(1.0 + Math.abs(Math.sin(homeManagerCelebrateTicks * 0.15)) * 0.25);
      } else if (homeManagerAngryTicks > 0) {
        homeManagerAngryTicks--;
        const targetY = 66.5; // Runs past sideline onto pitch
        homeManagerPos.y += (targetY - homeManagerPos.y) * 0.08;
        homeManagerPos.x += (Math.random() - 0.5) * 0.35; // Shaking/Jittering
        homeManagerContainer.scale.set(1.1);
      } else if (homeManagerTacticalTicks > 0) {
        homeManagerTacticalTicks--;
        const targetY = 68.0; // Stands close to line
        homeManagerPos.y += (targetY - homeManagerPos.y) * 0.05;
        homeManagerContainer.scale.set(1.0 + Math.abs(Math.sin(homeManagerTacticalTicks * 0.08)) * 0.05);
      } else {
        homeManagerContainer.scale.set(1.0);
        
        // Pacing
        homeManagerPos.x += homeManagerPaceDirection * 0.015;
        if (homeManagerPos.x > 44) {
          homeManagerPos.x = 44;
          homeManagerPaceDirection = -1;
        } else if (homeManagerPos.x < 34) {
          homeManagerPos.x = 34;
          homeManagerPaceDirection = 1;
        }

        // Reactive sideline move
        let targetY = 69.5;
        if (match.ball.pos.x < 52.5 && match.ball.pos.y > 48) {
          targetY = 68.2;
        }
        homeManagerPos.y += (targetY - homeManagerPos.y) * 0.05;
      }

      // Decrement shout visibility
      if (homeShoutTicks > 0) {
        homeShoutTicks--;
        if (homeShoutTicks === 0) homeShoutText.visible = false;
      }
      
      homeManagerContainer.x = toScreenX(homeManagerPos.x);
      homeManagerContainer.y = toScreenY(homeManagerPos.y);
      if (homeManagerCelebrateTicks > 0) {
        const jump = Math.abs(Math.sin(homeManagerCelebrateTicks * 0.15)) * 12;
        homeManagerContainer.y -= jump;
      }

      // Update Away Manager
      if (awayManagerCelebrateTicks > 0) {
        awayManagerCelebrateTicks--;
        awayManagerPos.x += (64 - awayManagerPos.x) * 0.08;
        awayManagerContainer.scale.set(1.0 + Math.abs(Math.sin(awayManagerCelebrateTicks * 0.15)) * 0.25);
      } else if (awayManagerAngryTicks > 0) {
        awayManagerAngryTicks--;
        const targetY = 66.5; // Runs past sideline onto pitch
        awayManagerPos.y += (targetY - awayManagerPos.y) * 0.08;
        awayManagerPos.x += (Math.random() - 0.5) * 0.35; // Shaking/Jittering
        awayManagerContainer.scale.set(1.1);
      } else if (awayManagerTacticalTicks > 0) {
        awayManagerTacticalTicks--;
        const targetY = 68.0; // Stands close to line
        awayManagerPos.y += (targetY - awayManagerPos.y) * 0.05;
        awayManagerContainer.scale.set(1.0 + Math.abs(Math.sin(awayManagerTacticalTicks * 0.08)) * 0.05);
      } else {
        awayManagerContainer.scale.set(1.0);
        
        // Pacing
        awayManagerPos.x += awayManagerPaceDirection * 0.015;
        if (awayManagerPos.x > 71) {
          awayManagerPos.x = 71;
          awayManagerPaceDirection = -1;
        } else if (awayManagerPos.x < 61) {
          awayManagerPos.x = 61;
          awayManagerPaceDirection = 1;
        }

        // Reactive sideline move
        let targetY = 69.5;
        if (match.ball.pos.x >= 52.5 && match.ball.pos.y > 48) {
          targetY = 68.2;
        }
        awayManagerPos.y += (targetY - awayManagerPos.y) * 0.05;
      }

      // Decrement shout visibility
      if (awayShoutTicks > 0) {
        awayShoutTicks--;
        if (awayShoutTicks === 0) awayShoutText.visible = false;
      }

      awayManagerContainer.x = toScreenX(awayManagerPos.x);
      awayManagerContainer.y = toScreenY(awayManagerPos.y);
      if (awayManagerCelebrateTicks > 0) {
        const jump = Math.abs(Math.sin(awayManagerCelebrateTicks * 0.15)) * 12;
        awayManagerContainer.y -= jump;
      }

      // 2. Update Ball & Shadow positions
      const bState = match.ball;
      const bX = toScreenX(bState.pos.x);
      const bY = toScreenY(bState.pos.y);
      
      const ballVis = ballGraphicRef.current;
      const shadowVis = ballShadowGraphicRef.current;

      if (ballVis && shadowVis) {
        // Easing interpolation for ball
        ballVis.x += (bX - ballVis.x) * 0.35;
        ballVis.y += (bY - ballVis.y) * 0.35;
        
        // 3D Height mapping
        const ballHeightOffset = bState.height * scale * 1.5; // Amplify height visuals
        ballVis.y -= ballHeightOffset; // move UP on 2D screen

        // Shadow positions remain on grass ground
        shadowVis.x = ballVis.x;
        shadowVis.y = ballVis.y + ballHeightOffset;

        // Scale shadow based on height
        const shadowScale = Math.max(0.3, 1 - bState.height * 0.15);
        shadowVis.scale.set(shadowScale);
        shadowVis.alpha = Math.max(0.1, 0.45 - bState.height * 0.08);
      }

      // 3. Update Referees
      // Head Referee target selection (diagonal pattern running, offset from the ball)
      const idealRefY = 15 + (bState.pos.x / 105) * 38; 
      const refTargetX = bState.pos.x - 9 * (bState.pos.x > 52.5 ? 1 : -1); 
      const refTargetY = (bState.pos.y + idealRefY) / 2;

      // Smooth interpolation for head referee
      refereePosRef.current.x += (refTargetX - refereePosRef.current.x) * 0.04;
      refereePosRef.current.y += (refTargetY - refereePosRef.current.y) * 0.04;
      
      // Keep inside pitch
      refereePosRef.current.x = Math.max(2, Math.min(103, refereePosRef.current.x));
      refereePosRef.current.y = Math.max(2, Math.min(66, refereePosRef.current.y));

      refereeContainer.x = toScreenX(refereePosRef.current.x);
      refereeContainer.y = toScreenY(refereePosRef.current.y);

      // AR1 (Top Linesman covering left half offside line)
      const homeDFs = match.players.filter(p => p.teamId === match.homeTeam.id && p.position !== 'GK');
      const lastHomeDefX = homeDFs.length > 0 ? Math.min(...homeDFs.map(p => p.pos.x)) : 25;
      const ar1TargetX = Math.max(1, Math.min(52.5, Math.min(lastHomeDefX, bState.pos.x)));
      ar1PosRef.current.x += (ar1TargetX - ar1PosRef.current.x) * 0.07;
      ar1Container.x = toScreenX(ar1PosRef.current.x);
      ar1Container.y = toScreenY(-1.0); // stand slightly above top sideline

      // AR2 (Bottom Linesman covering right half offside line)
      const awayDFs = match.players.filter(p => p.teamId === match.awayTeam.id && p.position !== 'GK');
      const lastAwayDefX = awayDFs.length > 0 ? Math.max(...awayDFs.map(p => p.pos.x)) : 80;
      const ar2TargetX = Math.max(52.5, Math.min(104, Math.max(lastAwayDefX, bState.pos.x)));
      ar2PosRef.current.x += (ar2TargetX - ar2PosRef.current.x) * 0.07;
      ar2Container.x = toScreenX(ar2PosRef.current.x);
      ar2Container.y = toScreenY(69.0); // stand slightly below bottom sideline
    });

    return () => {
      app.destroy(true, { children: true, texture: true, baseTexture: true });
      playersGroupRef.current.clear();
      benchPlayersGroupRef.current.clear();
      exitingPlayersRef.current.clear();
      appRef.current = null;
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '1000px', margin: '0 auto', borderRadius: '16px', overflow: 'hidden', border: '3px solid rgba(255,255,255,0.08)', boxShadow: '0 10px 40px rgba(0,0,0,0.6)' }}>
      {/* Pixi Canvas Mounting Container */}
      <div ref={containerRef} style={{ width: '1000px', height: '744px' }} />
    </div>
  );
}

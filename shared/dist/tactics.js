export const FORMATION_ROLES = {
    '4-3-3': [
        { position: 'GK', role: 'GK' },
        { position: 'DF', role: 'LB' },
        { position: 'DF', role: 'LCB' },
        { position: 'DF', role: 'RCB' },
        { position: 'DF', role: 'RB' },
        { position: 'MF', role: 'LCM' },
        { position: 'MF', role: 'CM' },
        { position: 'MF', role: 'RCM' },
        { position: 'FW', role: 'LW' },
        { position: 'FW', role: 'ST' },
        { position: 'FW', role: 'RW' },
    ],
    '4-2-3-1': [
        { position: 'GK', role: 'GK' },
        { position: 'DF', role: 'LB' },
        { position: 'DF', role: 'LCB' },
        { position: 'DF', role: 'RCB' },
        { position: 'DF', role: 'RB' },
        { position: 'MF', role: 'LDMC' },
        { position: 'MF', role: 'RDMC' },
        { position: 'MF', role: 'LAM' },
        { position: 'MF', role: 'CAM' },
        { position: 'MF', role: 'RAM' },
        { position: 'FW', role: 'ST' },
    ],
    '3-5-2': [
        { position: 'GK', role: 'GK' },
        { position: 'DF', role: 'LCB' },
        { position: 'DF', role: 'CB' },
        { position: 'DF', role: 'RCB' },
        { position: 'MF', role: 'LWB' },
        { position: 'MF', role: 'LDMC' },
        { position: 'MF', role: 'RDMC' },
        { position: 'MF', role: 'RWB' },
        { position: 'MF', role: 'CAM' },
        { position: 'FW', role: 'LST' },
        { position: 'FW', role: 'RST' },
    ],
    '4-4-2': [
        { position: 'GK', role: 'GK' },
        { position: 'DF', role: 'LB' },
        { position: 'DF', role: 'LCB' },
        { position: 'DF', role: 'RCB' },
        { position: 'DF', role: 'RB' },
        { position: 'MF', role: 'LM' },
        { position: 'MF', role: 'LCM' },
        { position: 'MF', role: 'RCM' },
        { position: 'MF', role: 'RM' },
        { position: 'FW', role: 'LST' },
        { position: 'FW', role: 'RST' },
    ],
};
export const FORMATION_COORDINATES = {
    '4-3-3': {
        GK: { x: 4, y: 34 },
        LB: { x: 22, y: 10 },
        LCB: { x: 18, y: 24 },
        RCB: { x: 18, y: 44 },
        RB: { x: 22, y: 58 },
        LCM: { x: 38, y: 20 },
        CM: { x: 35, y: 34 },
        RCM: { x: 38, y: 48 },
        LW: { x: 65, y: 12 },
        ST: { x: 72, y: 34 },
        RW: { x: 65, y: 56 },
    },
    '4-2-3-1': {
        GK: { x: 4, y: 34 },
        LB: { x: 22, y: 10 },
        LCB: { x: 18, y: 24 },
        RCB: { x: 18, y: 44 },
        RB: { x: 22, y: 58 },
        LDMC: { x: 32, y: 22 },
        RDMC: { x: 32, y: 46 },
        LAM: { x: 50, y: 15 },
        CAM: { x: 48, y: 34 },
        RAM: { x: 50, y: 53 },
        ST: { x: 72, y: 34 },
    },
    '3-5-2': {
        GK: { x: 4, y: 34 },
        LCB: { x: 18, y: 20 },
        CB: { x: 16, y: 34 },
        RCB: { x: 18, y: 48 },
        LWB: { x: 32, y: 10 },
        LDMC: { x: 35, y: 24 },
        RDMC: { x: 35, y: 44 },
        RWB: { x: 32, y: 58 },
        CAM: { x: 52, y: 34 },
        LST: { x: 72, y: 25 },
        RST: { x: 72, y: 43 },
    },
    '4-4-2': {
        GK: { x: 4, y: 34 },
        LB: { x: 22, y: 10 },
        LCB: { x: 18, y: 24 },
        RCB: { x: 18, y: 44 },
        RB: { x: 22, y: 58 },
        LM: { x: 42, y: 12 },
        LCM: { x: 38, y: 26 },
        RCM: { x: 38, y: 42 },
        RM: { x: 42, y: 56 },
        LST: { x: 72, y: 25 },
        RST: { x: 72, y: 43 },
    },
};
/**
 * Calculates a player's dynamic target position on the pitch based on:
 * 1. Base formation coordinates
 * 2. Play phase (attacking, defending, transition)
 * 3. Ball position (shifting team block horizontally and vertically)
 * 4. Tactics (defensive line height, pressing height, tempo)
 */
export function getTacticalTargetPosition(role, formation, isHome, ballPos, tactics, possessionTeamId, teamId, hasActiveSoloDribbler) {
    const base = FORMATION_COORDINATES[formation][role];
    if (!base)
        return { x: 52.5, y: 34 }; // Fallback
    const isAttacking = possessionTeamId === teamId;
    const isTransition = possessionTeamId === null;
    // 1. Scale coordinates based on team settings and game state
    let x = base.x;
    let y = base.y;
    // Shift defensive line and pressing
    if (isAttacking) {
        // Team pushes forward
        const pushFactor = 1.0 + (tactics.tempo / 150); // Higher tempo, more aggressive push
        x += 12 * pushFactor;
        // Widen coordinates
        if (role.endsWith('B') || role.endsWith('M') || role.endsWith('W')) {
            if (y < 34)
                y -= 4;
            else if (y > 34)
                y += 4;
        }
        // If there is an active solo dribbler on the team, the attacking formation breaks/warps
        if (hasActiveSoloDribbler) {
            // Wingers stretch extremely wide to the touchline, stretching the defense
            if (role.includes('LW') || role.includes('RW') || role.includes('LM') || role.includes('RM') || role.includes('LWB') || role.includes('RWB')) {
                if (y < 34)
                    y = Math.max(3, y - 10);
                else if (y > 34)
                    y = Math.min(65, y + 10);
            }
            // Strikers push deep into the box to pull center backs away
            if (role.includes('ST') || role.includes('FW') || role.includes('FC')) {
                x = Math.min(94, x + 12);
            }
            // Midfielders drop back to cover (creating a large gap in the center of the pitch)
            if (role.includes('CM') || role.includes('DM') || role.includes('MC') || role.includes('AM')) {
                x = Math.max(15, x - 15);
            }
        }
    }
    else {
        // Defending
        const dLineShift = (tactics.defensiveLine - 50) * 0.15; // -7.5m to +7.5m
        const pressingShift = (tactics.pressingIntensity - 50) * 0.15;
        if (role.includes('CB') || role === 'CB') {
            x += dLineShift;
        }
        else {
            x += (dLineShift + pressingShift) * 0.5;
        }
    }
    // Normalized ball X in team's attacking perspective (0 is own goal line, 105 is opponent's goal line)
    const normBallX = isHome ? ballPos.x : 105 - ballPos.x;
    // Defenders push up high during attack to support midfield/attack
    if (isAttacking) {
        const isDefender = role === 'LB' || role === 'RB' || role === 'LCB' || role === 'RCB' || role === 'CB';
        if (isDefender) {
            const defenderPush = Math.max(0, (normBallX - 52.5) * 0.35);
            x += defenderPush;
        }
    }
    // Strikers drop back deep during defense to support midfield/defense
    if (!isAttacking && !isTransition) {
        const isForward = role === 'LW' || role === 'RW' || role === 'ST' || role === 'LST' || role === 'RST';
        if (isForward) {
            const forwardDrop = Math.max(0, (52.5 - normBallX) * 0.38);
            x -= forwardDrop;
        }
    }
    // Cap initial values
    x = Math.max(8, Math.min(95, x));
    // 2. Ball-relative shifting (team block follows the ball)
    // Shift factor: how much the team slides to follow the ball
    let ballShiftX = (ballPos.x - 52.5) * 0.48; // was 0.35
    let ballShiftY = (ballPos.y - 34) * 0.32; // was 0.25
    // If transition or loose ball, reduce shifting so players reset closer to base formation
    if (possessionTeamId === null) {
        ballShiftX *= 0.5;
        ballShiftY *= 0.5;
    }
    let finalX = x + ballShiftX;
    let finalY = y + ballShiftY;
    // Goalkeeper specific placement (narrowing angles, positioned on the shot line)
    if (role === 'GK') {
        // Math is done in home team's perspective (defending x = 0) and mirrored at the end of the function
        const tempBallPos = isHome ? ballPos : { x: 105 - ballPos.x, y: 68 - ballPos.y };
        const goalCenter = { x: 0, y: 34 };
        const toBallX = tempBallPos.x - goalCenter.x;
        const toBallY = tempBallPos.y - goalCenter.y;
        const distToBall = Math.sqrt(toBallX * toBallX + toBallY * toBallY);
        if (distToBall > 0.1) {
            const dirX = toBallX / distToBall;
            const dirY = toBallY / distToBall;
            // Stand further out when ball is further away, up to ~7.5m max
            const standOutDist = 1.8 + Math.min(5.7, distToBall * 0.12);
            finalX = goalCenter.x + dirX * standOutDist;
            finalY = goalCenter.y + dirY * standOutDist;
        }
        else {
            finalX = goalCenter.x;
            finalY = goalCenter.y;
        }
        // Confine to goalkeeper's box/defensive area boundaries
        finalX = Math.max(1.5, Math.min(16.5, finalX));
        finalY = Math.max(22.0, Math.min(46.0, finalY));
    }
    // 3. Keep within logical pitch bounds
    finalX = Math.max(2, Math.min(103, finalX));
    finalY = Math.max(2, Math.min(66, finalY));
    // 4. Mirror for away team (away team attacks right to left, i.e., towards x = 0)
    if (!isHome) {
        finalX = 105 - finalX;
        finalY = 68 - finalY;
    }
    return { x: finalX, y: finalY };
}

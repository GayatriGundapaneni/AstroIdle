import * as vscode from 'vscode';

let idleTimer: NodeJS.Timeout;
let screensaverPanel: vscode.WebviewPanel | undefined = undefined;
let isScreensaverActive = false;
let welcomeStatusBarItem: vscode.Disposable | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
    resetIdleTimer(context);

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('astroIdle.inactivityTimeout')) {
                resetIdleTimer(context);
            }
        }),

        vscode.workspace.onDidChangeTextDocument(() => resetIdleTimer(context)),
        vscode.window.onDidChangeTextEditorSelection(() => resetIdleTimer(context)),
        vscode.window.onDidChangeActiveTextEditor(() => resetIdleTimer(context)),
        vscode.window.onDidChangeVisibleTextEditors(() => resetIdleTimer(context)),
        vscode.window.onDidChangeTextEditorViewColumn(() => resetIdleTimer(context)),

        vscode.window.onDidChangeWindowState((state) => {
            if (state.focused) {
                resetIdleTimer(context);
            }
        })
    );
}

function getIdleTimeoutMs(): number {
    const config = vscode.workspace.getConfiguration('astroIdle');
    const minutes = config.get<number>('inactivityTimeout', 3);
    return minutes * 60 * 1000;
}

function resetIdleTimer(context: vscode.ExtensionContext) {
    clearTimeout(idleTimer);

    const timeoutMs = getIdleTimeoutMs();
    idleTimer = setTimeout(() => {
        if (!isScreensaverActive && vscode.window.state.focused) {
            startScreensaver(context);
        }
    }, timeoutMs);
}

async function startScreensaver(context: vscode.ExtensionContext) {
    if (screensaverPanel || isScreensaverActive || !vscode.window.state.focused) {
        if (!vscode.window.state.focused) {
            resetIdleTimer(context);
        }
        return;
    }

    isScreensaverActive = true;

    screensaverPanel = vscode.window.createWebviewPanel(
        'cosmicScreensaver',
        'Cosmic Screensaver',
        vscode.ViewColumn.Active,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.file(context.extensionPath)]
        }
    );

    screensaverPanel.webview.html = getCosmicHtml();

    await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
    await vscode.commands.executeCommand('workbench.action.toggleFullScreen');

    screensaverPanel.onDidDispose(() => {
        cleanUpAndExit(context);
    });

    screensaverPanel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'dismissComplete') {
            cleanUpAndExit(context);
        }
    });
}

async function cleanUpAndExit(context: vscode.ExtensionContext) {
    clearTimeout(idleTimer);

    if (screensaverPanel) {
        await vscode.commands.executeCommand('workbench.action.toggleFullScreen');
        screensaverPanel.dispose();
        screensaverPanel = undefined;
    }

    if (welcomeStatusBarItem && typeof welcomeStatusBarItem.dispose === 'function') {
        try {
            welcomeStatusBarItem.dispose();
        } catch (e) {}
        welcomeStatusBarItem = undefined;
    }

    welcomeStatusBarItem = vscode.window.setStatusBarMessage('$(sparkles) Welcome back!!');

    const currentItem = welcomeStatusBarItem;
    setTimeout(() => {
        if (currentItem && typeof currentItem.dispose === 'function') {
            try {
                currentItem.dispose();
            } catch (e) {}
        }
    }, 3500);

    setTimeout(() => {
        isScreensaverActive = false;
        resetIdleTimer(context);
    }, 1200);
}

function getCosmicHtml(): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body, html {
                margin: 0; padding: 0; overflow: hidden;
                background-color: #000000; width: 100%; height: 100%;
                cursor: none; user-select: none;
            }
            canvas {
                display: block; position: absolute; top: 0; left: 0;
                width: 100%; height: 100%; opacity: 1;
                transition: opacity 2.0s cubic-bezier(0.4, 0, 0.2, 1); z-index: 1;
            }
            .fade-out { opacity: 0 !important; }
        </style>
    </head>
    <body>
        <canvas id="space"></canvas>
        <script>
            const vscode = acquireVsCodeApi();
            const canvas = document.getElementById('space');
            const ctx = canvas.getContext('2d');
            ctx.globalCompositeOperation = 'source-over';
            let dismissed = false;
            let stars = [];
            let shootingStars = [];
            const STAR_DENSITY = 0.0003045;

            function random(min, max) { return Math.random() * (max - min) + min; }
            function pickStarColor() {
                const roll = Math.random();
                if (roll < 0.72) return { r: 255, g: 255, b: 255 };
                if (roll < 0.9)  return { r: 255, g: 244, b: 214 };
                return { r: 220, g: 235, b: 255 };
            }
            function calculateStarCount() {
                return Math.floor((window.innerWidth * window.innerHeight) * STAR_DENSITY);
            }
            function createStar() {
                const rarity = Math.random();
                let radius, opacity, flickerSpeed, flickerAmount, sharpness;
                if (rarity < 0.45) {
                    radius = random(0.12, 0.22); opacity = random(0.35, 0.7);
                    flickerSpeed = random(0.0004, 0.0015); flickerAmount = random(0.02, 0.08); sharpness = 0;
                } else if (rarity < 0.94) {
                    radius = random(0.35, 0.75); opacity = random(0.65, 1);
                    flickerSpeed = random(0.001, 0.004); flickerAmount = random(0.12, 0.28); sharpness = random(1.5, 2.8);
                } else {
                    radius = random(0.8, 1.4); opacity = random(0.9, 1);
                    flickerSpeed = random(0.002, 0.006); flickerAmount = random(0.18, 0.38); sharpness = random(2.8, 4.2);
                }
                return {
                    x: Math.random() * canvas.width, y: Math.random() * canvas.height,
                    radius, sharpness, baseOpacity: opacity, flickerSpeed, flickerAmount,
                    color: pickStarColor(), noiseA: Math.random() * 10000, noiseB: Math.random() * 10000
                };
            }
            function createShootingStar() {
                const direction = Math.random() > 0.5 ? 1 : -1;
                let startX = direction === 1 ? random(canvas.width * 0.05, canvas.width * 0.4) : random(canvas.width * 0.6, canvas.width * 0.95);
                const startY = random(canvas.height * 0.05, canvas.height * 0.45);
                const angle = direction === 1 ? random(Math.PI * 0.15, Math.PI * 0.35) : random(Math.PI * 0.65, Math.PI * 0.85);
                const speed = random(10.5, 18.2);
                shootingStars.push({ x: startX, y: startY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, opacity: 1 });
            }
            function drawBackground() { ctx.clearRect(0, 0, canvas.width, canvas.height); }
            function drawSharpStar(x, y, radius, sharpness, color) {
                ctx.fillStyle = color;
                ctx.fillRect(x - sharpness, y, sharpness * 2, 0.35);
                ctx.fillRect(x, y - sharpness, 0.35, sharpness * 2);
                ctx.fillRect(x - radius * 0.4, y - radius * 0.4, radius * 0.8, radius * 0.8);
            }
            function drawStar(star, time) {
                const flickerA = Math.sin(time * star.flickerSpeed + star.noiseA);
                const flickerB = Math.sin(time * 0.00031 + star.noiseB);
                const opacity = Math.max(0, star.baseOpacity + (flickerA * flickerB) * star.flickerAmount);
                const { r, g, b } = star.color;
                const color = 'rgba(' + r + ',' + g + ',' + b + ',' + opacity + ')';
                if (star.radius < 0.25) {
                    ctx.fillStyle = color; ctx.fillRect(star.x, star.y, 1, 1); return;
                }
                if (star.radius < 0.55) {
                    const glow = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.radius * 2.1);
                    glow.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + opacity * 0.11 + ')'); glow.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.beginPath(); ctx.fillStyle = glow; ctx.arc(star.x, star.y, star.radius * 2.1, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.fillStyle = color; ctx.arc(star.x, star.y, star.radius * 0.55, 0, Math.PI * 2); ctx.fill();
                    return;
                }
                const glow = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.radius * 1.15);
                glow.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + opacity * 0.075 + ')'); glow.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.beginPath(); ctx.fillStyle = glow; ctx.arc(star.x, star.y, star.radius * 1.15, 0, Math.PI * 2); ctx.fill();
                drawSharpStar(star.x, star.y, star.radius, star.sharpness, color);
            }
            function render(currentTime) {
                if (dismissed) return;
                drawBackground();
                for (const star of stars) { drawStar(star, currentTime); }
                if (Math.random() < 0.006) createShootingStar();
                for (let i = shootingStars.length - 1; i >= 0; i--) {
                    const s = shootingStars[i]; s.x += s.vx; s.y += s.vy; s.opacity -= 0.02;
                    if (s.opacity <= 0) { shootingStars.splice(i, 1); continue; }
                    const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 6, s.y - s.vy * 6);
                    grad.addColorStop(0, 'rgba(255,255,255,' + s.opacity + ')'); grad.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.strokeStyle = grad; ctx.lineWidth = 0.65; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 6, s.y - s.vy * 6); ctx.stroke();
                }
                requestAnimationFrame(render);
            }
            function resizeCanvas() {
                canvas.width = window.innerWidth; canvas.height = window.innerHeight;
                stars = []; const count = calculateStarCount();
                for (let i = 0; i < count; i++) stars.push(createStar());
            }
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);
            function initiateGradualDismissal() {
                if (dismissed) return;
                dismissed = true;
                canvas.classList.add('fade-out');
                setTimeout(() => { vscode.postMessage({ command: 'dismissComplete' }); }, 2000);
            }
            window.addEventListener('mousemove', (e) => {
                if (e.movementX === 0 && e.movementY === 0) return;
                initiateGradualDismissal();
            });
            window.addEventListener('mousedown', initiateGradualDismissal);
            window.addEventListener('keydown', initiateGradualDismissal);
            requestAnimationFrame(render);
        </script>
    </body>
    </html>
    `;
}

export function deactivate() {
    clearTimeout(idleTimer);
}
// Bloch sphere backdrop, drawn the way QubitBoard draws its Bloch displays.
// Motion is derived from wall-clock time, so it carries on seamlessly between pages.
// The spheres are monochrome; only the moving state points carry colour, and that colour is the
// qubit's state: blue near |0⟩, gold around the equator (an even superposition), green near |1⟩.
// A slow drive tips the whole board from |0⟩ through the equator to |1⟩ and back, and whichever
// colour most qubits show is published as --accent for the page title and link hovers.
//
// On top of the steady precession:
//  - clicking measures the nearby qubits: each collapses to |0⟩ or |1⟩ (Born rule), then relaxes
//  - sweeping the cursor across the board entangles pairs of qubits, which then mirror each other
//  - when the visitor is idle the qubits slowly decohere, and recohere on any movement
//  - moving the cursor sends phase waves through the board, which interfere where they cross
class BlochBackdrop {
    constructor() {
        this.driveSeconds = 45;  // how long the drive takes over each stop: |0⟩, equator, |1⟩, equator
        this.pace = 0.5;         // scales how fast the qubits precess and wobble
        // GitHub's blue, gold and green for |0⟩, the equator and |1⟩, in its light and dark shades
        this.colors = {
            light: ['#0969da', '#9a6700', '#1a7f37'],
            dark: ['#58a6ff', '#d29922', '#3fb950']
        };
        // Mixed (decohered) states fade towards GitHub's muted grey
        this.muted = { light: [101, 109, 118], dark: [139, 148, 158] };
        this.trailSteps = 8;
        this.trailGap = 0.12;     // seconds between trail samples
        this.measureSpeed = 200;  // px/s that a measurement spreads from the click
        this.collapseSeconds = 0.35; // how long a qubit takes to fall to its pole
        this.collapsedSeconds = 2.8; // how long it stays collapsed before relaxing
        this.measureLife = 6.5;   // seconds from collapse until the qubit has relaxed again
        this.waveSpeed = 140;
        this.waveLength = 160;
        this.waveLife = 6;
        this.pairLife = 10;
        this.clicks = [];
        this.clickCount = 0;
        this.waves = [];
        this.pairs = [];
        this.pointerPath = [];
        this.lastPairAt = 0;
        this.outcomes = new Map();
        this.pointer = { x: 0, y: 0, tx: 0, ty: 0, presence: 0, target: 0 };
        this.coherence = 1;
        this.lastActive = performance.now();
        this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

        this.canvas = document.createElement('canvas');
        this.canvas.className = 'bloch-backdrop';
        this.canvas.setAttribute('aria-hidden', 'true');
        // Kept outside <body>, which the post page rebuilds
        document.documentElement.append(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.restoreState();
        this.readTheme();
        this.layout();
        this.frame(performance.now());

        const active = () => { this.lastActive = performance.now(); };
        for (const type of ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart']) {
            window.addEventListener(type, active, { passive: true });
        }
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => this.layout(), 120);
        });
        window.addEventListener('pointermove', (event) => {
            this.pointer.tx = event.clientX;
            this.pointer.ty = event.clientY;
            this.pointer.target = 1;
            active();
        }, { passive: true });
        document.addEventListener('pointerleave', () => { this.pointer.target = 0; });
        window.addEventListener('blur', () => { this.pointer.target = 0; });
        window.addEventListener('pointerdown', (event) => {
            if (event.target.closest('a, button, input, label, select, textarea')) return;
            this.measure(event.clientX, event.clientY);
        });
        window.addEventListener('pagehide', () => this.saveState());
        new MutationObserver(() => {
            this.readTheme();
            this.renderNow();
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        this.reduceMotion.addEventListener('change', () => {
            if (this.raf) cancelAnimationFrame(this.raf);
            this.frame(performance.now());
        });
    }

    // Deterministic pseudo-random number in [0, 1) so the board looks the same on every page
    static hash(a, b, c) {
        let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1274126177)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1103515245);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }

    static clamp(t) {
        return Math.max(0, Math.min(1, t));
    }

    static smooth(t) {
        t = BlochBackdrop.clamp(t);
        return t * t * (3 - 2 * t);
    }

    // ---- theme and colour ----

    readTheme() {
        this.dark = document.documentElement.getAttribute('data-theme') === 'dark';
        const style = getComputedStyle(document.documentElement);
        this.ink = style.getPropertyValue('--text-lighter').trim();
        this.guide = style.getPropertyValue('--border-hover').trim();
        this.palette = (this.dark ? this.colors.dark : this.colors.light)
            .map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
        this.grey = this.dark ? this.muted.dark : this.muted.light;
        this.accent = null;
        this.lastAccent = -Infinity;
    }

    // The drive: every state is centred on this polar angle, which dwells on |0⟩, the equator,
    // |1⟩ and the equator again, easing from one to the next
    driveAt(time) {
        const stops = [0.35, Math.PI / 2, Math.PI - 0.35, Math.PI / 2];
        const step = time / this.driveSeconds;
        const index = Math.floor(step);
        const from = stops[index % stops.length];
        const to = stops[(index + 1) % stops.length];
        return from + (to - from) * BlochBackdrop.smooth((step - index - 0.6) / 0.4);
    }

    // How much blue, gold and green a state at height z shows; colours only blend near the boundaries
    static shares(z) {
        const zero = BlochBackdrop.smooth((z - 1 / 3) / 0.16 + 0.5);
        const one = BlochBackdrop.smooth((-1 / 3 - z) / 0.16 + 0.5);
        return [zero, 1 - zero - one, one];
    }

    // The point's colour, greyed as the state becomes mixed
    colorOf(shares, length) {
        const grey = BlochBackdrop.clamp((0.9 - length) / 0.6) * 0.85;
        const rgb = [0, 1, 2].map((c) => {
            const pure = shares[0] * this.palette[0][c] + shares[1] * this.palette[1][c] + shares[2] * this.palette[2][c];
            return Math.round(pure + (this.grey[c] - pure) * grey);
        });
        return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }

    // The site takes the colour most qubits are showing, easing into it over a few seconds
    updateAccent(votes, publish) {
        const leader = votes.indexOf(Math.max(...votes));
        // A margin before switching, so a near tie doesn't flip the page colour back and forth
        if (this.majority === undefined || votes[leader] > votes[this.majority] * 1.15) this.majority = leader;
        const target = this.palette[this.majority];
        this.accent = this.accent ? this.accent.map((c, i) => c + (target[i] - c) * 0.04) : target.slice();
        if (publish) {
            const [r, g, b] = this.accent.map(Math.round);
            document.documentElement.style.setProperty('--accent', `rgb(${r}, ${g}, ${b})`);
        }
    }

    layout() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.width = width;
        this.height = height;
        this.dpr = dpr;
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);

        const spacing = width < 640 ? 84 : 104;
        const cols = Math.ceil(width / spacing) + 1;
        const rows = Math.ceil(height / (spacing * 0.87)) + 1;
        const offsetX = (width - (cols - 1) * spacing) / 2;
        this.spacing = spacing;
        this.radius = spacing * 0.25;
        this.spheres = [];
        for (let j = 0; j < rows; j++) {
            const y = spacing * 0.4 + j * spacing * 0.87;
            for (let i = 0; i < cols; i++) {
                const x = offsetX + i * spacing - (j % 2) * spacing / 2;
                const r = (k) => BlochBackdrop.hash(i, j, k);
                this.spheres.push({
                    i,
                    j,
                    index: this.spheres.length,
                    x,
                    y,
                    speed: (0.45 + r(1) * 0.9) * (r(2) < 0.5 ? 1 : -1),
                    phase: r(3) * Math.PI * 2,
                    theta: 0.5 + r(4) * 2.1,
                    wobble: 0.25 + r(5) * 0.4,
                    wobblePhase: r(6) * Math.PI * 2,
                    decoherePhase: r(7) * Math.PI * 2,
                    pair: null
                });
            }
        }
        this.pairs = [];
        this.pointerPath = [];
        this.renderNow();
    }

    // ---- state carried between pages ----

    restoreState() {
        try {
            const saved = JSON.parse(sessionStorage.getItem('bloch-state'));
            if (saved && saved.pointer) {
                const { x, y } = saved.pointer;
                Object.assign(this.pointer, { x, y, tx: x, ty: y, presence: 1, target: 1 });
            }
        } catch (error) {
            // Storage can be unavailable (private mode); the board simply starts fresh
        }
        this.waveFrom = { x: this.pointer.tx, y: this.pointer.ty };
    }

    saveState() {
        try {
            sessionStorage.setItem('bloch-state', JSON.stringify({
                pointer: this.pointer.target > 0 ? { x: this.pointer.tx, y: this.pointer.ty } : null
            }));
        } catch (error) {
            // Nothing to do without storage
        }
    }

    // ---- interactions ----

    measure(x, y) {
        this.clicks.push({
            id: `c${++this.clickCount}`,
            x,
            y,
            start: Date.now() / 1000,
            seed: Math.floor(Math.random() * 1e9),
            reach: 170
        });
        if (this.clicks.length > 4) this.clicks.shift();
    }

    // Visitor clicks plus a couple of measurements on a shared clock, so the board is never still
    measurements(time) {
        const list = [];
        const period = 12;
        for (let slot = 0; slot < 2; slot++) {
            const current = Math.floor((time + (slot * period) / 2) / period);
            for (const cycle of [current - 1, current]) {
                const r = (k) => BlochBackdrop.hash(cycle, slot, k);
                const side = r(1) < 0.5 ? r(2) * 0.25 : 1 - r(2) * 0.25;
                list.push({
                    id: `a${slot}:${cycle}`,
                    x: side * this.width,
                    y: r(3) * this.height,
                    start: cycle * period - (slot * period) / 2,
                    seed: cycle * 2 + slot,
                    reach: 140
                });
            }
        }
        return list.concat(this.clicks);
    }

    // Born rule: the chance of |0⟩ is (1 + z) / 2, decided once per qubit per measurement
    outcome(m, sphere, at, waves) {
        const key = `${m.id}:${sphere.index}`;
        let pole = this.outcomes.get(key);
        if (pole === undefined) {
            const z = this.baseVector(sphere, at, waves).v[2];
            pole = BlochBackdrop.hash(m.seed, sphere.i + 1000, sphere.j) < (1 + z) / 2 ? 1 : -1;
            if (this.outcomes.size > 4000) this.outcomes.clear();
            this.outcomes.set(key, pole);
        }
        return pole;
    }

    nearestSphere(x, y) {
        let best = null;
        let bestDistance = this.spacing * 0.5;
        for (const sphere of this.spheres) {
            const distance = Math.hypot(sphere.x - x, sphere.y - y);
            if (distance < bestDistance) {
                best = sphere;
                bestDistance = distance;
            }
        }
        return best;
    }

    // A quick sweep of the cursor from one qubit to another a couple of places away entangles them
    trackPointer(time) {
        const p = this.pointer;
        if (p.target < 1) return;
        const nearest = this.nearestSphere(p.tx, p.ty);
        const path = this.pointerPath;
        if (!nearest || (path.length && path[path.length - 1].sphere === nearest)) return;
        path.push({ sphere: nearest, at: time });
        while (path.length && time - path[0].at > 1.2) path.shift();
        if (time - this.lastPairAt < 0.5 || this.pairs.length >= 4 || nearest.pair) return;
        for (const entry of path) {
            const apart = Math.hypot(entry.sphere.x - nearest.x, entry.sphere.y - nearest.y) / this.spacing;
            if (apart >= 1.8 && apart <= 3.4 && !entry.sphere.pair) {
                this.pairs.push({ a: entry.sphere, b: nearest, start: time, strength: 0 });
                this.lastPairAt = time;
                path.length = 0;
                break;
            }
        }
    }

    updateInteractions(now, time) {
        // Idle visitors watch the board decohere; any movement brings it back
        const idle = (now - this.lastActive) / 1000;
        const coherent = 1 - 0.7 * BlochBackdrop.clamp((idle - 6) / 10);
        this.coherence += (coherent - this.coherence) * (coherent > this.coherence ? 0.15 : 0.04);

        // The cursor drops a phase wave every so often as it moves
        const p = this.pointer;
        if (p.target > 0 && Math.hypot(p.tx - this.waveFrom.x, p.ty - this.waveFrom.y) > 90) {
            this.waves.push({ x: p.tx, y: p.ty, start: time });
            this.waveFrom = { x: p.tx, y: p.ty };
            if (this.waves.length > 8) this.waves.shift();
        }
        this.waves = this.waves.filter((wave) => time - wave.start < this.waveLife + 1);

        this.trackPointer(time);
        this.pairs = this.pairs.filter((pair) => {
            const age = time - pair.start;
            const alive = age < this.pairLife;
            pair.strength = alive ? Math.min(1, age / 0.4) * Math.min(1, (this.pairLife - age) / 1.5) : 0;
            pair.a.pair = alive ? { partner: pair.b, lead: true, strength: pair.strength } : null;
            pair.b.pair = alive ? { partner: pair.a, lead: false, strength: pair.strength } : null;
            return alive;
        });

        this.clicks = this.clicks.filter((click) => time - click.start < 5);
    }

    // ---- the qubits' states ----

    // Free precession around the drive's angle, bent by any phase waves
    baseVector(sphere, time, waves) {
        // Each qubit keeps its own offset from the drive and its own wobble
        let theta = this.driveAt(time) + (sphere.theta - Math.PI / 2) * 0.5
            + sphere.wobble * 0.5 * Math.sin(time * 0.6 * this.pace + sphere.wobblePhase);
        let phi = time * sphere.speed * this.pace + sphere.phase;

        // Waves add as complex amplitudes, so where two cross they reinforce or cancel
        let re = 0;
        let im = 0;
        for (const wave of waves) {
            const age = time - wave.start;
            if (age <= 0 || age > this.waveLife) continue;
            const distance = Math.hypot(sphere.x - wave.x, sphere.y - wave.y);
            const behind = age * this.waveSpeed - distance;
            if (behind < 0) continue;
            const envelope = Math.min(1, behind / 60) * (1 - age / this.waveLife) ** 1.5 * Math.exp(-distance / 700);
            const phase = (behind / this.waveLength) * Math.PI * 2;
            re += envelope * Math.cos(phase);
            im += envelope * Math.sin(phase);
        }
        const amplitude = Math.min(1, Math.hypot(re, im));
        if (amplitude > 0.01) {
            const d = Math.atan2(im, re) - phi;
            phi += Math.atan2(Math.sin(d), Math.cos(d)) * amplitude * 0.9;
            theta += (Math.PI / 2 - theta) * amplitude * 0.5;
        }

        return { v: [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)] };
    }

    // One qubit on its own, including measurements and the cursor's pull
    rawVector(sphere, time, scene, pull) {
        let v = this.baseVector(sphere, time, scene.waves).v;
        // Every so often the state decoheres and shrinks inside the sphere, and more so when idle
        let length = (1 - 0.5 * Math.max(0, Math.sin(time * 0.23 * this.pace + sphere.decoherePhase)) ** 8) * this.coherence;
        let flash = 0;
        let measured = 0;
        let bit = 0;

        for (const m of scene.measurements) {
            const distance = Math.hypot(sphere.x - m.x, sphere.y - m.y);
            if (distance > m.reach) continue;
            const at = m.start + distance / this.measureSpeed;
            const age = time - at;
            if (age < 0 || age > this.measureLife) continue;
            // Falls to a pole, stays collapsed there, then relaxes back into its precession
            const k = age < this.collapseSeconds
                ? BlochBackdrop.smooth(age / this.collapseSeconds)
                : 1 - BlochBackdrop.smooth((age - this.collapsedSeconds) / (this.measureLife - this.collapsedSeconds));
            if (k <= measured) continue;
            measured = k;
            bit = this.outcome(m, sphere, at, scene.waves);
            flash = Math.max(0, 1 - age / 0.8);
        }
        if (measured > 0) {
            v = v.map((c, n) => c + ((n === 2 ? bit : 0) - c) * measured);
            length += (1 - length) * measured;
        }

        // The cursor is usually right where the click was, so a collapsed qubit ignores its pull
        const tug = pull.strength * (1 - measured);
        if (tug > 0.01) {
            v = v.map((c, n) => c + (pull.direction[n] - c) * tug);
        }

        const norm = Math.hypot(v[0], v[1], v[2]) || 1;
        return { v: v.map((c) => (c / norm) * length), length, flash, measured, bit };
    }

    // An entangled qubit mirrors its partner, and follows it into whatever it's measured as
    vectorAt(sphere, time, scene, pull) {
        const own = this.rawVector(sphere, time, scene, pull);
        const pair = sphere.pair;
        if (!pair) return own;
        const other = this.rawVector(pair.partner, time, scene, { strength: 0 });
        const follows = other.measured > own.measured || (other.measured === own.measured && !pair.lead);
        if (!follows) return own;
        const e = pair.strength;
        const mirror = [other.v[0], -other.v[1], other.v[2]];
        const length = own.length + (other.length - own.length) * e;
        const v = own.v.map((c, n) => c + (mirror[n] - c) * e);
        const norm = Math.hypot(v[0], v[1], v[2]) || 1;
        return {
            v: v.map((c) => (c / norm) * length),
            length,
            flash: Math.max(own.flash, other.flash * e),
            measured: Math.max(own.measured, other.measured * e),
            bit: other.measured * e > own.measured ? other.bit : own.bit
        };
    }

    // ---- drawing ----

    // Orthographic camera looking slightly down on the spheres, as QubitBoard draws them
    camera() {
        return { cy: Math.cos(-0.34), sy: Math.sin(-0.34), cp: Math.cos(0.34), sp: Math.sin(0.34) };
    }

    // Screen x, screen y (down) and depth (towards the viewer) of a unit vector
    static view(cam, v) {
        const x = v[0] * cam.cy - v[1] * cam.sy;
        const y = v[0] * cam.sy + v[1] * cam.cy;
        return [y, x * cam.sp - v[2] * cam.cp, x * cam.cp + v[2] * cam.sp];
    }

    project(sphere, r, v) {
        const [x, y] = BlochBackdrop.view(this.cam, v);
        return [sphere.x + r * x, sphere.y + r * y];
    }

    renderNow() {
        this.render(Date.now() / 1000, !this.reduceMotion.matches);
    }

    frame(now) {
        this.raf = null;
        if (this.reduceMotion.matches) {
            document.documentElement.style.removeProperty('--accent');
            this.render(Date.now() / 1000, false);
            return;
        }
        // Cap at ~30fps; this keeps it light on battery
        if (!this.lastFrame || now - this.lastFrame > 32) {
            this.lastFrame = now;
            const p = this.pointer;
            p.x += (p.tx - p.x) * 0.25;
            p.y += (p.ty - p.y) * 0.25;
            p.presence += (p.target - p.presence) * 0.08;
            const time = Date.now() / 1000;
            this.updateInteractions(now, time);
            this.render(time, true);
            const publish = now - this.lastAccent > 200;
            if (publish) this.lastAccent = now;
            this.updateAccent(this.votes, publish);
        }
        this.raf = requestAnimationFrame((t) => this.frame(t));
    }

    render(time, animated) {
        const ctx = this.ctx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // The small spheres share one camera, so their wireframe is projected once per frame
        this.cam = this.camera();
        const ring = (point) => Array.from({ length: 32 }, (_, n) => BlochBackdrop.view(this.cam, point((n / 32) * Math.PI * 2)));
        this.wire = {
            equator: ring((t) => [Math.cos(t), Math.sin(t), 0]),
            meridian: ring((t) => [Math.cos(t), 0, Math.sin(t)]),
            axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((axis) => BlochBackdrop.view(this.cam, axis))
        };
        const scene = animated
            ? { measurements: this.measurements(time), waves: this.waves }
            : { measurements: [], waves: [] };

        // Measurement fronts
        ctx.strokeStyle = this.guide;
        ctx.lineWidth = 1.5;
        for (const m of scene.measurements) {
            const age = time - m.start;
            const span = m.reach / this.measureSpeed + 0.4;
            if (age < 0 || age > span) continue;
            ctx.globalAlpha = 0.5 * (1 - age / span);
            ctx.beginPath();
            ctx.arc(m.x, m.y, Math.min(m.reach, age * this.measureSpeed), 0, Math.PI * 2);
            ctx.stroke();
        }

        // Entanglement links, a dashed arc drifting between the pair
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 5]);
        ctx.lineDashOffset = -time * 20;
        for (const { a, b, strength } of this.pairs) {
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            const mx = (a.x + b.x) / 2 + ((a.y - b.y) / length) * length * 0.25;
            const my = (a.y + b.y) / 2 + ((b.x - a.x) / length) * length * 0.25;
            ctx.globalAlpha = 0.7 * strength;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(mx, my, b.x, b.y);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        const p = this.pointer;
        // Each qubit votes for its colour, weighted by how pure its state is
        const votes = [0, 0, 0];
        for (const sphere of this.spheres) {
            let pull = { strength: 0, direction: [0, 0, 1] };
            if (animated && p.presence > 0.01) {
                const dx = p.x - sphere.x;
                const dy = p.y - sphere.y;
                const distance = Math.hypot(dx, dy);
                const strength = p.presence * Math.exp(-((distance / 170) ** 2)) * 0.9;
                if (distance > 1) {
                    const d = [0.25, dx / distance, -dy / distance];
                    const n = Math.hypot(d[0], d[1], d[2]);
                    pull = { strength, direction: d.map((c) => c / n) };
                }
            }
            this.drawSphere(ctx, sphere, time, scene, pull, animated, votes);
        }
        this.votes = votes;
        ctx.globalAlpha = 1;
    }

    drawSphere(ctx, sphere, time, scene, pull, animated, votes) {
        const state = this.vectorAt(sphere, time, scene, pull);
        const shares = BlochBackdrop.shares(state.v[2] / (state.length || 1));
        const color = this.colorOf(shares, state.length);
        votes[shares.indexOf(Math.max(...shares))] += state.length;
        const glow = Math.max(state.flash, pull.strength) * 0.4;
        const r = this.radius * (1 + pull.strength * 0.25 + state.flash * 0.12);
        const { x, y } = sphere;

        // Guide lines, as in QubitBoard's Bloch display, kept monochrome
        ctx.globalAlpha = 0.45 + glow;
        ctx.strokeStyle = this.guide;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        for (const curve of [this.wire.equator, this.wire.meridian]) {
            ctx.moveTo(x + curve[0][0] * r, y + curve[0][1] * r);
            for (const point of curve) ctx.lineTo(x + point[0] * r, y + point[1] * r);
            ctx.closePath();
        }
        for (const [ax, ay] of this.wire.axes) {
            ctx.moveTo(x - ax * r, y - ay * r);
            ctx.lineTo(x + ax * r, y + ay * r);
        }
        ctx.stroke();

        // Short trail behind the moving point, in the point's colour
        if (animated) {
            let previous = this.project(sphere, r, state.v);
            ctx.lineWidth = 2;
            ctx.strokeStyle = color;
            for (let k = 1; k <= this.trailSteps; k++) {
                const past = this.vectorAt(sphere, time - k * this.trailGap, scene, pull);
                const point = this.project(sphere, r, past.v);
                ctx.globalAlpha = (1 - k / (this.trailSteps + 1)) * 0.6;
                ctx.beginPath();
                ctx.moveTo(previous[0], previous[1]);
                ctx.lineTo(point[0], point[1]);
                ctx.stroke();
                previous = point;
            }
        }

        // State arrow and the coloured moving point; the point shrinks as the state becomes mixed
        const [tipX, tipY] = this.project(sphere, r, state.v);
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = this.ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        const dot = 3.6 * (0.55 + 0.45 * state.length) * (1 + pull.strength * 0.4);
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(tipX, tipY, dot, 0, Math.PI * 2);
        ctx.fill();

        // The measured result, briefly, beside the sphere
        if (state.measured > 0.05) {
            ctx.globalAlpha = state.measured * 0.9;
            ctx.fillStyle = this.ink;
            ctx.fillText(state.bit > 0 ? '0' : '1', x + r + 7, y - r + 2);
        }
    }
}

new BlochBackdrop();

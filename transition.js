// Page transitions: the page's text breaks into glowing bits (0s and 1s) in the backdrop's colour,
// the bits are handed to the next page through sessionStorage, and they fly in to reassemble its text.
// Loaded in <head> without defer, so an arriving page can hide its content before the first paint.
class PageTransition {
    constructor() {
        this.storeKey = 'tx-handoff';
        this.cell = 10;  // px per bit when sampling glyph shapes
        this.glitchColors = ['rgb(63, 185, 80)', 'rgb(88, 166, 255)'];  // GitHub green and blue
        this.scramble = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789#$%&*+=<>/';
        this.cellCache = new Map();
        this.metricsCache = new Map();
        this.state = null;

        // The visitor's Effects button (script.js) turns the backdrop and these transitions off.
        // This script runs first, so it marks <html> before the first paint for both of them.
        let effects = 'on';
        try {
            effects = localStorage.getItem('effects') === 'off' ? 'off' : 'on';
        } catch (error) {
            // Storage blocked: effects stay on
        }
        document.documentElement.setAttribute('data-effects', effects);

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        this.handoff = this.takeHandoff();
        if (this.enabled()) {
            document.documentElement.classList.add('tx-entering');
            document.addEventListener('DOMContentLoaded', () => this.arrive());
        }
        document.addEventListener('content-ready', () => { this.contentReady = true; });
        document.addEventListener('click', (event) => this.onClick(event));
        window.addEventListener('pageshow', (event) => {
            if (event.persisted) this.finish();
        });
        // A theme switch mid-flight would leave the canvas letters in the old colours, so just show the page.
        // Turning effects off does the same, unless the page is already dissolving towards the next one.
        new MutationObserver((records) => {
            for (const record of records) {
                if (record.oldValue === document.documentElement.getAttribute(record.attributeName) || !this.state) continue;
                const modes = record.attributeName === 'data-effects' ? ['hold', 'assemble'] : ['assemble'];
                if (modes.includes(this.state.mode)) this.finish();
            }
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-effects'], attributeOldValue: true });
    }

    enabled() {
        return document.documentElement.getAttribute('data-effects') !== 'off';
    }

    takeHandoff() {
        try {
            const data = JSON.parse(sessionStorage.getItem(this.storeKey));
            sessionStorage.removeItem(this.storeKey);
            if (data && Date.now() - data.at < 4000) return data;
        } catch (error) {
            // Storage unavailable: the page just plays its intro
        }
        return null;
    }

    // ---- shared helpers ----

    static hash(n) {
        let h = Math.imul(n ^ (n >>> 15), 739982445);
        h = Math.imul(h ^ (h >>> 12), 695872825);
        return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    }

    static clamp(u) {
        return u < 0 ? 0 : u > 1 ? 1 : u;
    }

    static easeInOut(u) {
        return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
    }

    roots() {
        return [...document.body.children].filter((el) => !el.matches('script, noscript, .bloch-backdrop, .tx-canvas'));
    }

    // Horizontal centre of the text column, which every page centres the same way
    centre() {
        const r = document.body.getBoundingClientRect();
        return r.left + r.width / 2;
    }

    accent() {
        return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5eead4';
    }

    metrics(font) {
        let m = this.metricsCache.get(font);
        if (!m) {
            this.ctx.font = font;
            const box = this.ctx.measureText('Hg');
            m = { ascent: box.fontBoundingBoxAscent, height: box.fontBoundingBoxAscent + box.fontBoundingBoxDescent };
            this.metricsCache.set(font, m);
        }
        return m;
    }

    // Every visible character on screen, with its font, colour and baseline position
    collectGlyphs() {
        const width = document.documentElement.clientWidth;
        const height = window.innerHeight;
        const visible = (r) => r.width > 0 && r.bottom > 0 && r.top < height && r.right > 0 && r.left < width;
        const range = document.createRange();
        const styles = new Map();
        const clips = new Map();
        const glyphs = [];
        let word = 0;

        // The box a scrolling or clipping ancestor (such as a wide <pre>) lets through, or null if nothing clips
        const clipFor = (el) => {
            if (!el || el === document.body || el === document.documentElement) return null;
            if (clips.has(el)) return clips.get(el);
            let clip = clipFor(el.parentElement);
            const s = getComputedStyle(el);
            if ((s.overflowX !== 'visible' || s.overflowY !== 'visible') && s.display !== 'inline') {
                const r = el.getBoundingClientRect();
                const left = r.left + el.clientLeft;
                const top = r.top + el.clientTop;
                const own = { left, top, right: left + el.clientWidth, bottom: top + el.clientHeight };
                clip = clip ? {
                    left: Math.max(clip.left, own.left), top: Math.max(clip.top, own.top),
                    right: Math.min(clip.right, own.right), bottom: Math.min(clip.bottom, own.bottom)
                } : own;
            }
            clips.set(el, clip);
            return clip;
        };
        const inside = (r, clip) => !clip || (r.left + r.width / 2 >= clip.left && r.left + r.width / 2 <= clip.right
            && r.top + r.height / 2 >= clip.top && r.top + r.height / 2 <= clip.bottom);

        for (const root of this.roots()) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                if (!node.data.trim()) continue;
                range.selectNodeContents(node);
                if (!visible(range.getBoundingClientRect())) continue;
                const parent = node.parentElement;
                const clip = clipFor(parent);
                if (!styles.has(parent)) {
                    const s = getComputedStyle(parent);
                    styles.set(parent, s.visibility !== 'visible' ? null : {
                        font: `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`,
                        color: s.color,
                        upper: s.textTransform === 'uppercase'
                    });
                }
                const style = styles.get(parent);
                if (!style) continue;
                const m = this.metrics(style.font);

                let index = 0;
                for (const ch of node.data) {
                    const start = index;
                    index += ch.length;
                    if (!ch.trim()) {
                        word++;
                        continue;
                    }
                    range.setStart(node, start);
                    range.setEnd(node, index);
                    const r = range.getBoundingClientRect();
                    if (!visible(r) || !inside(r, clip)) continue;
                    glyphs.push({
                        ch: style.upper ? ch.toUpperCase() : ch,
                        font: style.font,
                        color: style.color,
                        x: r.left,
                        y: r.top + (r.height - m.height) / 2 + m.ascent,
                        top: r.top,
                        height: r.height,
                        word,
                        at: Infinity
                    });
                }
                word++;
            }
        }
        return glyphs;
    }

    // Where a glyph's ink sits, as bit positions relative to its baseline origin
    cellsFor(glyph) {
        const key = `${glyph.font}\n${glyph.ch}`;
        let cells = this.cellCache.get(key);
        if (cells) return cells;

        const m = this.metrics(glyph.font);
        const sample = this.sampleCtx;
        sample.font = glyph.font;
        const w = Math.ceil(sample.measureText(glyph.ch).width) + 4;
        const h = Math.ceil(m.height) + 4;
        if (sample.canvas.width < w || sample.canvas.height < h) {
            sample.canvas.width = Math.max(w, sample.canvas.width);
            sample.canvas.height = Math.max(h, sample.canvas.height);
            sample.font = glyph.font;
        }
        sample.clearRect(0, 0, w, h);
        sample.fillText(glyph.ch, 2, 2 + m.ascent);
        const data = sample.getImageData(0, 0, w, h).data;

        const cols = Math.max(1, Math.round(w / this.cell));
        const rows = Math.max(1, Math.round(h / this.cell));
        const weight = new Float64Array(cols * rows);
        const sumX = new Float64Array(cols * rows);
        const sumY = new Float64Array(cols * rows);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const a = data[(y * w + x) * 4 + 3];
                if (!a) continue;
                const c = Math.min(cols - 1, Math.floor((x / w) * cols)) + Math.min(rows - 1, Math.floor((y / h) * rows)) * cols;
                weight[c] += a;
                sumX[c] += a * x;
                sumY[c] += a * y;
            }
        }
        const max = Math.max(...weight);
        cells = [];
        weight.forEach((a, c) => {
            if (max > 0 && a >= max * 0.25) cells.push([sumX[c] / a - 2, sumY[c] / a - 2 - m.ascent]);
        });
        if (!cells.length) cells.push([w / 2 - 2, m.height / 2 - m.ascent]);
        this.cellCache.set(key, cells);
        return cells;
    }

    // Glowing 0 and 1 sprites in the accent colour; "hot" ones get a bright core
    makeSprites(accent) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const fontSize = 11 * dpr;
        const size = Math.ceil(fontSize * 2.4);
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        const draw = (ch, hot) => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.font = `600 ${fontSize}px ui-monospace, Consolas, Menlo, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = ctx.shadowColor = accent;
            ctx.shadowBlur = fontSize * (hot ? 0.9 : 0.6);
            ctx.globalAlpha = 0.6;
            ctx.fillText(ch, size / 2, size / 2);
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            ctx.fillText(ch, size / 2, size / 2);
            if (hot && dark) {
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = 0.6;
                ctx.fillText(ch, size / 2, size / 2);
            }
            return canvas;
        };
        return { dim: [draw('0', false), draw('1', false)], hot: [draw('0', true), draw('1', true)], size: size / dpr };
    }

    createCanvas() {
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'tx-canvas';
            this.canvas.setAttribute('aria-hidden', 'true');
            this.ctx = this.canvas.getContext('2d');
            this.sampleCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        }
        // Kept outside <body>, which the post page rebuilds
        document.documentElement.append(this.canvas);
        // Size to the canvas's own box: the root's clientWidth ignores a reserved scrollbar gutter
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.width = this.canvas.clientWidth || document.documentElement.clientWidth;
        this.height = this.canvas.clientHeight || window.innerHeight;
        this.canvas.width = Math.round(this.width * dpr);
        this.canvas.height = Math.round(this.height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.metricsCache.clear();
    }

    newBit(x, y, extra) {
        const seed = Math.floor(Math.random() * 1e9);
        const r = PageTransition.hash(seed);
        return { x0: x, y0: y, seed, hot: r < 0.07, bright: r < 0.07 ? 1 : r < 0.32 ? 0.75 : 0.42, ...extra };
    }

    drawBit(bit, x, y, scale, alpha, moving) {
        if (alpha <= 0.01) return;
        const sprites = this.state.sprites;
        const flicker = PageTransition.hash(bit.seed + Math.floor(this.now / (moving ? 66 : 125))) < 0.5 ? 0 : 1;
        const size = sprites.size * scale;
        this.ctx.globalAlpha = Math.min(1, alpha);
        this.ctx.drawImage((bit.hot ? sprites.hot : sprites.dim)[flicker], x - size / 2, y - size / 2, size, size);
    }

    // A character with chromatic split and a few horizontally torn slices
    drawGlitched(glyph, ch, x, color, alpha, amount) {
        const ctx = this.ctx;
        ctx.font = glyph.font;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * 0.45 * amount;
        ctx.fillStyle = this.glitchColors[0];
        ctx.fillText(ch, x - 2.5 * amount, glyph.y);
        ctx.fillStyle = this.glitchColors[1];
        ctx.fillText(ch, x + 2.5 * amount, glyph.y);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fillText(ch, x, glyph.y);
        const frame = Math.floor(this.now / 33);
        for (let band = Math.floor(glyph.top / 6); band * 6 < glyph.top + glyph.height; band++) {
            const r = PageTransition.hash(band * 7919 + frame * 104729 + this.state.seed);
            if (r > 0.3) continue;
            const shift = (PageTransition.hash(band + frame) - 0.5) * 14 * amount;
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, band * 6, this.width, 6);
            ctx.clip();
            ctx.clearRect(x - 2, band * 6, this.ctx.measureText(ch).width + 4, 6);
            ctx.fillText(ch, x + shift, glyph.y);
            ctx.restore();
        }
    }

    // ---- leaving a page ----

    onClick(event) {
        if (!this.enabled()) return;
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest('a[href]');
        if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
        const url = new URL(link.href, location.href);
        if (url.protocol !== location.protocol || url.origin !== location.origin) return;
        if (!/(\.html|\/)$/.test(url.pathname)) return;
        if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
        event.preventDefault();
        // Already dissolving towards a page: a second click (or a double click) must not restart it
        if (this.state && this.state.mode === 'leave') return;
        try {
            this.leave(link, url.href);
        } catch (error) {
            this.finish();
            location.href = url.href;
        }
    }

    leave(link, href) {
        this.finish();
        this.createCanvas();
        const glyphs = this.collectGlyphs();
        const start = performance.now();
        const accent = this.accent();
        this.state = { mode: 'leave', glyphs, bits: [], sprites: this.makeSprites(accent), accent, seed: Math.floor(Math.random() * 1e9) };

        // Dissolve spreads outward from the link that was clicked
        const box = link.getBoundingClientRect();
        const ox = box.left + box.width / 2;
        const oy = box.top + box.height / 2;
        const far = Math.max(1, ...glyphs.map((g) => Math.hypot(g.x - ox, g.top - oy)));
        for (const g of glyphs) {
            g.at = start + 120 + (Math.hypot(g.x - ox, g.top - oy) / far) * 240 + PageTransition.hash(g.word + this.state.seed) * 40;
            for (const [dx, dy] of this.cellsFor(g)) this.state.bits.push(this.newBit(g.x + dx, g.y + dy, { glyph: g }));
        }
        this.state.done = Math.max(start + 400, ...glyphs.map((g) => g.at + 120));

        document.documentElement.classList.add('tx-text-off');
        this.fades = this.roots().map((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 380, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards'
        }));

        const tick = (now) => {
            if (!this.state || this.state.mode !== 'leave') return;
            try {
                this.renderLeave(now);
            } catch (error) {
                this.finish();
                location.href = href;
                return;
            }
            if (now >= this.state.done && !this.state.navigating) {
                this.state.navigating = true;
                this.saveHandoff(now);
                location.href = href;
                // If the navigation never happens (Stop, Esc, a response that isn't a page), bring this page back
                this.watchdog = setTimeout(() => {
                    try {
                        sessionStorage.removeItem(this.storeKey);
                    } catch (error) {
                        // Nothing to clear without storage
                    }
                    this.finish(true);
                }, 4000);
            }
            this.raf = requestAnimationFrame(tick);
        };
        this.raf = requestAnimationFrame(tick);
    }

    renderLeave(now) {
        this.now = now;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);
        ctx.globalCompositeOperation = 'source-over';
        for (const g of this.state.glyphs) {
            const gone = PageTransition.clamp((now - g.at) / 110);
            if (gone >= 1) continue;
            const glitch = now < g.at - 130 ? 0 : now < g.at ? Math.sin((Math.PI * (now - g.at + 130)) / 130) : 1 - gone;
            if (glitch > 0) {
                this.drawGlitched(g, g.ch, g.x, gone > 0 ? this.state.accent : g.color, 1 - gone, glitch);
            } else {
                ctx.font = g.font;
                ctx.globalAlpha = 1;
                ctx.fillStyle = g.color;
                ctx.fillText(g.ch, g.x, g.y);
            }
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const bit of this.state.bits) {
            const shown = PageTransition.clamp((now - bit.glyph.at) / 110);
            if (shown <= 0) continue;
            const bob = Math.sin(now / 520 + (bit.seed % 628) / 100);
            this.drawBit(bit, bit.x0, bit.y0 + bob, 1 + 0.6 * (1 - shown), bit.bright * shown, false);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

    saveHandoff(now) {
        const bits = [];
        for (const bit of this.state.bits) {
            bits.push(Math.round(bit.x0), Math.round(bit.y0 + Math.sin(now / 520 + (bit.seed % 628) / 100)), bit.hot ? 1 : 0);
        }
        try {
            sessionStorage.setItem(this.storeKey, JSON.stringify({ at: Date.now(), width: this.width, centre: this.centre(), bits }));
        } catch (error) {
            // Too big or storage blocked: the next page plays its intro instead
        }
    }

    // ---- arriving on a page ----

    async arrive() {
        try {
            if (!this.ctx) this.createCanvas();
            const handoff = this.handoff;
            const accent = this.accent();
            this.state = { mode: 'hold', bits: [], sprites: this.makeSprites(accent), accent, seed: Math.floor(Math.random() * 1e9) };

            // Keep the previous page's bits hovering while this page settles. The text column is centred,
            // so if it sits differently here (a scrollbar came or went) the bits shift by the same amount.
            // With scrollbar-gutter: stable in styles.css that is normally zero.
            const centre = this.centre();
            if (handoff) {
                const shift = typeof handoff.centre === 'number' ? centre - handoff.centre : (this.width - handoff.width) / 2;
                for (let i = 0; i + 2 < handoff.bits.length; i += 3) {
                    const bit = this.newBit(handoff.bits[i] + shift, handoff.bits[i + 1], {});
                    bit.hot = handoff.bits[i + 2] === 1;
                    this.state.bits.push(bit);
                }
            }
            const hold = (now) => {
                if (!this.state || this.state.mode !== 'hold') return;
                try {
                    this.renderHold(now);
                } catch (error) {
                    this.finish();
                    return;
                }
                this.raf = requestAnimationFrame(hold);
            };
            hold(performance.now());

            // Wait for fonts and for script.js to finish adding posts (it fires content-ready), up to a limit.
            // The limit stays clear of the 3s CSS failsafe, which counts from roughly the start of navigation.
            await document.fonts.ready;
            const giveUpAt = Math.min(performance.now() + 1500, 2400);
            while (!this.contentReady && performance.now() < giveUpAt) {
                await new Promise((resolve) => setTimeout(resolve, 30));
            }
            await new Promise((resolve) => requestAnimationFrame(resolve));
            if (!this.state || this.state.mode !== 'hold') return;
            // Too late to fly in before the failsafe reveals the page: just show it
            if (performance.now() > 2700) {
                this.finish(performance.now() < 3000);
                return;
            }

            // Content added since DOMContentLoaded can change the viewport (a scrollbar appearing):
            // re-fit the canvas, and move the hovering bits with the text column
            const drift = this.centre() - centre;
            if (drift) for (const bit of this.state.bits) bit.x0 += drift;
            const refit = this.canvas.clientWidth !== this.width || this.canvas.clientHeight !== this.height;
            if (refit) this.createCanvas();
            if (drift || refit) this.renderHold(performance.now());
            this.assemble(this.collectGlyphs());
        } catch (error) {
            this.finish();
        }
    }

    renderHold(now) {
        this.now = now;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);
        ctx.globalCompositeOperation = 'lighter';
        for (const bit of this.state.bits) {
            const bob = Math.sin(now / 520 + (bit.seed % 628) / 100);
            this.drawBit(bit, bit.x0, bit.y0 + bob, 1, bit.bright, false);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

    assemble(glyphs) {
        const now = performance.now();
        const state = this.state;
        state.mode = 'assemble';
        state.glyphs = glyphs;
        state.start = now;
        state.bend = Math.random() < 0.5 ? 1 : -1;

        const targets = [];
        for (const g of glyphs) {
            for (const [dx, dy] of this.cellsFor(g)) targets.push({ glyph: g, x: g.x + dx, y: g.y + dy });
        }
        // Pair old bits with new positions in reading order, so the flow sweeps rather than tangles.
        // Every bit lands somewhere: a busier old page funnels several bits into one letter,
        // a busier new page gets extra bits cloned from the nearest old ones.
        const order = (a, b) => Math.round(a.y / 24) - Math.round(b.y / 24) || a.x - b.x;
        const sources = state.bits.map((bit) => ({ bit, x: bit.x0, y: bit.y0 })).sort(order);
        targets.sort(order);
        const pickFor = (list, i, n) => list[Math.min(list.length - 1, Math.floor(((i + 0.5) * list.length) / n))];
        let flying;
        if (!targets.length) {
            flying = [];
        } else if (!sources.length) {
            // No previous page: bits flicker into being right where their letters will be
            flying = targets.map((target) => {
                const bit = this.newBit(target.x + (Math.random() - 0.5) * 16, target.y + (Math.random() - 0.5) * 16, { clone: true });
                bit.target = target;
                return bit;
            });
        } else if (sources.length >= targets.length) {
            flying = sources.map((source, i) => {
                source.bit.target = pickFor(targets, i, sources.length);
                return source.bit;
            });
        } else {
            const used = new Set();
            flying = targets.map((target, i) => {
                const pick = pickFor(sources, i, targets.length);
                const bit = used.has(pick.bit) ? this.newBit(pick.x, pick.y, { clone: true }) : pick.bit;
                used.add(pick.bit);
                bit.target = target;
                return bit;
            });
        }

        for (const g of glyphs) g.at = 0;
        const wordStats = new Map();
        for (const bit of flying) {
            const s = wordStats.get(bit.target.glyph.word) ?? { dist: 0, n: 0 };
            s.dist += Math.hypot(bit.target.x - bit.x0, bit.target.y - bit.y0);
            s.n++;
            wordStats.set(bit.target.glyph.word, s);
        }
        for (const bit of flying) {
            const g = bit.target.glyph;
            const stats = wordStats.get(g.word);
            const r = PageTransition.hash(g.word + state.seed);
            const jitter = bit.hot ? 0 : PageTransition.hash(bit.seed);
            bit.departAt = now + 20 + PageTransition.clamp(g.top / this.height) * 160 + r * 40 + jitter * 30;
            bit.dur = 320 + Math.min(stats.dist / stats.n, 800) * 0.24 + PageTransition.hash(g.word * 3 + state.seed) * 60;
            const bend = state.bend * (0.08 + r * 0.12) + (PageTransition.hash(bit.seed * 7) - 0.5) * 0.04;
            const dx = bit.target.x - bit.x0;
            const dy = bit.target.y - bit.y0;
            bit.cx = (bit.x0 + bit.target.x) / 2 - dy * bend;
            bit.cy = (bit.y0 + bit.target.y) / 2 + dx * bend;
            g.at = Math.max(g.at, bit.departAt + bit.dur);
        }
        for (const g of glyphs) if (!g.at) g.at = now + 200;
        state.bits = flying;
        state.end = Math.max(now + 600, ...glyphs.map((g) => g.at + 240));

        // Swap the hidden page for transparent text: borders and backgrounds fade in, letters come from the canvas
        document.documentElement.classList.add('tx-text-off');
        document.documentElement.classList.remove('tx-entering');
        this.fades = this.roots().map((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], {
            delay: 60, duration: 500, easing: 'cubic-bezier(.2, .6, .3, 1)', fill: 'backwards'
        }));
        this.stopOnScroll = () => this.finish();
        window.addEventListener('scroll', this.stopOnScroll, { passive: true, once: true });
        window.addEventListener('resize', this.stopOnScroll, { once: true });

        const tick = (time) => {
            if (!this.state || this.state.mode !== 'assemble') return;
            if (time >= state.end) {
                this.finish();
                return;
            }
            try {
                this.renderAssemble(time);
            } catch (error) {
                this.finish();
                return;
            }
            this.raf = requestAnimationFrame(tick);
        };
        this.raf = requestAnimationFrame(tick);
    }

    renderAssemble(now) {
        this.now = now;
        const state = this.state;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        // Bits in flight, with faint trails
        ctx.globalCompositeOperation = 'lighter';
        const trails = [new Path2D(), new Path2D(), new Path2D()];
        for (const bit of state.bits) {
            const bob = Math.sin(now / 520 + (bit.seed % 628) / 100);
            if (now < bit.departAt) {
                if (!bit.clone) this.drawBit(bit, bit.x0, bit.y0 + bob, 1, bit.bright, false);
                continue;
            }
            const d = PageTransition.clamp((now - bit.departAt) / bit.dur);
            const landed = PageTransition.clamp((now - bit.target.glyph.at) / 92);
            if (landed >= 1) continue;
            const at = (u) => {
                const e = PageTransition.easeInOut(PageTransition.clamp(u));
                const k = 1 - e;
                return [
                    k * k * bit.x0 + 2 * k * e * bit.cx + e * e * bit.target.x,
                    k * k * (bit.y0 + bob) + 2 * k * e * bit.cy + e * e * bit.target.y
                ];
            };
            const [x, y] = at(d);
            let alpha = bit.bright * (bit.clone ? PageTransition.clamp(d / 0.3) : 1);
            if (d < 1) {
                alpha *= 0.75 + 0.6 * Math.sin(Math.PI * d);
                let [px, py] = at(d - 0.15);
                for (let s = 0; s < 3; s++) {
                    const [nx, ny] = s === 2 ? [x, y] : at(d - 0.1 + s * 0.05);
                    trails[s].moveTo(px, py);
                    trails[s].lineTo(nx, ny);
                    [px, py] = [nx, ny];
                }
            }
            this.drawBit(bit, x, y, 1 + 0.6 * landed, alpha * (1 - landed), d < 1);
        }
        ctx.strokeStyle = state.accent;
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        trails.forEach((path, s) => {
            ctx.globalAlpha = [0.05, 0.11, 0.2][s];
            ctx.stroke(path);
        });

        // Letters lock in: scrambled and glitching in the accent colour, then settling to their own colour
        ctx.globalCompositeOperation = 'source-over';
        for (const g of state.glyphs) {
            if (now < g.at) continue;
            const l = PageTransition.clamp((now - g.at) / 230);
            ctx.font = g.font;
            if (l >= 1) {
                ctx.globalAlpha = 1;
                ctx.fillStyle = g.color;
                ctx.fillText(g.ch, g.x, g.y);
            } else if (l < 0.45) {
                const r = PageTransition.hash(Math.round(g.x * 7 + g.y * 13) + state.seed);
                const ch = r < 0.33 && l < 0.3
                    ? this.scramble[Math.floor(PageTransition.hash(Math.floor(r * 1e6) + Math.floor(now / 45)) * this.scramble.length)]
                    : g.ch;
                const alpha = PageTransition.clamp(l / 0.12);
                if (l < 0.3) {
                    this.drawGlitched(g, ch, g.x, state.accent, alpha, 0.6 * (1 - l / 0.3));
                } else {
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = state.accent;
                    ctx.fillText(ch, g.x, g.y);
                }
            } else {
                const mix = (l - 0.45) / 0.55;
                ctx.globalAlpha = 1 - mix;
                ctx.fillStyle = state.accent;
                ctx.fillText(g.ch, g.x, g.y);
                ctx.globalAlpha = mix;
                ctx.fillStyle = g.color;
                ctx.fillText(g.ch, g.x, g.y);
            }
        }

        // A soft scanline band sweeps down the screen as the page arrives
        const sweep = (now - state.start) / 560;
        if (sweep >= 0 && sweep < 1) {
            const centre = (-0.15 + 1.3 * sweep) * this.height;
            const band = 70;
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = state.accent;
            for (let y = Math.floor((centre - band) / 3) * 3; y < centre + band; y += 3) {
                const u = (y - centre) / (band / 2);
                const k = Math.exp(-u * u) * Math.sin(Math.PI * sweep);
                ctx.globalAlpha = 0.025 * k;
                ctx.fillRect(0, y, this.width, 3);
                ctx.globalAlpha = 0.07 * k;
                ctx.fillRect(0, y, this.width, 1);
            }
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

    // Put the real page back and remove the overlay; with fade, the page fades in as the canvas fades out
    finish(fade = false) {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = null;
        this.state = null;
        clearTimeout(this.watchdog);
        for (const anim of this.fades || []) anim.cancel();
        this.fades = null;
        if (this.canvasFade) this.canvasFade.cancel();
        this.canvasFade = null;
        if (this.stopOnScroll) {
            window.removeEventListener('scroll', this.stopOnScroll);
            window.removeEventListener('resize', this.stopOnScroll);
            this.stopOnScroll = null;
        }
        document.documentElement.classList.remove('tx-entering', 'tx-text-off');
        if (!this.canvas) return;
        if (fade && this.canvas.isConnected) {
            const timing = { duration: 220, easing: 'ease-out' };
            this.fades = this.roots().map((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], timing));
            this.canvasFade = this.canvas.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, fill: 'forwards' });
            this.canvasFade.onfinish = () => {
                this.canvasFade.cancel();
                this.canvasFade = null;
                this.canvas.remove();
            };
            return;
        }
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.canvas.remove();
    }
}

new PageTransition();

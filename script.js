// Theme manager
class ThemeManager {
    constructor() {
        this.theme = localStorage.getItem('theme') || 'light';
        this.init();
    }
    
    init() {
        this.applyTheme();
        this.bindToggle();
    }

    bindToggle() {
        const themeToggle = document.getElementById('theme-toggle');
        if (!themeToggle) return;

        themeToggle.onchange = () => this.toggleTheme();
    }
    
    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        this.updateToggleButton();
    }
    
    updateToggleButton() {
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.checked = this.theme === 'dark';
            themeToggle.setAttribute(
                'aria-label',
                this.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            );
        }
    }
    
    toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', this.theme);
        this.applyTheme();
    }
}

// Initialize theme manager
const themeManager = new ThemeManager();

// Simple markdown parser
class MarkdownParser {
    constructor() {
        this.rules = [
            // Headers
            { pattern: /^### (.*$)/gm, replacement: '<h3>$1</h3>' },
            { pattern: /^## (.*$)/gm, replacement: '<h2>$1</h2>' },
            { pattern: /^# (.*$)/gm, replacement: '<h1>$1</h1>' },
            
            // Bold and italic
            { pattern: /\*\*(.*?)\*\*/g, replacement: '<strong>$1</strong>' },
            { pattern: /\*(.*?)\*/g, replacement: '<em>$1</em>' },
            { pattern: /(^|[^\w])_([^_\n]+?)_(?=[^\w]|$)/gm, replacement: '$1<em>$2</em>' },
            
            // Code blocks
            { pattern: /```([\s\S]*?)```/g, replacement: '<pre><code>$1</code></pre>' },
            { pattern: /`(.*?)`/g, replacement: '<code>$1</code>' },
            
            // Links
            { pattern: /\[([^\]]+)\]\(([^\)]+)\)/g, replacement: '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>' },
            
            // Lists
            { pattern: /^\* (.*$)/gm, replacement: '<li>$1</li>' },
            { pattern: /^- (.*$)/gm, replacement: '<li>$1</li>' },
            
            // Blockquotes
            { pattern: /^> (.*$)/gm, replacement: '<blockquote>$1</blockquote>' },
            
            // Line breaks
            { pattern: /\n\n/g, replacement: '</p><p>' },
        ];
    }

    autoLinkPlainUrls(html) {
        const urlPattern = /\bhttps?:\/\/[^\s<]+[^\s<.,:;"')\]\}]/g;
        const segments = html.split(/(<[^>]+>)/g);

        return segments.map(segment => {
            if (segment.startsWith('<')) return segment;

            return segment.replace(urlPattern, (url) => {
                return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
            });
        }).join('');
    }
    
    parse(markdown) {
        let html = markdown;
        
        // Apply all rules
        this.rules.forEach(rule => {
            html = html.replace(rule.pattern, rule.replacement);
        });

        // Convert plain URLs (for example, pasted YouTube links) into anchors.
        html = this.autoLinkPlainUrls(html);
        
        // Wrap in paragraphs
        html = '<p>' + html + '</p>';
        
        // Fix empty paragraphs
        html = html.replace(/<p><\/p>/g, '');
        
        // Fix list wrapping
        html = html.replace(/<p>(<li>.*<\/li>)<\/p>/g, '<ul>$1</ul>');
        html = html.replace(/<\/li><li>/g, '</li><li>');
        
        return html;
    }
}

// Blog post manager
class BlogManager {
    constructor() {
        this.parser = new MarkdownParser();
        this.posts = [];
        this.learningPosts = [];
        this.currentPage = this.getCurrentPage();
        this.lifeClockIntervalId = null;
        this.lifeClockState = null;
    }
    
    getCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('blog.html')) return 'blog';
        if (path.includes('learning.html')) return 'learning';
        if (path.includes('life-clock.html')) return 'life';
        if (path.includes('calculate-yours.html')) return 'calculate';
        if (path.includes('post.html')) return 'post';
        return 'home';
    }

    getLifeClockConfig() {
        const MS_PER_DAY = 1000 * 60 * 60 * 24;
        const MS_PER_YEAR = MS_PER_DAY * 365.25;

        return {
            birthYear: 2002,
            birthMonthIndex: 8,
            birthDay: 14,
            birthHour: 0,
            birthMinute: 0,
            birthSecond: 0,
            ugandaOffsetHours: 3,
            lifeExpectancyYears: 64,
            MS_PER_DAY,
            MS_PER_YEAR,
            MS_PER_WEEK: 1000 * 60 * 60 * 24 * 7,
        };
    }

    getBirthTimestampMs(config) {
        const utcHour = config.birthHour - config.ugandaOffsetHours;
        return Date.UTC(
            config.birthYear,
            config.birthMonthIndex,
            config.birthDay,
            utcHour,
            config.birthMinute,
            config.birthSecond
        );
    }

    formatDuration(ms, msPerYear, msPerDay) {
        const clamped = Math.max(0, Math.floor(ms));
        const years = Math.floor(clamped / msPerYear);
        let remainder = clamped - years * msPerYear;

        const days = Math.floor(remainder / msPerDay);
        remainder -= days * msPerDay;

        const hours = Math.floor(remainder / (1000 * 60 * 60));
        remainder -= hours * 1000 * 60 * 60;

        const minutes = Math.floor(remainder / (1000 * 60));
        remainder -= minutes * 1000 * 60;

        const seconds = Math.floor(remainder / 1000);

        const paddedDays = String(days).padStart(2, '0');
        const paddedHours = String(hours).padStart(2, '0');
        const paddedMinutes = String(minutes).padStart(2, '0');
        const paddedSeconds = String(seconds).padStart(2, '0');

        return `${years}y ${paddedDays}d ${paddedHours}h ${paddedMinutes}m ${paddedSeconds}s`;
    }

    getYearFromTimestamp(timestampMs, offsetHours = 0) {
        if (offsetHours === 0) {
            return new Date(timestampMs).getFullYear();
        }

        return new Date(timestampMs + offsetHours * 60 * 60 * 1000).getUTCFullYear();
    }

    renderWeeksGrid(grid, birthTimestamp, totalWeeks, initialWeeksLived, yearOffsetHours = 0) {
        const fragment = document.createDocumentFragment();
        const weekCells = [];
        const weekGroupsByYear = new Map();
        const MS_PER_WEEK = 1000 * 60 * 60 * 24 * 7;

        for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex += 1) {
            const weekStart = birthTimestamp + weekIndex * MS_PER_WEEK;
            const year = this.getYearFromTimestamp(weekStart, yearOffsetHours);

            if (!weekGroupsByYear.has(year)) {
                weekGroupsByYear.set(year, []);
            }

            weekGroupsByYear.get(year).push(weekIndex);
        }

        weekGroupsByYear.forEach((weekIndexes, year) => {
            const yearRow = document.createElement('div');
            yearRow.className = 'year-row';

            const yearLabel = document.createElement('p');
            yearLabel.className = 'year-label';
            yearLabel.textContent = `${year}`;

            const yearWeeks = document.createElement('div');
            yearWeeks.className = 'year-weeks';
            yearWeeks.setAttribute('aria-label', `${year}: ${weekIndexes.length} weeks`);
            yearWeeks.style.setProperty('--weeks-in-year', String(weekIndexes.length));

            weekIndexes.forEach((weekIndex, weekOffsetInYear) => {
                const cell = document.createElement('div');
                cell.className = weekIndex < initialWeeksLived ? 'week lived' : 'week remaining';
                cell.title = `Week ${weekIndex + 1}`;
                cell.setAttribute('aria-label', `Year ${year}, Week ${weekOffsetInYear + 1}`);
                yearWeeks.appendChild(cell);
                weekCells.push(cell);
            });

            yearRow.appendChild(yearLabel);
            yearRow.appendChild(yearWeeks);
            fragment.appendChild(yearRow);
        });

        grid.innerHTML = '';
        grid.appendChild(fragment);
        grid._weekCells = weekCells;

        if (initialWeeksLived < totalWeeks) {
            const currentCell = weekCells[initialWeeksLived];
            if (currentCell) currentCell.classList.add('current');
        }
    }

    updateWeeksGrid(grid, previousWeeksLived, currentWeeksLived, totalWeeks) {
        const next = Math.max(0, Math.min(currentWeeksLived, totalWeeks));
        const prev = Math.max(0, Math.min(previousWeeksLived, totalWeeks));
        const weekCells = grid._weekCells || [];

        if (next === prev) {
            if (next < totalWeeks) {
                const currentCell = weekCells[next];
                if (currentCell) currentCell.classList.add('current');
            }
            return next;
        }

        if (next > prev) {
            for (let i = prev; i < next; i += 1) {
                const cell = weekCells[i];
                if (!cell) break;
                cell.classList.remove('remaining', 'current');
                cell.classList.add('lived');
            }
        } else {
            for (let i = next; i < prev; i += 1) {
                const cell = weekCells[i];
                if (!cell) break;
                cell.classList.remove('lived', 'current');
                cell.classList.add('remaining');
            }
        }

        if (next < totalWeeks) {
            const currentCell = weekCells[next];
            if (currentCell) currentCell.classList.add('current');
        }

        if (prev < totalWeeks && prev !== next) {
            const oldCurrentCell = weekCells[prev];
            if (oldCurrentCell) oldCurrentCell.classList.remove('current');
        }

        return next;
    }

    async renderLifeClockPage() {
        const sinceBirthEl = document.getElementById('time-since-birth');
        const remainingEl = document.getElementById('time-remaining');
        const progressTextEl = document.getElementById('life-progress-text');
        const progressFillEl = document.getElementById('life-progress-fill');
        const weeksGridEl = document.getElementById('weeks-grid');

        if (!sinceBirthEl || !remainingEl || !progressTextEl || !progressFillEl || !weeksGridEl) return;

        const config = this.getLifeClockConfig();
        const birthTimestamp = this.getBirthTimestampMs(config);
        const totalLifeMs = config.lifeExpectancyYears * config.MS_PER_YEAR;
        const deathTimestamp = birthTimestamp + totalLifeMs;
        const totalWeeks = Math.floor((deathTimestamp - birthTimestamp) / config.MS_PER_WEEK);

        const initialWeeksLived = Math.max(
            0,
            Math.min(totalWeeks, Math.floor((Date.now() - birthTimestamp) / config.MS_PER_WEEK))
        );

        this.renderWeeksGrid(weeksGridEl, birthTimestamp, totalWeeks, initialWeeksLived, config.ugandaOffsetHours);

        this.lifeClockState = {
            birthTimestamp,
            deathTimestamp,
            totalLifeMs,
            totalWeeks,
            weeksLived: initialWeeksLived,
            config,
        };

        const tick = () => {
            const now = Date.now();
            const elapsedMs = Math.max(0, now - this.lifeClockState.birthTimestamp);
            const remainingMs = Math.max(0, this.lifeClockState.deathTimestamp - now);

            const progressRaw = (now - this.lifeClockState.birthTimestamp) / this.lifeClockState.totalLifeMs;
            const progress = Math.max(0, Math.min(progressRaw, 1));

            sinceBirthEl.textContent = this.formatDuration(
                elapsedMs,
                this.lifeClockState.config.MS_PER_YEAR,
                this.lifeClockState.config.MS_PER_DAY
            );

            remainingEl.textContent = this.formatDuration(
                remainingMs,
                this.lifeClockState.config.MS_PER_YEAR,
                this.lifeClockState.config.MS_PER_DAY
            );

            const progressPercent = (progress * 100).toFixed(2);
            progressTextEl.textContent = `${progressPercent}%`;
            progressFillEl.style.width = `${progressPercent}%`;

            const currentWeeksLived = Math.max(
                0,
                Math.min(
                    this.lifeClockState.totalWeeks,
                    Math.floor((now - this.lifeClockState.birthTimestamp) / this.lifeClockState.config.MS_PER_WEEK)
                )
            );

            this.lifeClockState.weeksLived = this.updateWeeksGrid(
                weeksGridEl,
                this.lifeClockState.weeksLived,
                currentWeeksLived,
                this.lifeClockState.totalWeeks
            );

            document.body.classList.remove('life-tick');
            window.requestAnimationFrame(() => {
                document.body.classList.add('life-tick');
            });
        };

        tick();

        if (this.lifeClockIntervalId) {
            clearInterval(this.lifeClockIntervalId);
        }

        this.lifeClockIntervalId = setInterval(tick, 1000);
    }

    clearLifeClockInterval() {
        if (this.lifeClockIntervalId) {
            clearInterval(this.lifeClockIntervalId);
            this.lifeClockIntervalId = null;
        }
    }

    getLocalBirthTimestamp(dateInputValue) {
        const [year, month, day] = dateInputValue.split('-').map(Number);
        return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    }

    async renderCalculatePage() {
        const form = document.getElementById('calculate-form');
        const birthDateInput = document.getElementById('birth-date');
        const expectancyInput = document.getElementById('life-expectancy');

        const resultsSection = document.getElementById('calculate-results');
        const progressSection = document.getElementById('calculate-progress');
        const weeksSection = document.getElementById('calculate-weeks');

        const sinceBirthEl = document.getElementById('calc-time-since');
        const remainingEl = document.getElementById('calc-time-remaining');
        const progressTextEl = document.getElementById('calc-progress-text');
        const progressFillEl = document.getElementById('calc-progress-fill');
        const weeksSummaryEl = document.getElementById('calc-weeks-summary');
        const weeksGridEl = document.getElementById('calc-weeks-grid');

        if (!form || !birthDateInput || !expectancyInput) return;
        if (!resultsSection || !progressSection || !weeksSection) return;
        if (!sinceBirthEl || !remainingEl || !progressTextEl || !progressFillEl) return;
        if (!weeksSummaryEl || !weeksGridEl) return;

        this.clearLifeClockInterval();

        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        birthDateInput.max = `${yyyy}-${mm}-${dd}`;

        const config = this.getLifeClockConfig();

        const startTicker = (birthTimestamp, lifeExpectancyYears) => {
            const totalLifeMs = lifeExpectancyYears * config.MS_PER_YEAR;
            const deathTimestamp = birthTimestamp + totalLifeMs;
            const totalWeeks = Math.floor((deathTimestamp - birthTimestamp) / config.MS_PER_WEEK);
            let weeksLived = Math.max(
                0,
                Math.min(totalWeeks, Math.floor((Date.now() - birthTimestamp) / config.MS_PER_WEEK))
            );

            this.renderWeeksGrid(weeksGridEl, birthTimestamp, totalWeeks, weeksLived, 0);
            weeksSummaryEl.textContent = `${weeksLived} of ${totalWeeks} weeks lived`;

            const tick = () => {
                const now = Date.now();
                const elapsedMs = Math.max(0, now - birthTimestamp);
                const remainingMs = Math.max(0, deathTimestamp - now);

                const progressRaw = (now - birthTimestamp) / totalLifeMs;
                const progress = Math.max(0, Math.min(progressRaw, 1));
                const progressPercent = (progress * 100).toFixed(2);

                sinceBirthEl.textContent = this.formatDuration(elapsedMs, config.MS_PER_YEAR, config.MS_PER_DAY);
                remainingEl.textContent = this.formatDuration(remainingMs, config.MS_PER_YEAR, config.MS_PER_DAY);
                progressTextEl.textContent = `${progressPercent}%`;
                progressFillEl.style.width = `${progressPercent}%`;

                const currentWeeksLived = Math.max(
                    0,
                    Math.min(totalWeeks, Math.floor((now - birthTimestamp) / config.MS_PER_WEEK))
                );

                weeksLived = this.updateWeeksGrid(weeksGridEl, weeksLived, currentWeeksLived, totalWeeks);
                weeksSummaryEl.textContent = `${weeksLived} of ${totalWeeks} weeks lived`;
            };

            tick();
            this.clearLifeClockInterval();
            this.lifeClockIntervalId = setInterval(tick, 1000);
        };

        form.addEventListener('submit', (event) => {
            event.preventDefault();

            const birthInputValue = birthDateInput.value;
            const lifeExpectancyYears = parseFloat(expectancyInput.value);

            if (!birthInputValue || Number.isNaN(lifeExpectancyYears) || lifeExpectancyYears <= 0) return;

            const birthTimestamp = this.getLocalBirthTimestamp(birthInputValue);

            resultsSection.hidden = false;
            progressSection.hidden = false;
            weeksSection.hidden = false;
            startTicker(birthTimestamp, lifeExpectancyYears);
        });
    }
    
    async loadPosts() {
        try {
            const response = await fetch('vault/scripts/posts.json');
            if (!response.ok) throw new Error('Could not load posts');
            const allPosts = await response.json();

            // Separate blog and learning posts
            this.posts = allPosts.filter(post => post.type === 'blog');
            this.learningPosts = allPosts.filter(post => post.type === 'learning');

            // Sort posts by date (newest first)
            this.posts.sort((a, b) => new Date(b.date) - new Date(a.date));
            this.learningPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
        } catch (error) {
            console.error('Error loading posts:', error);
            this.posts = [];
            this.learningPosts = [];
        }
    }
    
    async loadMarkdownContent(postId) {
        try {
            const response = await fetch(`vault/posts/${postId}.md`);
            if (!response.ok) {
                throw new Error('Post not found');
            }
            let markdown = await response.text();

            markdown = markdown.replace(/---[\s\S]*?---\s*/, '');

            return this.parser.parse(markdown);
        } catch (error) {
            console.error('Error loading post:', error);
            return '<p>Sorry, this post could not be loaded.</p>';
        }
    }
    
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    
    createPostCard(post) {
        return `
            <article class="post-card">
                <div class="post-meta">${this.formatDate(post.date)}</div>
                <h3><a href="post.html?id=${post.id}">${post.title}</a></h3>
                <p>${post.excerpt}</p>
            </article>
        `;
    }
    
    async renderHomePage() {
        const recentPostsContainer = document.getElementById('recent-posts-container');
        if (!recentPostsContainer) return;
        
        // Show the most recent blog post
        const recentPosts = this.posts.slice(0, 1);
        const postsHTML = recentPosts.map(post => this.createPostCard(post)).join('');
        recentPostsContainer.innerHTML = postsHTML;
    }
    
    async renderBlogPage() {
        const blogPostsContainer = document.getElementById('blog-posts-container');
        if (!blogPostsContainer) return;
        
        const postsHTML = this.posts.map(post => this.createPostCard(post)).join('');
        blogPostsContainer.innerHTML = postsHTML;
    }
    
    async renderLearningPage() {
        const learningPostsContainer = document.getElementById('learning-posts-container');
        if (!learningPostsContainer) return;
        
        const postsHTML = this.learningPosts.map(post => this.createPostCard(post)).join('');
        learningPostsContainer.innerHTML = postsHTML;
    }
    
    async renderPostPage() {
        const urlParams = new URLSearchParams(window.location.search);
        const postId = urlParams.get('id');
        
        if (!postId) {
            document.body.innerHTML = '<p>Post not found</p>';
            return;
        }
        
        // Find the post
        const post = [...this.posts, ...this.learningPosts].find(p => p.id === postId);
        
        if (!post) {
            document.body.innerHTML = '<p>Post not found</p>';
            return;
        }
        
        // Create the post page HTML
        const postHTML = `
            <header>
                <nav>
                    <ul>
                        <li><a href="index.html">Mukiibi</a></li>
                        <li><a href="research.html">Research</a></li>
                        <li><a href="blog.html">Blog</a></li>
                        <li><a href="tutorials.html">Tutorials</a></li>
                        <li><a href="projects.html">Projects</a></li>
                        <li><a href="community.html">Community</a></li>
                        <li><a href="life-clock.html">Life</a></li>
                        <li class="theme-toggle-item">
                            <label for="theme-toggle" class="theme-switch" aria-label="Toggle dark mode">
                                <input type="checkbox" id="theme-toggle" class="theme-toggle" role="switch" aria-label="Toggle dark mode">
                                <span class="theme-slider" aria-hidden="true"></span>
                            </label>
                        </li>
                    </ul>
                </nav>
            </header>
            
            <main>
                <a href="${post.type === 'blog' ? 'blog.html' : 'learning.html'}" class="back-btn">← Back to ${post.type === 'blog' ? 'Blog' : 'Learning'}</a>
                
                <article class="article">
                    <h1>${post.title}</h1>
                    <div class="article-meta">${this.formatDate(post.date)}</div>
                    <div class="article-content" id="article-content">
                        Loading...
                    </div>
                </article>
            </main>
            
            <footer>
                <p>&copy; 2026</p>
            </footer>
        `;
        
        document.body.innerHTML = postHTML;
        
        // Re-initialize theme manager for the new page
        themeManager.init();
        
        // Load and render the markdown content
        const content = await this.loadMarkdownContent(postId);
        const contentContainer = document.getElementById('article-content');
        if (contentContainer) {
            contentContainer.innerHTML = content;
        }
    }
    
    async init() {
        if (this.currentPage !== 'life' && this.currentPage !== 'calculate') {
            await this.loadPosts();
        }
        
        switch (this.currentPage) {
            case 'home':
                await this.renderHomePage();
                break;
            case 'blog':
                await this.renderBlogPage();
                break;
            case 'learning':
                await this.renderLearningPage();
                break;
            case 'post':
                await this.renderPostPage();
                break;
            case 'life':
                await this.renderLifeClockPage();
                break;
            case 'calculate':
                await this.renderCalculatePage();
                break;
        }
    }
}

// Initialize the blog when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const blog = new BlogManager();
    blog.init();
});

class SocialMediaCalendar {
    constructor() {
        this.data = [];
        this.currentMonth = '';
        this.months = [];
        this.imageObserver = null;
        this.init();
    }

    async init() {
        const loader = document.getElementById('loader');
        try {
            this.setupImageObserver();
            await this.loadData();

            if (this.data.length === 0) {
                document.getElementById('postsGrid').innerHTML = '<p>No posts found. Please check your data.json file.</p>';
                return;
            }

            this.processData();
            this.renderMonthDropdown();
            this.setupEventListeners();

            setTimeout(() => {
                this.setDefaultMonth();
            }, 0);

        } catch (error) {
            console.error('Error initializing calendar:', error);
            document.getElementById('postsGrid').innerHTML = '<p class="error">Could not load calendar data.</p>';
        } finally {
            if (loader) {
                loader.classList.add('hidden');
            }
        }
    }

    setupImageObserver() {
        const options = { rootMargin: '0px', threshold: 0.1 };
        this.imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const lazyImage = entry.target;
                    lazyImage.src = lazyImage.dataset.src;
                    observer.unobserve(lazyImage);
                }
            });
        }, options);
    }

    observeNewImages() {
        const images = document.querySelectorAll('img[data-src]');
        images.forEach(img => this.imageObserver.observe(img));
    }

    switchMonth(month) {
        if (!this.months.includes(month)) return;
        
        this.currentMonth = month;
        document.getElementById('monthSelector').value = month;
        
        this.renderPosts();
        this.updateNavButtons();
    }

    // --- REFACTORED: renderPosts now uses requestAnimationFrame ---
    renderPosts() {
        const postsGrid = document.getElementById('postsGrid');
        postsGrid.innerHTML = '';
        const monthPosts = this.data
            .filter(post => new Date(post['Publishing Date']).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) === this.currentMonth)
            .sort((a, b) => new Date(a['Publishing Date']) - new Date(b['Publishing Date']));

        const CHUNK_SIZE = 4; // Render 4 posts per frame
        let currentIndex = 0;

        const renderChunk = () => {
            const fragment = document.createDocumentFragment();
            const endIndex = Math.min(currentIndex + CHUNK_SIZE, monthPosts.length);

            for (let i = currentIndex; i < endIndex; i++) {
                const post = monthPosts[i];
                const postCard = this.createPostCard(post);
                fragment.appendChild(postCard);
            }

            postsGrid.appendChild(fragment);
            this.observeNewImages(); // Observe images for the newly added chunk

            currentIndex = endIndex;

            // If there are more posts to render, schedule the next chunk
            if (currentIndex < monthPosts.length) {
                requestAnimationFrame(renderChunk);
            }
        };

        // Start the rendering process
        renderChunk();
    }


    createPostCard(post) {
        const card = document.createElement('div');
        card.className = 'post-card';
        const date = new Date(post['Publishing Date']);
        const formattedDate = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const imageUrl = post.Design ? this.getResizedImageUrl(post.Design, 400, 400) : '';

        card.innerHTML = `
            <div class="post-header">
                <div class="post-date"><iconify-icon icon="lucide:calendar"></iconify-icon>${formattedDate}</div>
                <div class="post-actions">
                    <button class="action-btn show-text-btn" title="View Social Media Text"><iconify-icon icon="lucide:share-2"></iconify-icon></button>
                    <button class="action-btn copy-text-btn" title="Copy Social Text"><iconify-icon icon="lucide:copy"></iconify-icon></button>
                </div>
            </div>
            <div class="post-image">
                ${imageUrl ? `<img data-src="${imageUrl}" alt="Post design" class="lazy-image">` : '<div class="image-overlay">No Image</div>'}
            </div>
            <div class="post-content">
                <h3 class="post-title">${post['Design Content'] || ''}</h3>
                <p class="post-description">${post['Text Content'] || ''}</p>
                <div class="post-hashtags">${(post.Hashtags || '').split(' ').map(tag => `<span class="hashtag">${tag}</span>`).join('')}</div>
            </div>`;

        card.querySelector('.show-text-btn').addEventListener('click', () => this.showSocialText(post['Text to publish on social media']));
        card.querySelector('.copy-text-btn').addEventListener('click', () => this.copyToClipboard(post['Text to publish on social media']));
        if (imageUrl) {
            card.querySelector('.post-image').addEventListener('click', () => this.showFullImage(post.Design));
        }
        return card;
    }

    async loadData() {
        try {
            const response = await fetch('https://creativus-sites.com/data/wp-json/yhs-social-posts/v1/all');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this.data = await response.json();
        } catch (error) {
            console.error('Error loading data.json:', error);
            this.data = [];
        }
    }

    processData() {
        const monthSet = new Set();
        this.data.forEach(post => {
            const date = new Date(post['Publishing Date']);
            if (isNaN(date.getTime())) return;
            const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            monthSet.add(monthYear);
        });
        
        this.months = Array.from(monthSet).sort((a, b) => new Date(a) - new Date(b));
        this.updateStats();
    }

    updateStats() {
        const totalPosts = this.data.length;
        const currentDate = new Date();
        const currentMonthPosts = this.data.filter(post => {
            const postDate = new Date(post['Publishing Date']);
            return postDate.getMonth() === currentDate.getMonth() && 
                   postDate.getFullYear() === currentDate.getFullYear();
        }).length;

        document.getElementById('totalPosts').textContent = totalPosts;
        document.getElementById('monthlyPosts').textContent = currentMonthPosts;
    }

    renderMonthDropdown() {
        const monthSelector = document.getElementById('monthSelector');
        monthSelector.innerHTML = '';
        this.months.forEach(month => {
            const option = document.createElement('option');
            option.value = month;
            option.textContent = month;
            monthSelector.appendChild(option);
        });
    }

    setDefaultMonth() {
        const urlParams = new URLSearchParams(window.location.search);
        const monthFromUrl = urlParams.get('month');
        
        let formattedMonthFromUrl = null;
        if (monthFromUrl) {
            const [month, year] = monthFromUrl.split('-');
            if (month && year) {
                formattedMonthFromUrl = month.charAt(0).toUpperCase() + month.slice(1) + ' ' + year;
            }
        }
        
        const now = new Date();
        const currentMonthYear = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        let defaultMonth = null;

        if (formattedMonthFromUrl && this.months.includes(formattedMonthFromUrl)) {
            defaultMonth = formattedMonthFromUrl;
        } else if (this.months.includes(currentMonthYear)) {
            defaultMonth = currentMonthYear;
        } else if (this.months.length > 0) {
            defaultMonth = this.months[0];
        }

        if (defaultMonth) {
            this.switchMonth(defaultMonth);
        }
    }

    getResizedImageUrl(originalUrl, width, height) {
        if (!originalUrl || !originalUrl.includes('cloudinary.com')) return originalUrl;
        const parts = originalUrl.split('/upload/');
        if (parts.length !== 2) return originalUrl;
        return `${parts[0]}/upload/w_${width},h_${height},c_fill,q_auto:good/${parts[1]}`;
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    }

    hideModal(modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }

    showFullImage(imageUrl) {
        if (!imageUrl) return;
        document.getElementById('modalImage').src = imageUrl;
        this.showModal('imageModal');
    }

    showSocialText(text) {
        document.getElementById('socialMediaText').innerHTML = text || '';
        this.showModal('textModal');
    }

    async copyToClipboard(text) {
        if (!text) return;
        try {
            // Use a temporary element to correctly convert HTML to plain text.
            // This handles all tags (<p>, <br>, etc.) and decodes HTML entities.
            const tempEl = document.createElement('div');
            tempEl.innerHTML = text;
            const cleanText = tempEl.innerText;

            await navigator.clipboard.writeText(cleanText);
            this.showToast('Text copied to clipboard!');
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            this.showToast('Failed to copy text', 'error');
        }
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<iconify-icon icon="lucide:${type === 'success' ? 'check-circle' : 'alert-circle'}"></iconify-icon> ${message}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => document.body.removeChild(toast), 400);
        }, 3000);
    }
    
    navigateMonth(direction) {
        const currentIndex = this.months.indexOf(this.currentMonth);
        const newIndex = currentIndex + direction;
        if (newIndex >= 0 && newIndex < this.months.length) {
            this.switchMonth(this.months[newIndex]);
        }
    }

    updateNavButtons() {
        const currentIndex = this.months.indexOf(this.currentMonth);
        document.getElementById('prevMonthBtn').disabled = (currentIndex === 0);
        document.getElementById('nextMonthBtn').disabled = (currentIndex === this.months.length - 1);
    }

    setupEventListeners() {
        document.getElementById('monthSelector').addEventListener('change', (e) => {
            this.switchMonth(e.target.value);
        });
        
        document.getElementById('grid-columns').addEventListener('change', (e) => {
            const grid = document.getElementById('postsGrid');
            const columns = e.target.value;
            grid.style.gridTemplateColumns = (columns === 'auto') 
                ? 'repeat(auto-fill, minmax(350px, 1fr))' 
                : `repeat(${columns}, 1fr)`;
        });

        document.getElementById('prevMonthBtn').addEventListener('click', () => this.navigateMonth(-1));
        document.getElementById('nextMonthBtn').addEventListener('click', () => this.navigateMonth(1));

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('modal-close')) {
                    this.hideModal(modal);
                }
            });
        });
        document.querySelector('.text-modal-close').addEventListener('click', () => this.hideModal(document.getElementById('textModal')));

        document.getElementById('copyBtn').addEventListener('click', () => {
            const textContent = document.getElementById('socialMediaText').innerText;
            this.copyToClipboard(textContent);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.show').forEach(modal => this.hideModal(modal));
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.calendar = new SocialMediaCalendar();
});

(function() {
  if (localStorage.getItem('theme') === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initVideoCardHover();
  initUploadPage();
  initTagInput();
  initTagFilter();
  initSearch();
  initSort();
  initLikeState();
  initComments();
});

function initThemeToggle() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    }
  });
}


function initLikeState() {
  const btn = document.getElementById('likeBtn');
  if (!btn) return;
  const id = btn.getAttribute('onclick').match(/'([^']+)'/)[1];
  if (localStorage.getItem(`liked_${id}`)) {
    btn.dataset.liked = 'true';
  }
}

/* ─── Homepage: hover-to-preview ──────────── */
function initVideoCardHover() {
  document.querySelectorAll('.video-card').forEach(card => {
    const video = card.querySelector('video');
    if (!video) return;

    card.addEventListener('mouseenter', () => {
      video.muted = true;
      video.play().catch(() => {});
    });

    card.addEventListener('mouseleave', () => {
      video.pause();
      video.currentTime = 0;
    });
  });
}

/* ─── Homepage: shared filter state ─────── */
let _activeTag = 'all';

function applyFilters() {
  const searchInput  = document.getElementById('searchInput');
  const visibleCount = document.getElementById('visibleCount');
  const noResults    = document.getElementById('noResults');
  const noResultsQ   = document.getElementById('noResultsQuery');
  const cards        = Array.from(document.querySelectorAll('.video-card'));
  if (!cards.length) return;

  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
  let shown = 0;

  cards.forEach(card => {
    const title   = card.querySelector('.video-title').textContent.toLowerCase();
    const tags    = (card.dataset.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    const matchQ  = q === '' || title.includes(q);
    const matchT  = _activeTag === 'all' || tags.includes(_activeTag);
    const visible = matchQ && matchT;
    card.style.display = visible ? '' : 'none';
    if (visible) shown++;
  });

  if (visibleCount) visibleCount.textContent = shown;

  if (noResults) {
    const hasFilter = q !== '' || _activeTag !== 'all';
    noResults.hidden = shown > 0 || !hasFilter;
    if (noResultsQ) {
      noResultsQ.textContent = q ? `"${searchInput.value.trim()}"` : `#${_activeTag}`;
    }
  }
}

/* ─── Homepage: tag filter bar ───────────── */
function initTagFilter() {
  const bar = document.getElementById('tagFilterBar');
  if (!bar) return;

  // Auto-activate tag from URL param (?tag=xyz)
  const urlTag = new URLSearchParams(location.search).get('tag');
  if (urlTag) {
    const btn = bar.querySelector(`[data-tag="${urlTag}"]`);
    if (btn) {
      bar.querySelector('.active').classList.remove('active');
      btn.classList.add('active');
      _activeTag = urlTag;
    }
  }

  bar.addEventListener('click', e => {
    const btn = e.target.closest('.tag-filter-btn');
    if (!btn) return;
    bar.querySelectorAll('.tag-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _activeTag = btn.dataset.tag;
    applyFilters();
  });
}

/* ─── Upload page: tag chip input ────────── */
function initTagInput() {
  const wrap       = document.getElementById('tagInputWrap');
  if (!wrap) return;

  const chipsEl    = document.getElementById('tagChips');
  const textInput  = document.getElementById('tagTextInput');
  const hidden     = document.getElementById('tagsHidden');
  const suggestions= document.querySelectorAll('.tag-suggestion');
  const tags       = new Set();

  wrap.addEventListener('click', () => textInput.focus());

  textInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(textInput.value);
    } else if (e.key === 'Backspace' && textInput.value === '' && tags.size > 0) {
      removeTag([...tags].at(-1));
    }
  });

  textInput.addEventListener('blur', () => {
    if (textInput.value.trim()) addTag(textInput.value);
  });

  suggestions.forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      if (tags.has(tag)) { removeTag(tag); }
      else { addTag(tag); }
    });
  });

  function addTag(raw) {
    const tag = raw.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().slice(0, 30);
    if (!tag || tags.has(tag) || tags.size >= 10) { textInput.value = ''; return; }
    tags.add(tag);
    textInput.value = '';
    renderChips();
    syncSuggestions();
  }

  function removeTag(tag) {
    tags.delete(tag);
    renderChips();
    syncSuggestions();
  }

  function renderChips() {
    chipsEl.innerHTML = '';
    tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = `${tag}<button type="button" class="tag-chip-remove" data-tag="${tag}" title="Remove">×</button>`;
      chip.querySelector('.tag-chip-remove').addEventListener('click', e => {
        e.stopPropagation();
        removeTag(e.currentTarget.dataset.tag);
      });
      chipsEl.appendChild(chip);
    });
    hidden.value = [...tags].join(',');
    textInput.placeholder = tags.size > 0 ? 'Add another…' : 'Type a tag and press Enter…';
  }

  function syncSuggestions() {
    suggestions.forEach(btn => {
      btn.classList.toggle('used', tags.has(btn.dataset.tag));
    });
  }
}

/* ─── Homepage: sort ─────────────────────── */
function initSort() {
  const group = document.getElementById('sortGroup');
  if (!group) return;
  const grid  = document.getElementById('videoGrid');

  group.addEventListener('click', (e) => {
    const btn = e.target.closest('.sort-btn');
    if (!btn) return;

    group.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const mode = btn.dataset.sort;
    const cards = Array.from(grid.querySelectorAll('.video-card'));

    cards.sort((a, b) => {
      if (mode === 'views') return Number(b.dataset.views) - Number(a.dataset.views);
      if (mode === 'likes') return Number(b.dataset.likes) - Number(a.dataset.likes);
      // latest: newest uploadedAt first
      return new Date(b.dataset.date) - new Date(a.dataset.date);
    });

    cards.forEach(c => grid.appendChild(c));
  });
}

/* ─── Homepage: search / filter ─────────── */
function initSearch() {
  const input    = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');
  if (!input) return;

  input.addEventListener('input', () => {
    clearBtn.hidden = input.value === '';
    applyFilters();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    input.focus();
    applyFilters();
  });
}

/* ─── Upload Page ─────────────────────────── */
function initUploadPage() {
  const dropZone = document.getElementById('dropZone');
  if (!dropZone) return;

  const fileInput    = document.getElementById('videoFile');
  const fileSelected = document.getElementById('fileSelected');
  const fileNameEl   = document.getElementById('fileName');
  const fileSizeEl   = document.getElementById('fileSize');
  const removeBtn    = document.getElementById('removeFile');
  const dropContent  = document.getElementById('dropContent');
  const form         = document.querySelector('.upload-form');
  const submitBtn    = document.getElementById('submitBtn');
  const submitText   = document.getElementById('submitText');
  const submitIcon   = document.getElementById('submitIcon');

  // Drag over / leave
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  ['dragleave', 'dragend'].forEach(evt => {
    dropZone.addEventListener(evt, () => dropZone.classList.remove('drag-over'));
  });

  // Drop
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      showDropError('Only video files are supported.');
      return;
    }
    applyFile(file);
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
  });

  // File input change
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) applyFile(fileInput.files[0]);
  });

  // Remove file
  removeBtn.addEventListener('click', e => {
    e.stopPropagation();
    fileInput.value = '';
    fileSelected.classList.remove('show');
    dropContent.style.display = '';
    dropZone.style.borderColor = '';
  });

  // Form submit — loading state
  form.addEventListener('submit', e => {
    const title = document.getElementById('title');
    if (!title.value.trim()) {
      e.preventDefault();
      title.focus();
      title.style.borderColor = 'var(--danger)';
      title.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.2)';
      setTimeout(() => { title.style.borderColor = ''; title.style.boxShadow = ''; }, 2500);
      return;
    }
    if (!fileInput.files[0]) {
      e.preventDefault();
      showDropError('Please select a video file.');
      return;
    }

    // Show spinner
    submitIcon.outerHTML = `<svg id="submitIcon" class="spin" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>`;
    submitText.textContent = 'Uploading…';
    submitBtn.disabled = true;
  });

  function applyFile(file) {
    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = formatBytes(file.size);
    fileSelected.classList.add('show');
    dropContent.style.display = 'none';
    dropZone.style.borderColor = 'var(--accent)';
  }

  function showDropError(msg) {
    dropZone.style.borderColor = 'var(--danger)';
    const old = dropContent.querySelector('.drop-error');
    if (old) old.remove();
    const p = document.createElement('p');
    p.className = 'drop-error';
    p.style.color = '#fca5a5';
    p.style.marginTop = '6px';
    p.textContent = msg;
    dropContent.appendChild(p);
    setTimeout(() => { dropZone.style.borderColor = ''; p.remove(); }, 3000);
  }
}

/* ─── Watch Page: comments ──────────────── */
function initComments() {
  const section  = document.getElementById('comments');
  if (!section) return;

  const videoId  = section.dataset.videoId;
  const form     = document.getElementById('commentForm');
  const nameEl   = document.getElementById('commentName');
  const textEl   = document.getElementById('commentText');
  const submitBtn= document.getElementById('commentSubmit');
  const list     = document.getElementById('commentList');
  const countEl  = document.getElementById('commentsCount');
  const charCount= document.getElementById('charCount');
  const noMsg    = document.getElementById('noComments');

  // Character counter
  textEl.addEventListener('input', () => {
    const len = textEl.value.length;
    charCount.textContent = `${len} / 1000`;
    charCount.style.color = len > 900 ? '#f87171' : '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = textEl.value.trim();
    if (!text) {
      textEl.focus();
      textEl.style.borderColor = 'var(--danger)';
      setTimeout(() => textEl.style.borderColor = '', 2000);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting…';

    try {
      const res = await fetch(`/video/${videoId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameEl.value.trim(), text })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post');

      // Remove "no comments" placeholder
      if (noMsg) noMsg.remove();

      // Prepend new comment to list
      list.insertAdjacentHTML('afterbegin', buildCommentHTML(data.comment));

      // Update count badge
      const current = parseInt(countEl.textContent) || 0;
      countEl.textContent = current + 1;

      // Reset form
      textEl.value = '';
      nameEl.value = '';
      charCount.textContent = '0 / 1000';
    } catch (err) {
      alert(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post comment';
    }
  });
}

function buildCommentHTML(c) {
  const color = avatarColor(c.name);
  const initial = c.name.charAt(0).toUpperCase();
  const escaped = c.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `
    <div class="comment" id="comment-${c.id}">
      <div class="comment-avatar" style="background:${color}">${initial}</div>
      <div class="comment-body">
        <div class="comment-meta">
          <span class="comment-author">${c.name}</span>
          <span class="comment-time">just now</span>
        </div>
        <p class="comment-text">${escaped}</p>
      </div>
    </div>`;
}

function avatarColor(name) {
  const colors = ['#7c3aed','#2563eb','#059669','#d97706','#dc2626','#db2777','#0891b2','#65a30d'];
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

/* ─── Watch Page: like ───────────────────── */
function likeVideo(id) {
  const btn       = document.getElementById('likeBtn');
  const countEl   = document.getElementById('likeCount');
  const liked     = btn.dataset.liked === 'true';

  // localStorage key so a page refresh remembers the like
  const key = `liked_${id}`;
  if (localStorage.getItem(key)) return; // already liked

  btn.dataset.liked = 'true';
  localStorage.setItem(key, '1');

  // Trigger pop animation
  btn.classList.remove('pop');
  void btn.offsetWidth; // reflow to restart animation
  btn.classList.add('pop');
  btn.addEventListener('animationend', () => btn.classList.remove('pop'), { once: true });

  fetch(`/video/${id}/like`, { method: 'POST' })
    .then(r => r.json())
    .then(data => {
      if (data.likes !== undefined) {
        countEl.textContent = formatViews(data.likes);
      }
    })
    .catch(() => {
      // Roll back on error
      btn.dataset.liked = 'false';
      localStorage.removeItem(key);
    });
}

/* ─── Watch Page / Card: delete ─────────── */
function deleteVideo(id) {
  if (!confirm('Delete this video permanently? This cannot be undone.')) return;

  fetch(`/video/${id}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        const card = document.querySelector(`.video-card[data-id="${id}"]`);
        if (card) {
          card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.97)';
          setTimeout(() => card.remove(), 200);
        } else {
          window.location.href = '/';
        }
      } else alert('Delete failed: ' + (data.error || 'Unknown error'));
    })
    .catch(() => alert('Network error. Could not delete video.'));
}

/* ─── Helpers ────────────────────────────── */
function formatBytes(bytes) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576)    return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024)       return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

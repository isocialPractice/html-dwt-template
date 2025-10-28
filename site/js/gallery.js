// gallery
// Functions for gallery and project pages.

(function(){
    function hasOverflow(track){
        if(!track) return false;
        return (track.scrollWidth - track.clientWidth) > 2; // allow tiny rounding
    }

    function rotate(track, dir){
        if(!track) return;
        if(!hasOverflow(track)) return; // nothing to do
        const first = track.firstElementChild;
        const last = track.lastElementChild;
        if(!first || !last) return;
        // rotate slides by reordering DOM nodes
        if (dir === 'next') {
            // move first slide to the end
            track.appendChild(first);
        } else {
            // move last slide to the beginning
            track.insertBefore(last, track.firstElementChild);
        }
    }

    function getDirectionFromImg(img){
        if(!img) return 'next';
        const d = (img.dataset && img.dataset.dir) || '';
        const alt = (img.getAttribute('alt')||'').toLowerCase();
        if(d) return d === 'left' ? 'prev' : 'next';
        if(alt.includes('left')) return 'prev';
        if(alt.includes('right')) return 'next';
        // fallback: if there are two arrows, assume first=prev, second=next
        const all = img.closest('.slide-wrapper')?.querySelectorAll('.slide-nav .slide-arrow img');
        if(all && all.length === 2){
            return (all[0] === img) ? 'prev' : 'next';
        }
        return 'next';
    }

    function handleArrowClick(e){
        const img = e.currentTarget || e.target;
        const wrapper = img.closest('.slide-wrapper');
        if(!wrapper) return;
        const track = wrapper.querySelector('.gallery-slides');
        const dir = getDirectionFromImg(img);
        rotate(track, dir);
    }

    // Public function for inline onclick usage if present in templates
    function galleryFunction(evt){
        const ev = evt || window.event;
        handleArrowClick(ev);
    }

    // Auto-wire arrows when DOM is ready
    document.addEventListener('DOMContentLoaded', function(){
        document.querySelectorAll('.slide-wrapper .slide-arrow img').forEach(img => {
            // avoid double-binding
            if(!img.__galleryBound){
                img.addEventListener('click', handleArrowClick);
                img.__galleryBound = true;
            }
        });
    });

        // Hydrate gallery/project listing page from shorthand-like placeholders
        document.addEventListener('DOMContentLoaded', function(){
            const container = document.querySelector('.gallery .gallery-repeating-entries');
            if(!container) return;

            // Detect if this is the project listing page by presence of a fully built example block
            const example = container.querySelector('.gallery-repeat .gallery-slide[data-img]');
            if(!example) return;

            const exampleRepeat = example.closest('.gallery-repeat');
            if(!exampleRepeat) return;

            const items = ['coffeeMattersBranding','techView','graphicNet','maxoTough','maxoToughLogo'];

            // Helper: Title Case from token
            const titleCase = (s) => s
                .replace(/([A-Z])/g, ' $1')
                .replace(/^\s+/, '')
                .replace(/^[a-z]/, m => m.toUpperCase())
                .replace(/\b([a-z])(\w*)/g, (m,a,b)=> a.toUpperCase()+b);

            // Clean stray shorthand markers if present
            container.querySelectorAll(':scope > *').forEach(node => {
                if(node.nodeType === Node.TEXT_NODE){
                    const t = node.textContent.trim();
                    if(t === 'start-copy-block' || t === 'end-copy-block'){
                        node.parentNode.removeChild(node);
                    }
                }
            });

            // Build entries if missing
            items.forEach(item => {
                if(container.querySelector(`.gallery-slide[data-img="${item}"]`)) return; // already present
                const clone = exampleRepeat.cloneNode(true);

                // update title
                const titleEl = clone.querySelector('.gallery-title');
                if(titleEl) titleEl.textContent = titleCase(item);

                // update paragraph
                const p = clone.querySelector('.gallery-paragraph');
                if(p){
                    p.textContent = `A showcase of ${titleCase(item)}. We focused on a clean, accessible UI with an intuitive UX. This mock demonstrates the look-and-feel across multiple screens.`;
                }

                // update data-img and slide images
                const slideRoot = clone.querySelector('.gallery-slide');
                if(slideRoot){
                    slideRoot.setAttribute('data-img', item);
                }
                const imgs = clone.querySelectorAll('.gallery-slides .slide-img img');
                imgs.forEach((img, idx) => {
                    // Try to preserve the ordinal (One, Two, Three, ...)
                    const ord = (img.src.match(/(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)\.png/i) || [,'One'])[1];
                    img.src = `/img/${item}${ord.charAt(0).toUpperCase()+ord.slice(1)}.png`;
                });

                // Ensure at least 3 slides
                const ords = ['One','Two','Three'];
                const slidesWrap = clone.querySelector('.gallery-slides');
                if(slidesWrap){
                    // If there are fewer than 3, create more
                    const existing = slidesWrap.querySelectorAll('.slide').length;
                    for(let i=existing; i<3; i++){
                        const slide = document.createElement('div');
                        slide.className = 'slide';
                        const slideImg = document.createElement('div');
                        slideImg.className = 'slide-img';
                        const img = document.createElement('img');
                        img.className = 'slide-instance';
                        img.alt = 'galler slide image';
                        img.src = `/img/${item}${ords[Math.min(i, ords.length-1)]}.png`;
                        slideImg.appendChild(img);
                        slide.appendChild(slideImg);
                        slidesWrap.appendChild(slide);
                    }
                }

                // update project link
                const link = clone.querySelector('.gallery-project-link .project-link');
                if(link){
                    link.href = `/projects/${item}.html`;
                    if(!link.textContent || !link.textContent.trim()){
                        link.textContent = 'Full Project Details';
                    }
                }

                // fix arrow onclicks if placeholders were present
                clone.querySelectorAll('.slide-arrow img').forEach(a => {
                    // normalize to our handler; keep alt as is for direction inference
                    a.setAttribute('onclick', 'galleryFunction(event)');
                });

                // Insert after example block
                container.appendChild(clone);
            });
        });

    // expose for inline handlers
    window.galleryFunction = galleryFunction;
    
    // --- Project page hydration from partner.json (implements shorthand) ---
    function getCurrentPageNameNoExt(){
        try {
            const parts = (window.location && window.location.pathname || '').split('/').filter(Boolean);
            const last = parts.length ? parts[parts.length - 1] : '';
            return last.replace(/\.[^.]+$/, '').toLowerCase();
        } catch { return ''; }
    }

    function toTitleCaseEveryWord(str){
        if(!str || typeof str !== 'string') return '';
        return str
            .split(/\s+/)
            .map(w => {
                if(!w) return w;
                // Uppercase the first character if it's a letter; preserve the rest as-is
                const first = w.charAt(0);
                const rest = w.slice(1);
                return first.toUpperCase() + rest;
            })
            .join(' ');
    }

    function resolvePartnerJsonPath(){
        // Prefer a relative path so it works both when hosted and when opened from file://
        // If this page is under /projects/, then ../data/partner.json points to site/data/partner.json
        try {
            const p = (window.location && window.location.pathname) || '';
            if (/\/projects\//i.test(p)) return '../data/partner.json';
            // Fallbacks: try data/partner.json (same folder) else /data/partner.json (server root)
            return 'data/partner.json';
        } catch { return '../data/partner.json'; }
    }

    async function hydratePartnerProjectIfPresent(){
        const root = document.getElementById('partnerProject');
        if(!root) return; // not a partner project page
        const page = getCurrentPageNameNoExt();
        try {
            const resp = await fetch(resolvePartnerJsonPath(), { cache: 'no-store' });
            if(!resp.ok) return;
            const data = await resp.json();
            if(!Array.isArray(data)) return;
            const entry = data.find(e => e && typeof e.project === 'string' && e.project.toLowerCase() === page);
            if(!entry) return;
            const partner = typeof entry.partner === 'string' ? entry.partner : '';
            const title = typeof entry.title === 'string' ? entry.title : '';
            const role = typeof entry.role === 'string' ? entry.role : '';
            const companyRole = typeof entry.companyRole === 'string' ? entry.companyRole : '';

            // page title: "{partner} {Title}" with each word capitalized
            const pageTitleEl = document.getElementById('pageTitle');
            if(pageTitleEl){
                const displayPartner = toTitleCaseEveryWord(partner);
                const displayTitle = toTitleCaseEveryWord(title);
                pageTitleEl.textContent = [displayPartner, displayTitle].filter(Boolean).join(' ');
            }

            // partner heading
            const h3 = root.querySelector('.partner-h3 .partner');
            if(h3){ h3.textContent = partner; }

            // partner role paragraph
            const p = root.querySelector('.partner-role .partner');
            if(p){
                const sentence = `Our project with ${partner} was joint work on a ${title}. ${partner}'s role was to implement ${role}. Our role was to implement ${companyRole}.`;
                p.textContent = sentence;
            }
        } catch { /* ignore errors, leave page as-is */ }
    }

    document.addEventListener('DOMContentLoaded', hydratePartnerProjectIfPresent);

    // --- Fit-thumbnail hover behavior (implements shorthand for projects/techView.html) ---
    function getClosestProjectRow(el){
        let node = el;
        while(node){
            if(node.classList && node.classList.contains('project-row')) return node;
            node = node.parentElement;
        }
        return null;
    }

    function findThumbnailDetails(el){
        if(!el) return null;
        const row = getClosestProjectRow(el);
        if(!row) return null;
        return row.querySelector('.thumbnail-details');
    }

    function findMainSectionImg(el){
        if(!el) return null;
        const row = getClosestProjectRow(el);
        if(!row) return null;
        return row.querySelector('.section-img .img-in-section img.section');
    }

    function wireFitThumbnailHover(){
        document.querySelectorAll('.fit-thumbnail').forEach(el => {
            if(el.__fitBound) return;
            const onEnter = () => {
                // Guard against duplicate mouseenter/mouseover firings
                if(el.__hoverActive) return;
                el.__hoverActive = true;
                // If a different thumbnail is pinned for this main image, ignore hover updates
                const pinnedMain = findMainSectionImg(el);
                if(pinnedMain && pinnedMain.__pinnedThumb && pinnedMain.__pinnedThumb !== el){
                    return;
                }
                // If just unpinned, keep original visible until pointer leaves/re-enters
                if(pinnedMain && pinnedMain.__justUnpinned){
                    return;
                }
                const details = findThumbnailDetails(el);
                if(details){
                    const titleEl = details.querySelector?.('.thumbnail-h4');
                    const paraEl = details.querySelector?.('.thumbnail-paragraph');
                    // Save originals once so we can restore on mouseout
                    if(!details.__origSaved){
                        details.__origTitle = titleEl ? titleEl.textContent : '';
                        details.__origText = paraEl ? paraEl.textContent : '';
                        details.__origSaved = true;
                    }
                    const t = el.getAttribute('data-title');
                    const d = el.getAttribute('data-details');
                    if(titleEl && t !== null){ titleEl.textContent = t; }
                    if(paraEl && d !== null){ paraEl.textContent = d; }
                    details.classList.remove('thumbnail-idle-details');
                }

                // Sync the main section image's fit/position with the hovered thumbnail
                const mainImg = findMainSectionImg(el);
                if(mainImg){
                    // Cancel any pending restore scheduled by another thumbnail
                    if(mainImg.__restoreTimer){
                        clearTimeout(mainImg.__restoreTimer);
                        mainImg.__restoreTimer = null;
                    }
                    // Save original inline styles once
                    if(!mainImg.__fitSaved){
                        mainImg.__origObjectFit = mainImg.style.objectFit || '';
                        mainImg.__origObjectPosition = mainImg.style.objectPosition || '';
                        mainImg.__fitSaved = true;
                    }

                    // Read computed styles from the thumbnail (object-fit/object-position)
                    const cs = window.getComputedStyle(el);
                    const pos = cs.objectPosition || '';
                    const fit = cs.objectFit || 'cover';

                    // Enable fit mode on the main image and apply the same position
                    mainImg.classList.add('section-fit-mode');
                    if(mainImg.style.objectFit !== fit){
                        mainImg.style.objectFit = fit; // ensure cover
                    }
                    if(pos && mainImg.style.objectPosition !== pos){
                        mainImg.style.objectPosition = pos;
                    }
                    // Track which thumbnail is active for this main image
                    mainImg.__activeThumb = el;
                }
            };
            const onLeave = () => {
                if(!el.__hoverActive) return;
                el.__hoverActive = false;
                // Restore the main section image's original fit/position
                const mainImg = findMainSectionImg(el);
                const details = findThumbnailDetails(el);
                // If pinned on this row, keep details as-is and don't re-add idle class
                if(details){
                    if(!(mainImg && mainImg.__pinnedThumb)){
                        const titleEl = details.querySelector?.('.thumbnail-h4');
                        const paraEl = details.querySelector?.('.thumbnail-paragraph');
                        if(titleEl){ titleEl.textContent = details.__origTitle ?? ''; }
                        if(paraEl){ paraEl.textContent = details.__origText ?? ''; }
                        details.classList.add('thumbnail-idle-details');
                    }
                }

                if(mainImg){
                    // Delay restore slightly to allow quick moves between thumbnails without flicker
                    // Only restore if the active thumb is still this element at timeout
                    mainImg.__restoreTimer = setTimeout(() => {
                        // If pinned, do not restore
                        if(mainImg.__pinnedThumb) return;
                        if(mainImg.__activeThumb !== el) return; // another thumb took over
                        mainImg.classList.remove('section-fit-mode');
                        if(mainImg.__fitSaved){
                            mainImg.style.objectFit = mainImg.__origObjectFit || '';
                            mainImg.style.objectPosition = mainImg.__origObjectPosition || '';
                        } else {
                            mainImg.style.objectFit = '';
                            mainImg.style.objectPosition = '';
                        }
                        mainImg.__activeThumb = null;
                        mainImg.__restoreTimer = null;
                    }, 120);
                }
            };
            // Support both non-bubbling (mouseenter/leave) and bubbling (mouseover/out),
            // plus keyboard focus for accessibility
            el.addEventListener('mouseenter', onEnter);
            el.addEventListener('mouseleave', onLeave);
            el.addEventListener('mouseover', onEnter);
            el.addEventListener('mouseout', onLeave);
            el.addEventListener('focus', onEnter);
            el.addEventListener('blur', onLeave);
            el.__fitBound = true;
        });
    }

    document.addEventListener('DOMContentLoaded', wireFitThumbnailHover);

    // --- Click-to-pin behavior: clicking a thumbnail toggles a persistent selection ---
    function wireThumbnailPinToggle(){
        const applyThumbStylesToMain = (thumbEl, mainImg) => {
            if(!thumbEl || !mainImg) return;
            // Cancel any pending restore
            if(mainImg.__restoreTimer){
                clearTimeout(mainImg.__restoreTimer);
                mainImg.__restoreTimer = null;
            }
            // Save originals once
            if(!mainImg.__fitSaved){
                mainImg.__origObjectFit = mainImg.style.objectFit || '';
                mainImg.__origObjectPosition = mainImg.style.objectPosition || '';
                mainImg.__fitSaved = true;
            }
            const cs = window.getComputedStyle(thumbEl);
            const pos = cs.objectPosition || '';
            const fit = cs.objectFit || 'cover';
            mainImg.classList.add('section-fit-mode');
            if(mainImg.style.objectFit !== fit){
                mainImg.style.objectFit = fit;
            }
            if(pos && mainImg.style.objectPosition !== pos){
                mainImg.style.objectPosition = pos;
            }
            mainImg.__activeThumb = thumbEl;
        };

        const restoreMainImage = (mainImg) => {
            if(!mainImg) return;
            mainImg.classList.remove('section-fit-mode');
            if(mainImg.__fitSaved){
                mainImg.style.objectFit = mainImg.__origObjectFit || '';
                mainImg.style.objectPosition = mainImg.__origObjectPosition || '';
            } else {
                mainImg.style.objectFit = '';
                mainImg.style.objectPosition = '';
            }
            mainImg.__activeThumb = null;
        };

        document.querySelectorAll('.fit-thumbnail').forEach(el => {
            if(el.__pinBound) return;
            el.addEventListener('click', (evt) => {
                const mainImg = findMainSectionImg(el);
                if(!mainImg) return;

                const alreadyPinned = mainImg.__pinnedThumb === el;

                // If another thumb is pinned, unpin it first
                if(!alreadyPinned && mainImg.__pinnedThumb && mainImg.__pinnedThumb !== el){
                    try { mainImg.__pinnedThumb.classList.remove('thumb-pinned'); } catch {}
                    mainImg.__pinnedThumb = null;
                }

                if(alreadyPinned){
                    // Unpin: remove selection and restore image
                    el.classList.remove('thumb-pinned');
                    mainImg.__pinnedThumb = null;
                    restoreMainImage(mainImg);
                    // Restore details to original and add idle class again
                    const details = findThumbnailDetails(el);
                    if(details){
                        const titleEl = details.querySelector?.('.thumbnail-h4');
                        const paraEl = details.querySelector?.('.thumbnail-paragraph');
                        if(!details.__origSaved){
                            // capture once if needed
                            details.__origTitle = titleEl ? titleEl.textContent : '';
                            details.__origText = paraEl ? paraEl.textContent : '';
                            details.__origSaved = true;
                        }
                        if(titleEl){ titleEl.textContent = details.__origTitle ?? ''; }
                        if(paraEl){ paraEl.textContent = details.__origText ?? ''; }
                        details.classList.add('thumbnail-idle-details');
                    }
                    // Prevent immediate hover from re-applying crop until pointer leaves/re-enters
                    mainImg.__justUnpinned = true;
                    const clearFlag = () => { mainImg.__justUnpinned = false; el.removeEventListener('mouseleave', clearFlag); };
                    el.addEventListener('mouseleave', clearFlag);
                    setTimeout(() => { if(mainImg.__justUnpinned) mainImg.__justUnpinned = false; }, 250);
                } else {
                    // Pin this thumbnail
                    el.classList.add('thumb-pinned');
                    mainImg.__pinnedThumb = el;
                    applyThumbStylesToMain(el, mainImg);
                    // Ensure details stay showing this thumbnail's data
                    const details = findThumbnailDetails(el);
                    if(details){
                        const titleEl = details.querySelector?.('.thumbnail-h4');
                        const paraEl = details.querySelector?.('.thumbnail-paragraph');
                        if(!details.__origSaved){
                            details.__origTitle = titleEl ? titleEl.textContent : '';
                            details.__origText = paraEl ? paraEl.textContent : '';
                            details.__origSaved = true;
                        }
                        const t = el.getAttribute('data-title');
                        const d = el.getAttribute('data-details');
                        if(titleEl && t !== null){ titleEl.textContent = t; }
                        if(paraEl && d !== null){ paraEl.textContent = d; }
                        details.classList.remove('thumbnail-idle-details');
                    }
                }
            });
            el.__pinBound = true;
        });
    }

    document.addEventListener('DOMContentLoaded', wireThumbnailPinToggle);
})();

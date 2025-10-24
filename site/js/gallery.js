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
})();
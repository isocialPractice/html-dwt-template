// gallery
// Functions for gallery and project pages. 

(function(){
  function titleCase(str){
    return (str||'').replace(/[-_]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2')
      .split(/\s+/).filter(Boolean).map(w=>w[0]?w[0].toUpperCase()+w.slice(1).toLowerCase():w).join(' ');
  }

  function initSlides(root){
    const wrapper = root.querySelector('.gallery-slides');
    if(!wrapper) return;
    const slides = Array.from(wrapper.querySelectorAll('.slide'));
    if(slides.length === 0) return;
    let idx = 0;
    slides.forEach((s,i)=>{ s.style.display = i===0 ? 'block' : 'none'; });
    root.dataset.index = '0';

    function show(i){
      idx = (i+slides.length)%slides.length;
      root.dataset.index = String(idx);
      slides.forEach((s,j)=>{ s.style.display = j===idx ? 'block' : 'none'; });
    }

    const navs = root.closest('.slide-wrapper')?.querySelectorAll('.slide-nav .slide-arrow img');
    if(navs){
      const [left, right] = Array.from(navs);
      left && left.addEventListener('click', ()=> show(idx-1));
      right && right.addEventListener('click', ()=> show(idx+1));
    }

    wrapper.addEventListener('mouseover', e=>{
      const img = e.target.closest('.slide-img img');
      if(img){ img.classList.add('hovering'); }
    });
    wrapper.addEventListener('mouseout', e=>{
      const img = e.target.closest('.slide-img img');
      if(img){ img.classList.remove('hovering'); }
    });
  }

  function hydrateGallery(){
    document.querySelectorAll('.gallery-slide').forEach(slide => {
      // If there are no slide children but data-img present, synthesize a few slides
      const data = slide.getAttribute('data-img');
      const existing = slide.querySelectorAll('.slide');
      if(existing.length === 0 && data){
        const names = ['One','Two','Three'];
        const container = slide.querySelector('.gallery-slides') || (()=>{
          const wrap = document.createElement('div');
          wrap.className = 'gallery-slides';
          slide.appendChild(wrap);
          return wrap;
        })();
        names.forEach(n=>{
          const div = document.createElement('div');
          div.className = 'slide';
          div.innerHTML = `<div class="slide-img"><img class="slide-instance" alt="gallery slide image" src="/img/${data}${n}.png"></div>`;
          container.appendChild(div);
        });
      }
      initSlides(slide);
    });
  }

  document.addEventListener('DOMContentLoaded', hydrateGallery);
})();
